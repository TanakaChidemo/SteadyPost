const crypto = require("crypto");
const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

/**
 * A shareable link that adds whoever opens it to a workspace as an editor or
 * viewer (F10). Only a hash of the token is stored: the link itself is shown
 * once, to the owner who creates it. Each link works once, for 7 days.
 */
const invitationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("inv") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    role: { type: String, enum: ["editor", "viewer"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    // Who the owner meant it for, e.g. "Sam (weekend help)". Only a reminder.
    label: { type: String, default: "", trim: true },
    createdBy: { type: String, required: true, ref: "User" },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: String, default: null, ref: "User" },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Invitation = mongoose.models.Invitation || mongoose.model("Invitation", invitationSchema);

const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

/** Creates an invitation and returns it with its one-time `token`. */
async function create({ workspaceId, role, label = "", createdBy }) {
  const token = crypto.randomBytes(24).toString("base64url");
  const doc = await Invitation.create({
    workspaceId,
    role,
    label,
    createdBy,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + LIFETIME_MS),
  });
  return { invitation: withId(doc.toObject()), token };
}

/** The invitation for `token` if it can still be used, else null. */
async function findUsable(token) {
  return withId(
    await Invitation.findOne({
      tokenHash: hashToken(token),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean()
  );
}

/** Marks it used by `userId`, only if nobody used it first. Null if they did. */
async function claim(id, userId) {
  return withId(
    await Invitation.findOneAndUpdate(
      { _id: id, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
      { acceptedBy: userId, acceptedAt: new Date() },
      { new: true }
    ).lean()
  );
}

async function listPending(workspaceId) {
  const docs = await Invitation.find({
    workspaceId,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
  return docs.map(withId);
}

async function revoke(id, workspaceId) {
  return withId(
    await Invitation.findOneAndUpdate(
      { _id: id, workspaceId, acceptedAt: null, revokedAt: null },
      { revokedAt: new Date() },
      { new: true }
    ).lean()
  );
}

module.exports = { Invitation, hashToken, create, findUsable, claim, listPending, revoke };
