const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const socialAccountSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("sa") },
    workspaceId: { type: String, default: null, index: true },
    ownerId: { type: String, default: null, index: true },
    platform: { type: String, required: true },
    externalAccountId: { type: String, required: true },
    displayName: { type: String, required: true },
    accessToken: { type: String, default: null },
    isVerified: { type: Boolean, default: true },
    verificationState: {
      type: String,
      enum: ["VERIFIED", "UNVERIFIED", "PENDING_VERIFICATION"],
      default: "VERIFIED",
    },
    linkedBy: { type: String, default: null },
    linkedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const SocialAccount = mongoose.models.SocialAccount || mongoose.model("SocialAccount", socialAccountSchema);

async function list(filter) {
  const query = typeof filter === "string" ? { $or: [{ workspaceId: filter }, { ownerId: filter }] } : filter;
  const docs = await SocialAccount.find(query).sort({ linkedAt: -1 }).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await SocialAccount.findById(id).lean());
}

async function create({
  workspaceId,
  ownerId,
  platform,
  externalAccountId,
  displayName,
  accessToken,
  linkedBy,
  isVerified = true,
  verificationState = "VERIFIED",
}) {
  const isGbp = platform === "gbp" || platform === "google_business" || platform === "google";
  const effectiveState = verificationState || (isVerified === false ? "UNVERIFIED" : "VERIFIED");
  const effectiveVerified = isGbp ? effectiveState === "VERIFIED" : (isVerified !== false && effectiveState !== "UNVERIFIED");

  const doc = await SocialAccount.create({
    workspaceId: workspaceId || null,
    ownerId: ownerId || null,
    platform,
    externalAccountId,
    displayName,
    accessToken: accessToken || null,
    linkedBy: linkedBy || null,
    isVerified: effectiveVerified,
    verificationState: effectiveState,
  });
  return withId(doc.toObject());
}

async function deleteOne(filter) {
  const result = await SocialAccount.deleteOne(filter);
  return { deletedCount: result.deletedCount };
}

module.exports = { SocialAccount, list, findById, create, deleteOne };
