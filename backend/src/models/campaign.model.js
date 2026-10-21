const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const campaignSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("camp") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    name: { type: String, required: true, trim: true },
    goal: { type: String, default: "" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["planning", "active", "completed", "paused"],
      default: "planning",
      index: true,
    },
    budget: { type: Number, default: null },
  },
  { timestamps: true }
);

const Campaign = mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);

async function findByWorkspaceId(workspaceId, status) {
  const query = { workspaceId };
  if (status) query.status = status;
  const docs = await Campaign.find(query).sort({ createdAt: -1 }).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await Campaign.findById(id).lean());
}

async function create(data) {
  const doc = await Campaign.create(data);
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await Campaign.findByIdAndUpdate(id, updates, { new: true }).lean());
}

async function deleteOne(query) {
  return Campaign.deleteOne(query);
}

module.exports = { Campaign, findByWorkspaceId, findById, create, updateById, deleteOne };
