const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const predictionRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("pred") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    postId: { type: String, required: true, index: true, ref: "Post" },
    modelVersion: { type: String, required: true },
    predictedScore: { type: Number, required: true },
    featureSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    actualScore: { type: Number, default: null },
    evaluationDelta: { type: Number, default: null },
    evaluatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const PredictionRecord =
  mongoose.models.PredictionRecord || mongoose.model("PredictionRecord", predictionRecordSchema);

async function findByPostId(postId) {
  const docs = await PredictionRecord.find({ postId }).sort({ createdAt: -1 }).lean();
  return docs.map(withId);
}

async function findByWorkspaceId(workspaceId, { limit = 100 } = {}) {
  const docs = await PredictionRecord.find({ workspaceId }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function create(data) {
  const doc = await PredictionRecord.create(data);
  return withId(doc.toObject());
}

async function updateActualScore(id, actualScore) {
  const record = await PredictionRecord.findById(id);
  if (!record) return null;
  record.actualScore = actualScore;
  record.evaluationDelta = actualScore - record.predictedScore;
  record.evaluatedAt = new Date();
  await record.save();
  return withId(record.toObject());
}

module.exports = { PredictionRecord, findByPostId, findByWorkspaceId, create, updateActualScore };
