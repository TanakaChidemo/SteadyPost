const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const approvalEventSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("appr") },
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

module.exports = { ApprovalEvent, findByPostId, create };
