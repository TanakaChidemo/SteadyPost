const mongoose = require("mongoose");
const { newId } = require("../utils/id");

const versionSchema = new mongoose.Schema(
  { body: String, editedAt: Date, editedBy: String },
  { _id: false }
);

const contentDraftSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("draft") },
    ownerId: { type: String, required: true, index: true },
    title: { type: String, default: "Untitled Draft" },
    body: { type: String, default: "" },
    platforms: { type: [String], default: [] },
    mediaUrls: { type: [String], default: [] },
    status: { type: String, default: "draft" },
    aiMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    versions: { type: [versionSchema], default: [] },
  },
  { timestamps: true, minimize: false }
);

const ContentDraft = mongoose.models.ContentDraft || mongoose.model("ContentDraft", contentDraftSchema);

async function find({ ownerId } = {}) {
  const query = ownerId ? { ownerId } : {};
  return ContentDraft.find(query).lean();
}

async function findOne({ _id, ownerId } = {}) {
  const query = {};
  if (_id) query._id = _id;
  if (ownerId) query.ownerId = ownerId;
  return ContentDraft.findOne(query).lean();
}

async function findById(id) {
  return ContentDraft.findById(id).lean();
}

async function create(data) {
  const draft = await ContentDraft.create({
    title: data.title || "Untitled Draft",
    body: data.body || "",
    platforms: data.platforms || [],
    mediaUrls: data.mediaUrls || [],
    status: data.status || "draft",
    aiMetadata: data.aiMetadata || {},
    versions: data.versions || [],
    ownerId: data.ownerId,
  });
  return draft.toObject();
}

// Mutates a draft object in place and persists it — mirrors how the
// controller calls `ContentDraft.save(draft)` on a plain object it already
// has a reference to (a lean() result, not a Mongoose document).
async function save(draft) {
  const { _id, createdAt, updatedAt, __v, ...rest } = draft;
  const updated = await ContentDraft.findByIdAndUpdate(_id, rest, { new: true, lean: true });
  Object.assign(draft, updated);
  return draft;
}

async function deleteOne({ _id, ownerId } = {}) {
  const query = {};
  if (_id) query._id = _id;
  if (ownerId) query.ownerId = ownerId;
  const result = await ContentDraft.deleteOne(query);
  return { deletedCount: result.deletedCount };
}

module.exports = { find, findOne, findById, create, save, deleteOne };
