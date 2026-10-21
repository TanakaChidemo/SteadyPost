const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const membershipSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("mem") },
    workspaceId: { type: String, required: true, ref: "Workspace", index: true },
    userId: { type: String, default: null, ref: "User", index: true },
    invitedEmail: { type: String, default: null, lowercase: true, trim: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
    status: { type: String, enum: ["invited", "active", "removed"], default: "active", index: true },
    invitedBy: { type: String, default: null, ref: "User" },
    inviteToken: { type: String, default: null, sparse: true },
    inviteExpiresAt: { type: Date, default: null },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true, sparse: true });
membershipSchema.index({ workspaceId: 1, invitedEmail: 1 });

const Membership = mongoose.models.Membership || mongoose.model("Membership", membershipSchema);

async function findById(id) {
  return withId(await Membership.findById(id).lean());
}

async function findOne(query) {
  return withId(await Membership.findOne(query).lean());
}

async function find(query = {}) {
  const docs = await Membership.find(query).lean();
  return docs.map(withId);
}

async function findByUserAndWorkspace(userId, workspaceId) {
  return withId(await Membership.findOne({ userId, workspaceId, status: "active" }).lean());
}

async function listUserWorkspaces(userId) {
  const memberships = await Membership.find({ userId, status: "active" }).lean();
  return memberships.map(withId);
}

async function listWorkspaceMembers(workspaceId) {
  const docs = await Membership.find({ workspaceId }).sort({ createdAt: 1 }).lean();
  return docs.map(withId);
}

async function create(data) {
  const doc = await Membership.create(data);
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await Membership.findByIdAndUpdate(id, updates, { new: true }).lean());
}

async function deleteOne(query) {
  return Membership.deleteOne(query);
}

module.exports = {
  Membership,
  findById,
  findOne,
  find,
  findByUserAndWorkspace,
  listUserWorkspaces,
  listWorkspaceMembers,
  create,
  updateById,
  deleteOne,
};
