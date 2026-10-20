const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const inquirySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("inq") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    postId: { type: String, default: null, index: true, ref: "Post" },
    smartLinkId: { type: String, default: null, ref: "SmartLink" },
    contactName: { type: String, default: "" },
    contactMethod: {
      type: String,
      enum: ["email", "phone", "form", "direct_message"],
      default: "form",
    },
    message: { type: String, default: "" },
    type: { type: String, enum: ["inquiry", "order"], default: "inquiry" },
    status: {
      type: String,
      enum: ["new", "contacted", "converted"],
      default: "new",
      index: true,
    },
    value: { type: Number, default: null },
  },
  { timestamps: true }
);

const Inquiry = mongoose.models.Inquiry || mongoose.model("Inquiry", inquirySchema);

async function findByWorkspaceId(workspaceId, { status, limit = 50 } = {}) {
  const query = { workspaceId };
  if (status) query.status = status;
  const docs = await Inquiry.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await Inquiry.findById(id).lean());
}

async function create(data) {
  const doc = await Inquiry.create(data);
  return withId(doc.toObject());
}

async function updateById(id, updates) {
  return withId(await Inquiry.findByIdAndUpdate(id, updates, { new: true }).lean());
}

module.exports = { Inquiry, findByWorkspaceId, findById, create, updateById };
