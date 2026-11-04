const postModel = require("../models/post.model");
const approvalEventModel = require("../models/approvalEvent.model");
const { can, refusalMessage } = require("../auth/permissions");
const { enqueuePublishJob } = require("../queue");
const { validateAccountWorkspaceOwnership } = require("../utils/workspaceValidation");
const guardrailsService = require("./guardrails/guardrailsService");

/**
 * The approval workflow (F10), shared by every channel that can act on a post:
 * the app's buttons today, single-use approval links and Telegram (#24) later.
 * Each action is a status change that's only allowed from certain statuses.
 */
const ACTIONS = {
  submit: { from: ["draft", "changes_requested", "rejected"], permission: "post.submit" },
  approve: { from: ["pending_approval"], permission: "post.review" },
  request_changes: { from: ["pending_approval"], permission: "post.review", needsComment: true },
  reject: { from: ["pending_approval"], permission: "post.review" },
};

const MAX_COMMENT = 1000;

const ACTION_WORDS = {
  submit: "submitted for approval",
  approve: "approved",
  request_changes: "sent back for changes",
  reject: "rejected",
};

class ApprovalError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function nextStatus(action, post) {
  if (action === "submit") return "pending_approval";
  if (action === "approve") return post.scheduledAt ? "scheduled" : "approved";
  if (action === "request_changes") return "changes_requested";
  return "rejected";
}

/**
 * Applies `action` to a post on behalf of a workspace member.
 *
 * `expectedStatus`, when given, is the status the actor saw (e.g. when an
 * approval link was sent). If the post has moved on since, nothing happens,
 * so a stale or repeated tap can't approve something different.
 *
 * Throws ApprovalError (status 400/403/404/409) instead of changing anything.
 */
async function applyApprovalAction({ workspaceId, postId, actorId, role, action, comment = "", expectedStatus }) {
  const rule = ACTIONS[action];
  if (!rule) throw new ApprovalError(400, "UNKNOWN_ACTION", `Unknown approval action: ${action}`);

  const post = await postModel.findById(postId);
  if (!post || post.workspaceId !== workspaceId) {
    throw new ApprovalError(404, "NOT_FOUND", "Post not found");
  }
  if (!can(role, rule.permission)) {
    throw new ApprovalError(403, "FORBIDDEN", refusalMessage(rule.permission));
  }
  if (expectedStatus && post.status !== expectedStatus) {
    throw new ApprovalError(409, "STALE", `This post has changed since then: it's now ${post.status.replace(/_/g, " ")}.`);
  }
  if (!rule.from.includes(post.status)) {
    throw new ApprovalError(
      409,
      "INVALID_STATUS",
      `This post is ${post.status.replace(/_/g, " ")}, so it can't be ${ACTION_WORDS[action]}.`
    );
  }

  const note = String(comment || "").trim().slice(0, MAX_COMMENT);
  if (rule.needsComment && !note) {
    throw new ApprovalError(400, "COMMENT_REQUIRED", "Please say what needs to change.");
  }

  if (action === "approve" && post.socialAccountId) {
    try {
      await validateAccountWorkspaceOwnership({ socialAccountId: post.socialAccountId, workspaceId, userId: actorId });
    } catch (err) {
      throw new ApprovalError(err.status || 403, "ACCOUNT", err.message);
    }
  }

  // F09: a post goes to the approver with its brand guardrail check. Drafts
  // saved before guardrails existed are checked now.
  const changes = { status: nextStatus(action, post) };
  let guardrails = null;
  if (action === "submit") {
    guardrails = post.aiMetadata?.guardrails;
    if (!guardrails) {
      guardrails = await guardrailsService.auditDraft({
        content: post.content?.body || "",
        channel: post.channel || "instagram",
        mediaUrls: post.content?.mediaUrls || [],
        hashtags: post.content?.hashtags || [],
        workspaceId,
      });
      changes.aiMetadata = { ...(post.aiMetadata || {}), guardrails };
    }
  }

  // Only changes the post if it's still in the status we checked, so two
  // approvals racing each other (or a doubled tap) apply once.
  const updated = await postModel.updateIfStatus(post.id, post.status, changes);
  if (!updated) {
    throw new ApprovalError(409, "STALE", "Someone else changed this post at the same moment. Refresh and try again.");
  }

  const event = await approvalEventModel.create({ workspaceId, postId: post.id, actorId, action, comment: note });

  if (action === "approve" && updated.scheduledAt) {
    await enqueuePublishJob(
      {
        postId: updated.id,
        platform: updated.channel,
        contentDraftId: updated.id,
        socialAccountId: updated.socialAccountId || null,
        workspaceId,
        content: updated.content?.body || "",
        mediaUrls: updated.content?.mediaUrls || [],
        hashtags: updated.content?.hashtags || [],
      },
      { delay: Math.max(0, new Date(updated.scheduledAt).getTime() - Date.now()) }
    );
  }

  const guardrailsWarning =
    guardrails && !guardrails.passed
      ? `Post has ${guardrails.violations?.length || 1} brand guardrail violation(s) requiring approver review.`
      : null;

  return { post: updated, event, guardrailsWarning };
}

module.exports = { ACTIONS, ApprovalError, applyApprovalAction };
