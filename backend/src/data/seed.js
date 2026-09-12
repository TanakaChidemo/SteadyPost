const bcrypt = require("bcrypt");
const logger = require("../config/logger");
const userModel = require("../models/user.model");
const socialAccountModel = require("../models/socialAccount.model");
const contentDraftModel = require("../models/contentDraft.model");

const DEMO_EMAIL = "demo@example.com";

// Recreates the demo experience the in-memory store used to provide out of
// the box: a demo login, two pre-connected social accounts, and a sample
// draft. Runs once at boot and is a no-op once the demo user exists.
async function seedDemoData() {
  const existing = await userModel.findByEmail(DEMO_EMAIL);
  if (existing) return;

  const passwordHash = await bcrypt.hash("password123", 10);
  const demoUser = await userModel.create({
    email: DEMO_EMAIL,
    passwordHash,
    name: "Tanaka Chidemo",
    role: "admin",
  });

  await socialAccountModel.create({
    ownerId: demoUser.id,
    platform: "instagram",
    externalAccountId: "ig_techpulse_studio",
    displayName: "TechPulse Studio (@techpulse.studio)",
  });

  await socialAccountModel.create({
    ownerId: demoUser.id,
    platform: "facebook",
    externalAccountId: "fb_techpulse_global",
    displayName: "TechPulse Global Page",
  });

  await contentDraftModel.create({
    ownerId: demoUser.id,
    title: "Product Launch Announcement",
    body: "🚀 Big news! We are officially rolling out AI Analytics 2.0 today. Try it out!",
    platforms: ["instagram", "facebook"],
    status: "draft",
  });

  logger.info("Seeded demo user, social accounts, and content draft");
}

module.exports = { seedDemoData };
