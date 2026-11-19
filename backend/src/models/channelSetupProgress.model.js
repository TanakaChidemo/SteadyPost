const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const PLATFORMS = ["facebook", "instagram", "gbp", "linkedin", "twitter"];
const STATUSES = ["not_started", "in_progress", "waiting_on_platform", "done"];
const BLOCKER_REASONS = [
  "no_facebook_page",
  "missing_page_permissions",
  "non_professional_ig",
  "unlinked_ig",
  "no_gbp_listing",
  "unverified_gbp",
];

// Tracks per-platform setup walkthrough progress for a workspace (F27, #08).
const channelSetupProgressSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("csp") },
    workspaceId: { type: String, required: true, index: true, ref: "Workspace" },
    platform: { type: String, required: true, enum: PLATFORMS },
    currentStep: { type: Number, default: 1, min: 1, max: 10 },
    completedSteps: { type: [Number], default: [] },
    status: {
      type: String,
      enum: STATUSES,
      default: "not_started",
    },
    blockerReason: {
      type: String,
      default: null,
    },
    lastCheckedAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

channelSetupProgressSchema.index({ workspaceId: 1, platform: 1 }, { unique: true });

const ChannelSetupProgress =
  mongoose.models.ChannelSetupProgress ||
  mongoose.model("ChannelSetupProgress", channelSetupProgressSchema);

async function listByWorkspace(workspaceId) {
  if (!workspaceId) return [];
  const docs = await ChannelSetupProgress.find({ workspaceId }).sort({ platform: 1 }).lean();
  return docs.map(withId);
}

async function findByWorkspaceAndPlatform(workspaceId, platform) {
  if (!workspaceId || !platform) return null;
  const doc = await ChannelSetupProgress.findOne({ workspaceId, platform }).lean();
  return withId(doc);
}

async function upsertProgress(workspaceId, platform, update = {}) {
  if (!workspaceId) throw new Error("workspaceId is required");
  if (!PLATFORMS.includes(platform)) throw new Error(`Unsupported platform: ${platform}`);

  const $set = {};
  if (update.currentStep !== undefined) $set.currentStep = Math.max(1, Number(update.currentStep) || 1);
  if (Array.isArray(update.completedSteps)) {
    $set.completedSteps = Array.from(new Set(update.completedSteps.map(Number).filter((n) => n >= 1))).sort(
      (a, b) => a - b
    );
  }
  if (update.status !== undefined) $set.status = update.status;
  if (update.blockerReason !== undefined) $set.blockerReason = update.blockerReason;
  if (update.lastCheckedAt !== undefined) $set.lastCheckedAt = update.lastCheckedAt;
  if (update.updatedBy !== undefined) $set.updatedBy = update.updatedBy;

  const doc = await ChannelSetupProgress.findOneAndUpdate(
    { workspaceId, platform },
    { $set },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();

  return withId(doc);
}

async function deleteByWorkspace(workspaceId) {
  return ChannelSetupProgress.deleteMany({ workspaceId });
}

module.exports = {
  PLATFORMS,
  STATUSES,
  BLOCKER_REASONS,
  ChannelSetupProgress,
  listByWorkspace,
  findByWorkspaceAndPlatform,
  upsertProgress,
  deleteByWorkspace,
};
