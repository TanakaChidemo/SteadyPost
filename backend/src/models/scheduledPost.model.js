const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const scheduledPostSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("post") },
    ownerId: { type: String, required: true, index: true },
    contentDraftId: { type: String, required: true },
    platform: { type: String, required: true },
    socialAccountId: { type: String, default: null },
    scheduledAt: { type: Date, default: Date.now },
    status: { type: String, default: "publishing" },
    externalPostId: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false }
);

const ScheduledPost = mongoose.models.ScheduledPost || mongoose.model("ScheduledPost", scheduledPostSchema);

async function create(data) {
  const doc = await ScheduledPost.create(data);
  return withId(doc.toObject());
}

async function findOne({ id, ownerId } = {}) {
  const query = {};
  if (id) query._id = id;
  if (ownerId) query.ownerId = ownerId;
  return withId(await ScheduledPost.findOne(query).lean());
}

async function updateById(id, updates) {
  return withId(await ScheduledPost.findByIdAndUpdate(id, updates, { new: true }).lean());
}

module.exports = { create, findOne, updateById };
