const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const versionSchema = new mongoose.Schema(
  {
    body: { type: String, default: "" },
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: String, default: null },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("post") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    campaignId: { type: String, default: null, index: true, ref: "Campaign" },
    authorId: { type: String, required: true, ref: "User" },
    channel: { type: String, required: true },
    socialAccountId: { type: String, default: null, ref: "SocialAccount" },
    content: {
      title: { type: String, default: "Untitled Post" },
      body: { type: String, default: "" },
      mediaUrls: { type: [String], default: [] },
      hashtags: { type: [String], default: [] },
    },
    status: {
      type: String,
      enum: [
        "draft",
        "pending_approval",
        "changes_requested",
        "approved",
        "scheduled",
        "published",
        "failed",
      ],
      default: "draft",
      index: true,
    },
    scheduledAt: { type: Date, default: null, index: true },
    publishedAt: { type: Date, default: null },
    origin: {
      type: String,
      enum: ["manual", "campaign", "opportunity"],
      default: "manual",
    },
    externalPostId: { type: String, default: null },
    errorMessage: { type: String, default: null },
    aiMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    versions: { type: [versionSchema], default: [] },
  },
  { timestamps: true }
);

postSchema.index({ workspaceId: 1, status: 1 });
postSchema.index({ workspaceId: 1, scheduledAt: 1 });

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);

async function findByWorkspaceId(workspaceId, { status, campaignId, limit = 100 } = {}) {
  const query = { workspaceId };
  if (status) query.status = status;
  if (campaignId) query.campaignId = campaignId;
  const docs = await Post.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await Post.findById(id).lean());
}

async function findOne(query) {
  return withId(await Post.findOne(query).lean());
}

async function create(data) {
  const doc = await Post.create(data);
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await Post.findByIdAndUpdate(id, updates, { new: true }).lean());
}

async function deleteOne(query) {
  return Post.deleteOne(query);
}

async function createMany(items) {
  const docs = await Post.insertMany(items);
  return docs.map((d) => withId(d.toObject()));
}

module.exports = {
  Post,
  findByWorkspaceId,
  findById,
  findOne,
  create,
  createMany,
  updateById,
  deleteOne,
};
