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
  //
  // Legacy (pre-workspace) data belongs to the user personally, so it is
  // re-keyed to the workspace the user *owns* — never to `activeWorkspaceId`,
  // which may point at a workspace they joined or switched to, and would
  // expose their social accounts (Page tokens) and drafts to its members.
  const ownedWorkspaceByUser = new Map();
  const users = await mongoose.connection.collection("users").find({}).toArray();
  console.log(`Found ${users.length} user(s) to process.`);

  for (const user of users) {
    summary.usersProcessed++;

    let activeWorkspaceId = user.activeWorkspaceId;
    if (activeWorkspaceId) {
      const existingWs = await workspaceModel.findById(activeWorkspaceId);
      if (!existingWs) activeWorkspaceId = null;
    }

    let workspaceId = null;
    const existingOwnedWs = await workspaceModel.findOne({ ownerId: user._id });
    if (existingOwnedWs) {
      workspaceId = existingOwnedWs._id;
    } else {
      // A user already working in someone else's workspace only needs one of
      // their own if they have legacy data to put in it.
      const hasLegacyData =
        (await mongoose.connection
          .collection("socialaccounts")
          .countDocuments({ ownerId: user._id, workspaceId: null }, { limit: 1 })) > 0 ||
        (await mongoose.connection.collection("contentdrafts").countDocuments({ ownerId: user._id }, { limit: 1 })) > 0;

      if (!activeWorkspaceId || hasLegacyData) {
        const newWs = await workspaceModel.create({
          name: `${user.name || "Default"}'s Workspace`,
          ownerId: user._id,
          status: "active",
        });
        workspaceId = newWs._id;
        summary.workspacesCreated++;
        console.log(`[Workspace Created] '${newWs.name}' (${newWs._id}) for user ${user.email}`);
      }
    }

    if (!activeWorkspaceId && workspaceId) {
      await userModel.updateById(user._id, { activeWorkspaceId: workspaceId });
    }

    if (!workspaceId) continue;
    ownedWorkspaceByUser.set(user._id, workspaceId);

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
      const workspaceId = ownedWorkspaceByUser.get(sa.ownerId);
      if (workspaceId) {
        await mongoose.connection
          .collection("socialaccounts")
          .updateOne({ _id: sa._id }, { $set: { workspaceId } });
        summary.socialAccountsMigrated++;
        console.log(`[SocialAccount Migrated] ${sa.displayName} -> workspace ${workspaceId}`);
      }
    }
  }

  // 3. Migrate ContentDrafts & ScheduledPosts -> Posts collection
  //
  // A Post has a single channel, but a draft may target several platforms
  // (one ScheduledPost row each), so each draft becomes one Post per
  // platform. The first keeps the draft's _id; the rest get
  // `<draftId>_<platform>`, which keeps re-runs idempotent.
  const drafts = await mongoose.connection.collection("contentdrafts").find({}).toArray();
  for (const draft of drafts) {
    const workspaceId = ownedWorkspaceByUser.get(draft.ownerId);
    if (!workspaceId) continue;

    // Latest ScheduledPost row per platform
    const scheduledRows = await mongoose.connection
      .collection("scheduledposts")
      .find({ contentDraftId: draft._id })
      .sort({ updatedAt: 1 })
      .toArray();
    const scheduledByPlatform = new Map(scheduledRows.map((row) => [row.platform, row]));

    const channels = [...new Set([...(draft.platforms || []), ...scheduledByPlatform.keys()])].filter(Boolean);
    if (channels.length === 0) channels.push("facebook");

    for (const [index, channel] of channels.entries()) {
      const postId = index === 0 ? draft._id : `${draft._id}_${channel}`;
      const existingPost = await postModel.findById(postId);
      if (existingPost) continue;

      const scheduled = scheduledByPlatform.get(channel);
      let status = draft.status === "published" ? "published" : "draft";
      let scheduledAt = null;
      let publishedAt = null;

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
      }

      await postModel.create({
        _id: postId,
        workspaceId,
        authorId: draft.ownerId,
        channel,
        socialAccountId: scheduled?.socialAccountId || null,
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
        externalPostId: scheduled?.externalPostId || null,
        errorMessage: scheduled?.errorMessage || null,
        aiMetadata: draft.aiMetadata || {},
        versions: draft.versions || [],
        createdAt: draft.createdAt || new Date(),
        updatedAt: draft.updatedAt || new Date(),
      });

      summary.postsMigrated++;
      console.log(`[Post Migrated] Draft '${draft.title}' (${draft._id}) -> ${channel} Post ${postId} in workspace ${workspaceId}`);
    }
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
