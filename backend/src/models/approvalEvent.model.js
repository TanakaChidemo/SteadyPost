const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const approvalEventSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("appr") },
    // Null on events recorded before F10 (#07) added it.
    workspaceId: { type: String, default: null, index: true, ref: "Workspace" },
    postId: { type: String, required: true, index: true, ref: "Post" },
    actorId: { type: String, required: true, ref: "User" },
    action: {
      type: String,
      enum: ["submit", "approve", "request_changes", "reject"],
      required: true,
    },
    comment: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const ApprovalEvent =
  mongoose.models.ApprovalEvent || mongoose.model("ApprovalEvent", approvalEventSchema);

async function findByPostId(postId) {
  const docs = await ApprovalEvent.find({ postId }).sort({ timestamp: 1 }).lean();
  return docs.map(withId);
}

async function create(data) {
  const doc = await ApprovalEvent.create(data);
  return withId(doc.toObject());
}

/** The most recent event for each of `postIds`, as a Map of postId -> event. */
async function latestByPostIds(postIds) {
  if (postIds.length === 0) return new Map();
  const docs = await ApprovalEvent.aggregate([
    { $match: { postId: { $in: postIds } } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: "$postId", event: { $first: "$$ROOT" } } },
  ]);
  return new Map(docs.map((d) => [d._id, withId(d.event)]));
}

module.exports = { ApprovalEvent, findByPostId, latestByPostIds, create };
