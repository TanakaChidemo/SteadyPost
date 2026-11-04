const approvalLinkModel = require("../models/approvalLink.model");
const postModel = require("../models/post.model");
const membershipModel = require("../models/membership.model");
const workspaceModel = require("../models/workspace.model");
const { applyApprovalAction, ApprovalError } = require("./approval.service");

const LIFETIME_MS = 48 * 60 * 60 * 1000;

/**
 * Issues a single-use approval action for `actorId` on a post waiting for
 * approval. Returns the token to put in a link or a Telegram button.
 */
async function issue({ workspaceId, postId, actorId, action, channel = "link" }) {
  const post = await postModel.findById(postId);
  if (!post || post.workspaceId !== workspaceId) throw new ApprovalError(404, "NOT_FOUND", "Post not found");
  if (post.status !== "pending_approval") {
    throw new ApprovalError(409, "INVALID_STATUS", "Only posts waiting for approval can be sent for a one-tap decision.");
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
 * Uses a single-use approval action. `actorId` is who is using it (the signed-in
 * user, or the Telegram user linked to an account). The action always applies
 * to the workspace and post the link was issued for, whatever business the
 * person currently has open.
 *
 * Returns { outcome, post } where outcome is "done" or "already_used". A
 * repeated tap is not an error: it reports what already happened and changes
 * nothing. Anything else that's wrong throws ApprovalError and changes nothing.
 */
async function redeem({ token, actorId }) {
  const link = token && (await approvalLinkModel.findByToken(token));
  if (!link) throw new ApprovalError(404, "INVALID_LINK", "This approval link isn't valid.");
  if (link.actorId !== actorId) throw new ApprovalError(403, "WRONG_PERSON", "This approval link was sent to someone else.");

  if (link.usedAt) {
    return { outcome: "already_used", post: await postModel.findById(link.postId), previousOutcome: link.outcome };
  }
  if (link.expiresAt < new Date()) throw new ApprovalError(410, "EXPIRED", "This approval link has expired. Open the post to decide.");

  // Claim it first, so two taps at the same moment act once.
  if (!(await approvalLinkModel.claim(link.id))) {
    return { outcome: "already_used", post: await postModel.findById(link.postId) };
  }

  try {
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
    await approvalLinkModel.recordOutcome(link.id, err.code || "error");
    throw err;
  }
}

module.exports = { issue, redeem };
