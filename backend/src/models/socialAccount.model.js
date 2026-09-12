const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const socialAccountSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("sa") },
    ownerId: { type: String, required: true, index: true },
    platform: { type: String, required: true },
    externalAccountId: { type: String, required: true },
    displayName: { type: String, required: true },
    accessToken: { type: String, default: null },
    linkedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const SocialAccount = mongoose.models.SocialAccount || mongoose.model("SocialAccount", socialAccountSchema);

async function list(ownerId) {
  const docs = await SocialAccount.find({ ownerId }).sort({ linkedAt: -1 }).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await SocialAccount.findById(id).lean());
}

async function create({ ownerId, platform, externalAccountId, displayName, accessToken }) {
  const doc = await SocialAccount.create({
    ownerId,
    platform,
    externalAccountId,
    displayName,
    accessToken: accessToken || null,
  });
  return withId(doc.toObject());
}

async function deleteOne({ _id, ownerId }) {
  const result = await SocialAccount.deleteOne({ _id, ownerId });
  return { deletedCount: result.deletedCount };
}

module.exports = { list, findById, create, deleteOne };
