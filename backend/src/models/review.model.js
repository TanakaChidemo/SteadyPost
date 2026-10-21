const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const reviewSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("rev") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    source: { type: String, enum: ["google", "facebook", "trustpilot"], default: "google" },
    externalId: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, default: "" },
    reviewerName: { type: String, default: "" },
    sentiment: { type: String, enum: ["positive", "neutral", "negative"], default: "neutral" },
    extractedTopics: { type: [String], default: [] },
    replyStatus: { type: String, enum: ["unreplied", "drafted", "replied"], default: "unreplied" },
    convertedToPostId: { type: String, default: null, ref: "Post" },
  },
  { timestamps: true }
);

reviewSchema.index({ workspaceId: 1, externalId: 1 }, { unique: true });

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);

async function findByWorkspaceId(workspaceId, { sentiment, replyStatus, limit = 50 } = {}) {
  const query = { workspaceId };
  if (sentiment) query.sentiment = sentiment;
  if (replyStatus) query.replyStatus = replyStatus;
  const docs = await Review.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await Review.findById(id).lean());
}

async function create(data) {
  const doc = await Review.create(data);
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await Review.findByIdAndUpdate(id, updates, { new: true }).lean());
}

module.exports = { Review, findByWorkspaceId, findById, create, updateById };
