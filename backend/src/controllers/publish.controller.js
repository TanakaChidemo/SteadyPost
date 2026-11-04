const { z } = require("zod");
const { enqueuePublishJob } = require("../queue");
const ContentDraft = require("../models/contentDraft.model");
const scheduledPostModel = require("../models/scheduledPost.model");
const { validateAccountWorkspaceOwnership } = require("../utils/workspaceValidation");

const publishNowSchema = z.object({
  contentDraftId: z.string().min(1, "contentDraftId is required"),
  platform: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  socialAccountId: z.string().optional().nullable(),
  socialAccountIds: z.array(z.string()).optional(),
});

async function publishNow(req, res) {
  const parsed = publishNowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid publish request", details: parsed.error.issues });
  }

  const { contentDraftId, platform, platforms, socialAccountId, socialAccountIds } = parsed.data;

  // Verify draft exists and belongs to the user
  const draft = await ContentDraft.findOne({ _id: contentDraftId, ownerId: req.user.id });
  if (!draft) {
    return res.status(404).json({ error: "Content draft not found" });
  }

  // Determine platforms to publish to
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

  // Validate social account ownership before queuing (fixes ownership vulnerability)
  const targetAccountIds = Array.isArray(socialAccountIds) && socialAccountIds.length > 0
    ? socialAccountIds
    : socialAccountId
    ? [socialAccountId]
    : [];

  const effectiveWorkspaceId = req.workspaceId || req.user.activeWorkspaceId || null;

  for (const accId of targetAccountIds) {
    try {
      await validateAccountWorkspaceOwnership({
        socialAccountId: accId,
        workspaceId: effectiveWorkspaceId,
        userId: req.user.id,
      });
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  const queuedResults = [];

  for (let i = 0; i < targetPlatforms.length; i++) {
    const targetPlatform = targetPlatforms[i];
    const accId = targetAccountIds[i] || targetAccountIds[0] || null;

    const scheduled = await scheduledPostModel.create({
      ownerId: req.user.id,
      contentDraftId,
      platform: targetPlatform,
      socialAccountId: accId,
      status: "publishing",
    });

    await enqueuePublishJob(
      {
        postId: scheduled.id,
        platform: targetPlatform,
        contentDraftId,
        socialAccountId: accId,
        workspaceId: req.workspaceId || null,
        content: draft.body,
        mediaUrls: draft.mediaUrls || [],
      },
      { delay: 0 }
    );

    queuedResults.push({
      postId: scheduled.id,
      status: "publishing",
      platform: targetPlatform,
      title: draft.title,
      scheduledAt: scheduled.scheduledAt,
    });
  }

  draft.status = "published";
  await ContentDraft.save(draft);

  if (queuedResults.length === 1) {
    return res.status(202).json(queuedResults[0]);
  }

  return res.status(202).json({
    status: "publishing",
    contentDraftId,
    items: queuedResults,
  });
}

async function getStatus(req, res) {
  const { scheduledPostId } = req.params;
  if (!scheduledPostId) return res.status(400).json({ error: "scheduledPostId is required" });

  const post = await scheduledPostModel.findOne({ id: scheduledPostId, ownerId: req.user.id });
  if (!post) return res.status(404).json({ error: "Scheduled post not found" });

  return res.json({
    id: post.id,
    status: post.status,
    platform: post.platform,
    externalPostId: post.externalPostId,
    errorMessage: post.errorMessage,
    updatedAt: post.updatedAt,
  });
}

module.exports = { publishNow, getStatus };
