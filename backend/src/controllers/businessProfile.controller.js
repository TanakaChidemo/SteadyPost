const businessProfileModel = require("../models/businessProfile.model");
const notificationSettingsModel = require("../models/notificationSettings.model");
const workspaceModel = require("../models/workspace.model");

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

  return res.json({
    ...profile,
    name: workspace?.name || profile.businessType || "Business Profile",
  });
}

async function updateProfile(req, res) {
  if (req.body.name && typeof req.body.name === "string" && req.body.name.trim()) {
    await workspaceModel.updateById(req.workspaceId, { name: req.body.name.trim() });
  }

  const allowed = [
    "businessType",
    "websiteUrl",
    "offer",
    "audience",
    "location",
    "tone",
    "goals",
    "activeChannels",
  ];
  const payload = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      payload[key] = req.body[key];
    }
  }

  const updated = await businessProfileModel.upsert(req.workspaceId, payload);
  const workspace = await workspaceModel.findById(req.workspaceId);

  return res.json({
    ...updated,
    name: workspace?.name || updated.businessType,
  });
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
