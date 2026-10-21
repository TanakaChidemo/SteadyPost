const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const workspaceSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("ws") },
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    ownerId: { type: String, required: true, ref: "User", index: true },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
  },
  { timestamps: true }
);

const Workspace = mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);

async function findById(id) {
  return withId(await Workspace.findById(id).lean());
}

async function findOne(query) {
  return withId(await Workspace.findOne(query).lean());
}

async function find(query = {}) {
  const docs = await Workspace.find(query).lean();
  return docs.map(withId);
}

async function create({ name, slug, ownerId, status = "active" }) {
  const doc = await Workspace.create({ name, slug, ownerId, status });
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await Workspace.findByIdAndUpdate(id, updates, { new: true }).lean());
}

async function deleteOne(query) {
  return Workspace.deleteOne(query);
}

module.exports = { Workspace, findById, findOne, find, create, updateById, deleteOne };
