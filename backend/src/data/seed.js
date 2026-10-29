const bcrypt = require("bcrypt");
const logger = require("../config/logger");
const userModel = require("../models/user.model");
const workspaceModel = require("../models/workspace.model");
const membershipModel = require("../models/membership.model");
const businessProfileModel = require("../models/businessProfile.model");
const notificationSettingsModel = require("../models/notificationSettings.model");
const socialAccountModel = require("../models/socialAccount.model");
const contentDraftModel = require("../models/contentDraft.model");
const postModel = require("../models/post.model");

const DEMO_EMAIL = "demo@example.com";

// Recreates the demo experience: a demo login, its personal workspace,
// business profile, notification settings, two pre-connected social accounts,
// and sample post/draft. Runs once at boot and is a no-op once the demo user exists.
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

  const demoWorkspace = await workspaceModel.create({
    name: "TechPulse Studio",
    ownerId: demoUser.id,
    status: "active",
  });

  await userModel.updateById(demoUser.id, { activeWorkspaceId: demoWorkspace.id });

  await membershipModel.create({
    workspaceId: demoWorkspace.id,
    userId: demoUser.id,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

  await businessProfileModel.create({
    workspaceId: demoWorkspace.id,
    businessType: "Tech Media & AI Agency",
    offer: "Social media analytics, AI content automation, and creator publishing tools.",
    audience: "Tech founders, content creators, and digital marketing teams.",
    location: { city: "Harare", country: "Zimbabwe" },
    tone: ["authoritative", "inspiring", "tech-forward"],
    goals: ["brand_awareness", "community_growth"],
    activeChannels: ["instagram", "facebook"],
    onboardingCompletedAt: new Date(),
  });

  await notificationSettingsModel.create({
    workspaceId: demoWorkspace.id,
    dailyCap: 5,
    sensitivityLevel: "medium",
    channels: { telegram: false, email: true, inApp: true },
  });

  await socialAccountModel.create({
    ownerId: demoUser.id,
    workspaceId: demoWorkspace.id,
    platform: "instagram",
    externalAccountId: "ig_techpulse_studio",
    displayName: "TechPulse Studio (@techpulse.studio)",
  });

  await socialAccountModel.create({
    ownerId: demoUser.id,
    workspaceId: demoWorkspace.id,
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

  await postModel.create({
    workspaceId: demoWorkspace.id,
    authorId: demoUser.id,
    channel: "instagram",
    content: {
      title: "Product Launch Announcement",
      body: "🚀 Big news! We are officially rolling out AI Analytics 2.0 today. Try it out!",
      mediaUrls: [],
      hashtags: ["AI", "TechPulse", "Publishing"],
    },
    status: "draft",
  });

  logger.info("Seeded demo user, workspace, business profile, and sample posts");
}

module.exports = { seedDemoData };
