const crypto = require("crypto");
const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

/**
 * A single-use approval action sent to one person, e.g. an "Approve" button
 * in a Telegram message (#24) or a link (F10). It's bound to the workspace,
 * the post as it was when sent, the person and the action, so a stale,
 * repeated or misdirected tap can't act on anything else.
 */
const approvalLinkSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("alink") },
    tokenHash: { type: String, required: true, unique: true },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    postId: { type: String, required: true, index: true, ref: "Post" },
    actorId: { type: String, required: true, ref: "User" },
    action: { type: String, enum: ["approve", "reject"], required: true },
    // The post's status and content when the link was sent.
    expectedStatus: { type: String, required: true },
    contentHash: { type: String, required: true },
    channel: { type: String, default: "link" }, // "link" | "telegram"
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    outcome: { type: String, default: null }, // what happened when it was used
  },
  { timestamps: true }
);

const ApprovalLink = mongoose.models.ApprovalLink || mongoose.model("ApprovalLink", approvalLinkSchema);

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

/** A fingerprint of what the owner is approving: if it changes, old links stop working. */
function contentHashOf(post) {
  const c = post.content || {};
  const fingerprint = JSON.stringify([post.channel, c.title, c.body, c.mediaUrls || [], c.hashtags || [], post.scheduledAt || null]);
  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}

async function create(data) {
  // 16 random bytes = 22 characters, short enough for Telegram's 64-byte callback data.
  const token = crypto.randomBytes(16).toString("base64url");
  const doc = await ApprovalLink.create({ ...data, tokenHash: hashToken(token) });
  return { link: withId(doc.toObject()), token };
}

async function findByToken(token) {
  return withId(await ApprovalLink.findOne({ tokenHash: hashToken(token) }).lean());
}

/** Marks the link used, only if nobody used it first. Null if they did. */
async function claim(id) {
  return withId(await ApprovalLink.findOneAndUpdate({ _id: id, usedAt: null }, { usedAt: new Date() }, { new: true }).lean());
}

async function recordOutcome(id, outcome) {
  await ApprovalLink.updateOne({ _id: id }, { outcome });
}

module.exports = { ApprovalLink, hashToken, contentHashOf, create, findByToken, claim, recordOutcome };
