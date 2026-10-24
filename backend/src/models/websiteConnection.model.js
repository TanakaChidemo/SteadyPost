const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

// One website per workspace (F24, #03.1). `scrapedFields` keeps the shape
// extractProfile returns, so onboarding (#04.1) can prefill from it directly.
const websiteConnectionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("web") },
    workspaceId: { type: String, required: true, unique: true, ref: "Workspace" },
    url: { type: String, required: true },
    lastSyncedTime: { type: Date, default: null },
    found: { type: Boolean, default: false },
    scrapedFields: {
      name: { type: String, default: null },
      description: { type: String, default: null },
      // { streetAddress, locality, region, postalCode, country, formatted }
      address: { type: mongoose.Schema.Types.Mixed, default: null },
      // [{ days: [String], opens, closes }] or [{ raw }]
      hours: { type: mongoose.Schema.Types.Mixed, default: null },
      services: { type: [String], default: null },
      logo: { type: String, default: null },
    },
    // Where each found field came from: json-ld, microdata, open-graph, html
    sources: { type: mongoose.Schema.Types.Mixed, default: {} },
    contentFeedUrl: { type: String, default: null },
  },
  { timestamps: true, minimize: false }
);

const WebsiteConnection =
  mongoose.models.WebsiteConnection || mongoose.model("WebsiteConnection", websiteConnectionSchema);

async function findByWorkspaceId(workspaceId) {
  return withId(await WebsiteConnection.findOne({ workspaceId }).lean());
}

async function upsertForWorkspace(workspaceId, data) {
  const doc = await WebsiteConnection.findOneAndUpdate(
    { workspaceId },
    { $set: data },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  return withId(doc);
}

async function deleteOne(query) {
  return WebsiteConnection.deleteOne(query);
}

module.exports = { WebsiteConnection, findByWorkspaceId, upsertForWorkspace, deleteOne };
