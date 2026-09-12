const { z } = require("zod");
const { enqueuePublishJob } = require("../queue");
const ContentDraft = require("../models/contentDraft.model");
const scheduledPostModel = require("../models/scheduledPost.model");

const publishNowSchema = z.object({
  contentDraftId: z.string().min(1, "contentDraftId is required"),
  platform: z.string().min(1, "platform is required"),
  socialAccountId: z.string().optional().nullable(),
});

async function publishNow(req, res) {
  const parsed = publishNowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid publish request", details: parsed.error.issues });
  }

  const { contentDraftId, platform, socialAccountId } = parsed.data;

  const draft = await ContentDraft.findOne({ _id: contentDraftId, ownerId: req.user.id });
  if (!draft) {
    return res.status(404).json({ error: "Content draft not found" });
  }

  const scheduled = await scheduledPostModel.create({
    ownerId: req.user.id,
    contentDraftId,
    platform,
    socialAccountId: socialAccountId || null,
    status: "publishing",
  });

  draft.status = "published";
  await ContentDraft.save(draft);

  await enqueuePublishJob(
    {
      postId: scheduled.id,
      platform,
      contentDraftId,
      socialAccountId: socialAccountId || null,
      content: draft.body,
      mediaUrls: draft.mediaUrls || [],
    },
    { delay: 0 }
  );

  return res.status(202).json({
    postId: scheduled.id,
    status: "publishing",
    platform,
    title: draft.title,
    scheduledAt: scheduled.scheduledAt,
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
