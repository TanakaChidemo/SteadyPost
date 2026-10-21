const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const smartLinkSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("sl") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    postId: { type: String, required: true, index: true, ref: "Post" },
    shortSlug: { type: String, required: true, unique: true },
    destinationUrl: { type: String, required: true },
    clickCount: { type: Number, default: 0 },
    formSubmissionCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const SmartLink = mongoose.models.SmartLink || mongoose.model("SmartLink", smartLinkSchema);

async function findByPostId(postId) {
  const docs = await SmartLink.find({ postId }).lean();
  return docs.map(withId);
}

async function findBySlug(shortSlug) {
  return withId(await SmartLink.findOne({ shortSlug }).lean());
}

async function create(data) {
  const doc = await SmartLink.create(data);
  return withId(doc.toObject());
}

async function incrementClick(shortSlug) {
  return withId(
    await SmartLink.findOneAndUpdate(
      { shortSlug },
      { $inc: { clickCount: 1 } },
      { new: true }
    ).lean()
  );
}

async function incrementSubmission(id) {
  return withId(
    await SmartLink.findByIdAndUpdate(
      id,
      { $inc: { formSubmissionCount: 1 } },
      { new: true }
    ).lean()
  );
}

module.exports = { SmartLink, findByPostId, findBySlug, create, incrementClick, incrementSubmission };
