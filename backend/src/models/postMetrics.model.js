const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const postMetricsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("pm") },
    postId: { type: String, required: true, index: true, ref: "Post" },
    captureTime: { type: Date, default: Date.now, index: true },
    reach: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const PostMetrics = mongoose.models.PostMetrics || mongoose.model("PostMetrics", postMetricsSchema);

async function findByPostId(postId, { limit = 30 } = {}) {
  const docs = await PostMetrics.find({ postId }).sort({ captureTime: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function getLatestByPostId(postId) {
  return withId(await PostMetrics.findOne({ postId }).sort({ captureTime: -1 }).lean());
}

async function create(data) {
  const doc = await PostMetrics.create(data);
  return withId(doc.toObject());
}

module.exports = { PostMetrics, findByPostId, getLatestByPostId, create };
