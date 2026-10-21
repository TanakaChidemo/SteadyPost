const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const notificationSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("notif") },
    workspaceId: { type: String, required: true, unique: true, ref: "Workspace", index: true },
    dailyCap: { type: Number, default: 5 },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: "22:00" },
      end: { type: String, default: "08:00" },
      timeZone: { type: String, default: "UTC" },
    },
    sensitivityLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    nudgeRecipients: { type: [String], default: [] },
    channels: {
      telegram: { type: Boolean, default: false },
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const NotificationSettings =
  mongoose.models.NotificationSettings || mongoose.model("NotificationSettings", notificationSettingsSchema);

async function findByWorkspaceId(workspaceId) {
  return withId(await NotificationSettings.findOne({ workspaceId }).lean());
}

async function upsert(workspaceId, settingsData) {
  const updated = await NotificationSettings.findOneAndUpdate(
    { workspaceId },
    { $set: settingsData },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return withId(updated);
}

async function create(data) {
  const doc = await NotificationSettings.create(data);
  return withId(doc.toObject());
}

module.exports = { NotificationSettings, findByWorkspaceId, upsert, create };
