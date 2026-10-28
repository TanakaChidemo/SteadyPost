const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const businessProfileSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("bp") },
    workspaceId: { type: String, required: true, unique: true, ref: "Workspace", index: true },
    businessType: { type: String, default: "" },
    websiteUrl: { type: String, default: "", trim: true },
    offer: { type: String, default: "" },
    audience: { type: String, default: "" },
    location: {
      city: { type: String, default: "" },
      region: { type: String, default: "" },
      country: { type: String, default: "" },
      serviceArea: { type: String, default: "" },
    },
    tone: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    activeChannels: { type: [String], default: [] },
    // Set when the onboarding wizard is finished (#04). Null means the
    // workspace still needs onboarding; see isOnboardingComplete.
    onboardingCompletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const BusinessProfile = mongoose.models.BusinessProfile || mongoose.model("BusinessProfile", businessProfileSchema);

async function findByWorkspaceId(workspaceId) {
  return withId(await BusinessProfile.findOne({ workspaceId }).lean());
}

async function find(query = {}) {
  const docs = await BusinessProfile.find(query).lean();
  return docs.map(withId);
}

async function upsert(workspaceId, profileData) {
  const updated = await BusinessProfile.findOneAndUpdate(
    { workspaceId },
    { $set: profileData },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return withId(updated);
}

// Profiles filled in before the wizard existed have no onboardingCompletedAt,
// but someone already described the business, so don't send them through
// onboarding again.
function isOnboardingComplete(profile) {
  if (!profile) return false;
  return Boolean(profile.onboardingCompletedAt || (profile.offer && profile.audience));
}

async function create(data) {
  const doc = await BusinessProfile.create(data);
  return withId(doc.toObject());
}

module.exports = { BusinessProfile, findByWorkspaceId, find, upsert, create, isOnboardingComplete };
