const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const opportunitySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("opp") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    triggerType: { type: String, required: true },
    sourceReference: {
      entityType: { type: String, default: null },
      entityId: { type: String, default: null },
      snippet: { type: String, default: "" },
    },
    relevanceScore: { type: Number, default: 0.0, min: 0.0, max: 1.0 },
    sensitivityFlag: { type: Boolean, default: false },
    linkedDraftId: { type: String, default: null, ref: "Post" },
    sentTime: { type: Date, default: null },
    ownerResponse: {
      type: String,
      enum: ["approved", "edited", "skipped", "snoozed", "not_relevant", "ignored", null],
      default: null,
      index: true,
    },
    responseTime: { type: Date, default: null },
    feedbackNote: { type: String, default: null },
  },
  { timestamps: true }
);

const Opportunity = mongoose.models.Opportunity || mongoose.model("Opportunity", opportunitySchema);

async function findByWorkspaceId(workspaceId, { response, limit = 50 } = {}) {
  const query = { workspaceId };
  if (response !== undefined) query.ownerResponse = response;
  const docs = await Opportunity.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function findById(id) {
  return withId(await Opportunity.findById(id).lean());
}

async function create(data) {
  const doc = await Opportunity.create(data);
  return withId(doc.toObject());
}

async function recordResponse(id, { response, feedbackNote, linkedDraftId }) {
  const updates = {
    ownerResponse: response,
    responseTime: new Date(),
  };
  if (feedbackNote) updates.feedbackNote = feedbackNote;
  if (linkedDraftId) updates.linkedDraftId = linkedDraftId;

  return withId(await Opportunity.findByIdAndUpdate(id, updates, { new: true }).lean());
}

module.exports = { Opportunity, findByWorkspaceId, findById, create, recordResponse };
