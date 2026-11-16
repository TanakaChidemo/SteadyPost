/**
 * Moves Content Studio drafts from per-user ContentDrafts onto the business's
 * Post records (F10, #07), so the owner can see editors' drafts.
 *
 *   npm run migrate:drafts            # dry run: reports what it would do
 *   npm run migrate:drafts -- --apply # writes the posts
 *
 * - Only unsent drafts (status "draft") move. Drafts already published through
 *   the old /publish/now path stay as they are.
 * - Each draft becomes one draft Post with the same _id, the convention
 *   scripts/migrate-workspaces.js uses, so re-running it (or running it after
 *   that script) never makes a duplicate. ContentDrafts are left in place.
 * - The post goes to the draft's own business. A draft saved before drafts
 *   had a business goes to the business its author owns, never to
 *   activeWorkspaceId (which could be someone else's business).
 * - targetAccountIds = that business's accounts on the draft's platforms.
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const ContentDraft = require("../src/models/contentDraft.model");
const postModel = require("../src/models/post.model");
const workspaceModel = require("../src/models/workspace.model");
const socialAccountModel = require("../src/models/socialAccount.model");

function normalizePlatform(platform) {
  const key = String(platform || "").toLowerCase().trim();
  if (key === "google_business" || key === "google") return "gbp";
  if (key === "x") return "twitter";
  return key;
}

async function businessFor(draft) {
  if (draft.workspaceId && (await workspaceModel.findById(draft.workspaceId))) return draft.workspaceId;
  const owned = await workspaceModel.findOne({ ownerId: draft.ownerId });
  return owned?.id || null;
}

/** `filter` narrows which drafts are looked at (used by the tests). */
async function migrateDrafts({ apply = false, log = console.log, filter = {} } = {}) {
  const summary = { checked: 0, migrated: 0, alreadyMigrated: 0, noBusiness: 0 };
  const drafts = await ContentDraft.find({ ...filter, status: { $in: ["draft", null] } });

  for (const draft of drafts) {
    summary.checked++;
    if (await postModel.findById(draft._id)) {
      summary.alreadyMigrated++;
      continue;
    }

    const workspaceId = await businessFor(draft);
    if (!workspaceId) {
      summary.noBusiness++;
      log(`[skip] "${draft.title}" (${draft._id}): its author owns no business`);
      continue;
    }

    const platforms = (draft.platforms || []).map(normalizePlatform);
    const accounts = await socialAccountModel.list({ workspaceId });
    const targets = accounts.filter((a) => platforms.includes(normalizePlatform(a.platform)));
    const channel = targets[0]?.platform || draft.platforms?.[0] || "facebook";

    log(`[${apply ? "move" : "would move"}] "${draft.title}" (${draft._id}) -> business ${workspaceId}, ${targets.length} account(s)`);
    if (apply) {
      await postModel.create({
        _id: draft._id,
        workspaceId,
        authorId: draft.ownerId,
        channel,
        targetAccountIds: targets.map((a) => a.id),
        content: {
          title: draft.title || "Untitled Post",
          body: draft.body || "",
          mediaUrls: draft.mediaUrls || [],
          hashtags: [],
        },
        status: "draft",
        origin: "manual",
        aiMetadata: draft.aiMetadata || {},
        versions: draft.versions || [],
        createdAt: draft.createdAt || new Date(),
        updatedAt: draft.updatedAt || new Date(),
      });
    }
    summary.migrated++;
  }

  return summary;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment or backend/.env");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(apply ? "Moving drafts onto posts...\n" : "Dry run (nothing is written). Add --apply to move them.\n");
  const summary = await migrateDrafts({ apply });
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Draft migration failed:", err);
    process.exit(1);
  });
}

module.exports = { migrateDrafts };
