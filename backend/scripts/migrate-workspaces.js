const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const userModel = require("../src/models/user.model");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const businessProfileModel = require("../src/models/businessProfile.model");
const notificationSettingsModel = require("../src/models/notificationSettings.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const postModel = require("../src/models/post.model");
const contentDraftModel = require("../src/models/contentDraft.model");
const scheduledPostModel = require("../src/models/scheduledPost.model");

async function runMigration() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment or backend/.env");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected successfully.\n");

  const summary = {
    usersProcessed: 0,
    workspacesCreated: 0,
    membershipsCreated: 0,
    profilesCreated: 0,
    notificationSettingsCreated: 0,
    socialAccountsMigrated: 0,
    postsMigrated: 0,
  };

  // 1. Migrate Users & Provision Workspaces
  const users = await mongoose.connection.collection("users").find({}).toArray();
  console.log(`Found ${users.length} user(s) to process.`);

  for (const user of users) {
    summary.usersProcessed++;
    let workspaceId = user.activeWorkspaceId;

    if (workspaceId) {
      const existingWs = await workspaceModel.findById(workspaceId);
      if (!existingWs) workspaceId = null;
    }

    if (!workspaceId) {
      // Check if user already owns a workspace
      const existingOwnedWs = await workspaceModel.findOne({ ownerId: user._id });
      if (existingOwnedWs) {
        workspaceId = existingOwnedWs._id;
      } else {
        const newWs = await workspaceModel.create({
          name: `${user.name || "Default"}'s Workspace`,
          ownerId: user._id,
          status: "active",
        });
        workspaceId = newWs._id;
        summary.workspacesCreated++;
        console.log(`[Workspace Created] '${newWs.name}' (${newWs._id}) for user ${user.email}`);
      }

      await userModel.updateById(user._id, { activeWorkspaceId: workspaceId });
    }

    // Ensure Owner Membership exists
    const existingMembership = await membershipModel.findOne({
      workspaceId,
      userId: user._id,
    });

    if (!existingMembership) {
      await membershipModel.create({
        workspaceId,
        userId: user._id,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      });
      summary.membershipsCreated++;
      console.log(`[Membership Created] Owner membership for ${user.email} in ${workspaceId}`);
    }

    // Ensure BusinessProfile exists
    const existingProfile = await businessProfileModel.findByWorkspaceId(workspaceId);
    if (!existingProfile) {
      await businessProfileModel.create({
        workspaceId,
        businessType: "General Venture",
        tone: ["professional", "engaging"],
        goals: ["brand_awareness", "engagement"],
      });
      summary.profilesCreated++;
      console.log(`[BusinessProfile Created] Default profile for workspace ${workspaceId}`);
    }

    // Ensure NotificationSettings exists
    const existingNotif = await notificationSettingsModel.findByWorkspaceId(workspaceId);
    if (!existingNotif) {
      await notificationSettingsModel.create({
        workspaceId,
        dailyCap: 5,
        sensitivityLevel: "medium",
        channels: { telegram: false, email: true, inApp: true },
      });
      summary.notificationSettingsCreated++;
      console.log(`[NotificationSettings Created] Default settings for workspace ${workspaceId}`);
    }
  }

  // 2. Re-key SocialAccounts with workspaceId
  const socialAccounts = await mongoose.connection.collection("socialaccounts").find({}).toArray();
  for (const sa of socialAccounts) {
    if (!sa.workspaceId && sa.ownerId) {
      const owner = await userModel.findById(sa.ownerId);
      if (owner && owner.activeWorkspaceId) {
        await mongoose.connection
          .collection("socialaccounts")
          .updateOne({ _id: sa._id }, { $set: { workspaceId: owner.activeWorkspaceId } });
        summary.socialAccountsMigrated++;
        console.log(`[SocialAccount Migrated] ${sa.displayName} -> workspace ${owner.activeWorkspaceId}`);
      }
    }
  }

  // 3. Migrate ContentDrafts & ScheduledPosts -> Posts collection
  const drafts = await mongoose.connection.collection("contentdrafts").find({}).toArray();
  for (const draft of drafts) {
    const existingPost = await postModel.findById(draft._id);
    if (existingPost) continue;

    const owner = await userModel.findById(draft.ownerId);
    if (!owner || !owner.activeWorkspaceId) continue;

    // Check for corresponding scheduled post
    const scheduled = await mongoose.connection
      .collection("scheduledposts")
      .findOne({ contentDraftId: draft._id });

    let status = draft.status === "published" ? "published" : "draft";
    let externalPostId = null;
    let scheduledAt = null;
    let publishedAt = null;
    let channel = (draft.platforms && draft.platforms[0]) || "facebook";
    let socialAccountId = null;

    if (scheduled) {
      if (scheduled.status === "published") {
        status = "published";
        publishedAt = scheduled.updatedAt || new Date();
      } else if (scheduled.status === "publishing") {
        status = "scheduled";
        scheduledAt = scheduled.scheduledAt || new Date();
      } else if (scheduled.status === "failed") {
        status = "failed";
      }
      externalPostId = scheduled.externalPostId || null;
      channel = scheduled.platform || channel;
      socialAccountId = scheduled.socialAccountId || null;
    }

    await postModel.create({
      _id: draft._id,
      workspaceId: owner.activeWorkspaceId,
      authorId: draft.ownerId,
      channel,
      socialAccountId,
      content: {
        title: draft.title || "Untitled Post",
        body: draft.body || "",
        mediaUrls: draft.mediaUrls || [],
        hashtags: [],
      },
      status,
      scheduledAt,
      publishedAt,
      origin: "manual",
      externalPostId,
      aiMetadata: draft.aiMetadata || {},
      versions: draft.versions || [],
      createdAt: draft.createdAt || new Date(),
      updatedAt: draft.updatedAt || new Date(),
    });

    summary.postsMigrated++;
    console.log(`[Post Migrated] Draft '${draft.title}' (${draft._id}) -> Post in workspace ${owner.activeWorkspaceId}`);
  }

  console.log("\n================ MIGRATION COMPLETE ================");
  console.log(JSON.stringify(summary, null, 2));
  console.log("====================================================\n");

  await mongoose.disconnect();
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

module.exports = { runMigration };
