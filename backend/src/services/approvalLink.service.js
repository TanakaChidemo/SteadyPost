const approvalLinkModel = require("../models/approvalLink.model");
const postModel = require("../models/post.model");
const membershipModel = require("../models/membership.model");
const workspaceModel = require("../models/workspace.model");
const { can } = require("../auth/permissions");
const { applyApprovalAction, ApprovalError } = require("./approval.service");

const LIFETIME_MS = 48 * 60 * 60 * 1000;

/** What a link may decide (see ApprovalLink.action), and the permission each needs. */
const LINK_ACTIONS = { approve: "post.review", reject: "post.review" };

/**
 * Issues a single-use approval action for `actorId` on a post waiting for
 * approval. Returns the token to put in a link or a Telegram button.
 *
 * Only someone who may make that decision in the post's business gets one,
 * whoever asks for it to be sent (a notification worker, Telegram, ...).
 */
async function issue({ workspaceId, postId, actorId, action, channel = "link" }) {
  const permission = LINK_ACTIONS[action];
  if (!permission) throw new ApprovalError(400, "UNKNOWN_ACTION", `Unknown approval action: ${action}`);

  const post = await postModel.findById(postId);
  if (!post || post.workspaceId !== workspaceId) throw new ApprovalError(404, "NOT_FOUND", "Post not found");
  if (post.status !== "pending_approval") {
    throw new ApprovalError(409, "INVALID_STATUS", "Only posts waiting for approval can be sent for a one-tap decision.");
  }
  const membership = actorId && (await membershipModel.findByUserAndWorkspace(actorId, workspaceId));
  if (!membership || !can(membership.role, permission)) {
    throw new ApprovalError(403, "FORBIDDEN", "Approval links only go to someone who can make that decision.");
  }

  const { token } = await approvalLinkModel.create({
    workspaceId,
    postId,
    actorId,
    action,
    channel,
    expectedStatus: post.status,
    contentHash: approvalLinkModel.contentHashOf(post),
    expiresAt: new Date(Date.now() + LIFETIME_MS),
  });
  return token;
}

/**
 * Checks a link can still be used by `actorId` right now, without changing
 * anything. Returns the person's membership. Throws ApprovalError otherwise.
 */
async function checkUsable(link, actorId) {
  if (link.expiresAt < new Date()) throw new ApprovalError(410, "EXPIRED", "This approval link has expired. Open the post to decide.");
  if (!(await workspaceModel.filterActiveIds([link.workspaceId])).length) {
    throw new ApprovalError(404, "NOT_FOUND", "This business is no longer on SteadyPost.");
  }
  const membership = await membershipModel.findByUserAndWorkspace(actorId, link.workspaceId);
  if (!membership) throw new ApprovalError(403, "FORBIDDEN", "You're no longer on this team.");

  const post = await postModel.findById(link.postId);
  if (!post || post.workspaceId !== link.workspaceId) throw new ApprovalError(404, "NOT_FOUND", "Post not found");
  if (approvalLinkModel.contentHashOf(post) !== link.contentHash) {
    throw new ApprovalError(409, "STALE", "This post was changed after the link was sent. Open it to see the new version.");
  }
  return membership;
}

/**
 * Uses a single-use approval action. `actorId` is who is using it (the signed-in
 * user, or the Telegram user linked to an account). The action always applies
 * to the workspace and post the link was issued for, whatever business the
 * person currently has open.
 *
 * Returns { outcome, post } where outcome is "done" or "already_used". A
 * repeated tap after the decision was made is not an error: it reports what
 * happened and changes nothing. Anything else that's wrong throws ApprovalError,
 * changes nothing and leaves the link as it was, so tapping again gets the same
 * answer. Only a decision that's made uses the link up.
 */
async function redeem({ token, actorId }) {
  const link = token && (await approvalLinkModel.findByToken(token));
  if (!link) throw new ApprovalError(404, "INVALID_LINK", "This approval link isn't valid.");
  if (link.actorId !== actorId) throw new ApprovalError(403, "WRONG_PERSON", "This approval link was sent to someone else.");

  if (link.usedAt) return alreadyUsed(link);
  await checkUsable(link, actorId);

  // Claim it, so two taps at the same moment act once.
  if (!(await approvalLinkModel.claim(link.id))) {
    return alreadyUsed(await approvalLinkModel.findByToken(token));
  }

  try {
    // Checked again now it's ours: the post may have changed in between.
    const membership = await checkUsable(link, actorId);
    const result = await applyApprovalAction({
      workspaceId: link.workspaceId,
      postId: link.postId,
      actorId,
      role: membership.role,
      action: link.action,
      expectedStatus: link.expectedStatus,
      comment: link.channel === "telegram" ? "Decided in Telegram" : "Decided from an approval link",
    });
    await approvalLinkModel.recordOutcome(link.id, link.action);
    return { outcome: "done", post: result.post };
  } catch (err) {
    await approvalLinkModel.release(link.id, err.code || "error");
    throw err;
  }
}

/**
 * A tap on a link that's been used. If another tap is still making the
 * decision, says so rather than reporting a result that hasn't happened.
 */
async function alreadyUsed(link) {
  if (link.usedAt && !link.outcome) {
    throw new ApprovalError(409, "IN_PROGRESS", "This decision is being made right now. Refresh in a moment to see it.");
  }
  if (!link.usedAt) {
    // The other tap failed and gave the link back: its refusal applies to this one too.
    throw new ApprovalError(409, "TRY_AGAIN", "This link couldn't be used just now. Tap it again.");
  }
  return { outcome: "already_used", post: await postModel.findById(link.postId), previousOutcome: link.outcome };
}

module.exports = { issue, redeem };
