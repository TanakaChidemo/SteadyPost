const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const websiteConnectionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("web") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    url: { type: String, required: true },
    lastSyncedTime: { type: Date, default: null },
    scrapedFields: {
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      hours: { type: String, default: "" },
      services: { type: [String], default: [] },
      logoUrl: { type: String, default: "" },
      rawSummary: { type: String, default: "" },
    },
    contentFeedUrl: { type: String, default: null },
    syncStatus: { type: String, enum: ["idle", "syncing", "success", "failed"], default: "idle" },
  },
  { timestamps: true }
);

const WebsiteConnection =
  mongoose.models.WebsiteConnection || mongoose.model("WebsiteConnection", websiteConnectionSchema);

async function findByWorkspaceId(workspaceId) {
  const docs = await WebsiteConnection.find({ workspaceId }).sort({ createdAt: -1 }).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await WebsiteConnection.findById(id).lean());
}

async function create(data) {
  const doc = await WebsiteConnection.create(data);
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await WebsiteConnection.findByIdAndUpdate(id, updates, { new: true }).lean());
}

async function deleteOne(query) {
  return WebsiteConnection.deleteOne(query);
}

module.exports = { WebsiteConnection, findByWorkspaceId, findById, create, updateById, deleteOne };
