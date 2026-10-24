const businessProfileModel = require("../models/businessProfile.model");
const notificationSettingsModel = require("../models/notificationSettings.model");
const workspaceModel = require("../models/workspace.model");
const { profileFieldsSchema } = require("../validation/businessProfile");

// The profile's name is the workspace's name, so it's read from and saved to
// the workspace.
function toProfileResponse(profile, workspace) {
  return {
    ...profile,
    name: workspace?.name || profile.businessType || "Business Profile",
    onboardingComplete: businessProfileModel.isOnboardingComplete(profile),
  };
}

async function getProfile(req, res) {
  let profile = await businessProfileModel.findByWorkspaceId(req.workspaceId);
  const workspace = await workspaceModel.findById(req.workspaceId);

  if (!profile) {
    profile = await businessProfileModel.create({
      workspaceId: req.workspaceId,
      businessType: "General Venture",
      tone: ["professional"],
      goals: ["brand_awareness"],
    });
  }

  return res.json(toProfileResponse(profile, workspace));
}

async function updateProfile(req, res) {
  const parsed = profileFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const { name, onboardingCompleted, ...fields } = parsed.data;
  if (name) {
    await workspaceModel.updateById(req.workspaceId, { name });
  }
  if (onboardingCompleted) {
    fields.onboardingCompletedAt = new Date();
  }

  const updated = await businessProfileModel.upsert(req.workspaceId, fields);
  const workspace = await workspaceModel.findById(req.workspaceId);

  return res.json(toProfileResponse(updated, workspace));
}

async function getNotificationSettings(req, res) {
  let settings = await notificationSettingsModel.findByWorkspaceId(req.workspaceId);
  if (!settings) {
    settings = await notificationSettingsModel.create({
      workspaceId: req.workspaceId,
      dailyCap: 5,
      channels: { telegram: false, email: true, inApp: true },
    });
  }
  return res.json(settings);
}

async function updateNotificationSettings(req, res) {
  const allowed = ["dailyCap", "quietHours", "sensitivityLevel", "nudgeRecipients", "channels"];
  const payload = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      payload[key] = req.body[key];
    }
  }

  const updated = await notificationSettingsModel.upsert(req.workspaceId, payload);
  return res.json(updated);
}

module.exports = {
  getProfile,
  updateProfile,
  getNotificationSettings,
  updateNotificationSettings,
};
