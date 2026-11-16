const { z } = require("zod");
const { enqueuePublishJob } = require("../queue");
const ContentDraft = require("../models/contentDraft.model");
const postModel = require("../models/post.model");
const scheduledPostModel = require("../models/scheduledPost.model");
const { validateAccountWorkspaceOwnership } = require("../utils/workspaceValidation");

const publishNowSchema = z.object({
  contentDraftId: z.string().min(1, "contentDraftId is required"),
  platform: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  socialAccountId: z.string().optional().nullable(),
  socialAccountIds: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  options: z.record(z.any()).optional(),
});

function normalizePlatform(platform) {
  const key = String(platform || "").toLowerCase().trim();
  if (key === "google_business" || key === "google") return "gbp";
  if (key === "x") return "twitter";
  return key;
}

async function publishNow(req, res) {
  const parsed = publishNowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid publish request", details: parsed.error.issues });
  }

  const {
    contentDraftId,
    platform,
    platforms,
    socialAccountId,
    socialAccountIds,
    scheduledAt = null,
    options = {},
  } = parsed.data;

  const effectiveWorkspaceId = req.workspaceId;

  // Verify draft exists and belongs to the requester or active workspace
  const draft = await ContentDraft.findById(contentDraftId);
  const canAccessDraft = Boolean(
    draft &&
      (draft.ownerId === req.user.id ||
        (draft.workspaceId && effectiveWorkspaceId && draft.workspaceId === effectiveWorkspaceId))
  );
  if (!canAccessDraft) {
    return res.status(404).json({ error: "Content draft not found" });
  }

  // Validate social account ownership before queuing (fixes ownership vulnerability)
  const targetAccountIds =
    Array.isArray(socialAccountIds) && socialAccountIds.length > 0
      ? socialAccountIds
      : socialAccountId
      ? [socialAccountId]
      : [];

  const validatedAccounts = [];
  for (const accId of targetAccountIds) {
    try {
      const account = await validateAccountWorkspaceOwnership({
        socialAccountId: accId,
        workspaceId: effectiveWorkspaceId,
        userId: req.user.id,
      });
      if (account) validatedAccounts.push(account);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  // Build (platform, socialAccountId) pairs without leaking unrelated accounts across platforms
  const hasExplicitPlatforms = (Array.isArray(platforms) && platforms.length > 0) || Boolean(platform);
  const publishTargets = [];

  if (!hasExplicitPlatforms && validatedAccounts.length > 0) {
    for (const acc of validatedAccounts) {
      publishTargets.push({
        platform: acc.platform,
        socialAccountId: acc.id || acc._id,
      });
    }
  } else {
    let targetPlatforms = [];
    if (Array.isArray(platforms) && platforms.length > 0) {
      targetPlatforms = platforms;
    } else if (platform) {
      targetPlatforms = [platform];
    } else if (Array.isArray(draft.platforms) && draft.platforms.length > 0) {
      targetPlatforms = draft.platforms;
    } else {
      targetPlatforms = ["facebook"];
    }

    const usedIndices = new Set();
    for (const targetPlatform of targetPlatforms) {
      const targetKey = normalizePlatform(targetPlatform);
      let matchedIdx = validatedAccounts.findIndex(
        (acc, idx) => !usedIndices.has(idx) && normalizePlatform(acc.platform) === targetKey
      );
      if (matchedIdx === -1 && targetPlatforms.length === 1 && validatedAccounts.length === 1) {
        matchedIdx = 0;
      }

      let accId = null;
      if (matchedIdx !== -1) {
        usedIndices.add(matchedIdx);
        accId = validatedAccounts[matchedIdx].id || validatedAccounts[matchedIdx]._id;
      }

      publishTargets.push({
        platform: targetPlatform,
        socialAccountId: accId,
      });
    }
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : new Date();
  const delay = scheduledAt ? Math.max(0, scheduledDate.getTime() - Date.now()) : 0;
  const initialStatus = delay > 0 ? "scheduled" : "publishing";

  const queuedResults = [];

  for (const target of publishTargets) {
    const scheduled = await scheduledPostModel.create({
      ownerId: req.user.id,
      workspaceId: effectiveWorkspaceId || null,
      contentDraftId,
      platform: target.platform,
      socialAccountId: target.socialAccountId,
      scheduledAt: scheduledDate,
      status: initialStatus,
    });

    await enqueuePublishJob(
      {
        postId: scheduled.id,
        platform: target.platform,
        contentDraftId,
        socialAccountId: target.socialAccountId,
        workspaceId: effectiveWorkspaceId || null,
        content: draft.body,
        mediaUrls: draft.mediaUrls || [],
        hashtags: draft.hashtags || [],
        options,
      },
      { delay }
    );

    queuedResults.push({
      postId: scheduled.id,
      status: initialStatus,
      platform: target.platform,
      socialAccountId: target.socialAccountId,
      title: draft.title,
      scheduledAt: scheduled.scheduledAt,
      delay,
    });
  }

  draft.status = delay > 0 ? "scheduled" : "published";
  await ContentDraft.save(draft);

  if (queuedResults.length === 1) {
    return res.status(202).json(queuedResults[0]);
  }

  return res.status(202).json({
    status: initialStatus,
    contentDraftId,
    scheduledAt: scheduledAt ? scheduledDate : null,
    delay,
    items: queuedResults,
  });
}

async function getStatus(req, res) {
  const { scheduledPostId } = req.params;
  if (!scheduledPostId) return res.status(400).json({ error: "scheduledPostId is required" });

  const workspaceScope = req.workspaceId;

  // 1. Check ScheduledPost collection (from /publish/now draft publishing)
  const scheduledDoc = await scheduledPostModel.findOne({ id: scheduledPostId });
  if (scheduledDoc) {
    const canView = Boolean(
      scheduledDoc.ownerId === req.user.id ||
        (scheduledDoc.workspaceId && workspaceScope && scheduledDoc.workspaceId === workspaceScope)
    );
    if (!canView) return res.status(404).json({ error: "Scheduled post not found" });

    return res.json({
      id: scheduledDoc.id,
      status: scheduledDoc.status,
      platform: scheduledDoc.platform,
      externalPostId: scheduledDoc.externalPostId,
      errorMessage: scheduledDoc.errorMessage,
      scheduledAt: scheduledDoc.scheduledAt,
      updatedAt: scheduledDoc.updatedAt,
    });
  }

  // 2. Fall back to Post collection (from pipeline /posts/:id/publish-now and /posts/publish-approved)
  const postDoc = await postModel.findById(scheduledPostId);
  if (postDoc) {
    const canView = Boolean(
      postDoc.authorId === req.user.id ||
        (postDoc.workspaceId && workspaceScope && postDoc.workspaceId === workspaceScope)
    );
    if (!canView) return res.status(404).json({ error: "Scheduled post not found" });

    return res.json({
      id: postDoc.id || postDoc._id,
      status: postDoc.status,
      platform: postDoc.channel,
      externalPostId: postDoc.externalPostId || null,
      errorMessage: postDoc.errorMessage || null,
      scheduledAt: postDoc.scheduledAt || null,
      updatedAt: postDoc.updatedAt || postDoc.publishedAt,
    });
  }

  return res.status(404).json({ error: "Scheduled post not found" });
}

module.exports = { publishNow, getStatus };
