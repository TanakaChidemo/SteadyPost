const { z } = require("zod");
const postModel = require("../models/post.model");
const approvalEventModel = require("../models/approvalEvent.model");
const predictionRecordModel = require("../models/predictionRecord.model");
const postMetricsModel = require("../models/postMetrics.model");
const { enqueuePublishJob } = require("../queue");

const createPostSchema = z.object({
  title: z.string().optional(),
  body: z.string().min(1, "Post body is required"),
  channel: z.string().min(1, "Channel is required"),
  socialAccountId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  mediaUrls: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  origin: z.enum(["manual", "campaign", "opportunity"]).optional(),
  aiMetadata: z.record(z.any()).optional(),
});

async function list(req, res) {
  const { status, campaignId } = req.query;
  const items = await postModel.findByWorkspaceId(req.workspaceId, { status, campaignId });
  return res.json({ items });
}

async function create(req, res) {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const {
    title = "Untitled Post",
    body,
    channel,
    socialAccountId = null,
    campaignId = null,
    mediaUrls = [],
    hashtags = [],
    scheduledAt = null,
    origin = "manual",
    aiMetadata = {},
  } = parsed.data;

  const post = await postModel.create({
    workspaceId: req.workspaceId,
    authorId: req.user.id,
    channel,
    socialAccountId,
    campaignId,
    content: { title, body, mediaUrls, hashtags },
    status: "draft",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    origin,
    aiMetadata,
    versions: [{ body, editedAt: new Date(), editedBy: req.user.id }],
  });

  return res.status(201).json(post);
}

async function getById(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const [approvalEvents, predictionRecords, latestMetrics] = await Promise.all([
    approvalEventModel.findByPostId(post.id),
    predictionRecordModel.findByPostId(post.id),
    postMetricsModel.getLatestByPostId(post.id),
  ]);

  return res.json({
    ...post,
    approvalEvents,
    predictionRecords,
    latestMetrics,
  });
}

async function update(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const updates = {};
  if (req.body.channel) updates.channel = req.body.channel;
  if (req.body.socialAccountId !== undefined) updates.socialAccountId = req.body.socialAccountId;
  if (req.body.campaignId !== undefined) updates.campaignId = req.body.campaignId;
  if (req.body.scheduledAt !== undefined) {
    updates.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
  }

  if (req.body.body || req.body.title || req.body.mediaUrls || req.body.hashtags) {
    updates.content = {
      title: req.body.title !== undefined ? req.body.title : post.content?.title,
      body: req.body.body !== undefined ? req.body.body : post.content?.body,
      mediaUrls: req.body.mediaUrls !== undefined ? req.body.mediaUrls : post.content?.mediaUrls || [],
      hashtags: req.body.hashtags !== undefined ? req.body.hashtags : post.content?.hashtags || [],
    };

    if (req.body.body && req.body.body !== post.content?.body) {
      const versions = post.versions || [];
      versions.push({
        body: req.body.body,
        editedAt: new Date(),
        editedBy: req.user.id,
      });
      updates.versions = versions;
    }
  }

  const updated = await postModel.updateById(post.id, updates);
  return res.json(updated);
}

async function submitApproval(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const updated = await postModel.updateById(post.id, { status: "pending_approval" });

  await approvalEventModel.create({
    postId: post.id,
    actorId: req.user.id,
    action: "submit",
    comment: req.body.comment || "",
  });

  return res.json(updated);
}

async function approve(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const targetStatus = post.scheduledAt ? "scheduled" : "approved";
  const updated = await postModel.updateById(post.id, { status: targetStatus });

  await approvalEventModel.create({
    postId: post.id,
    actorId: req.user.id,
    action: "approve",
    comment: req.body.comment || "",
  });

  return res.json(updated);
}

async function requestChanges(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const updated = await postModel.updateById(post.id, { status: "changes_requested" });

  await approvalEventModel.create({
    postId: post.id,
    actorId: req.user.id,
    action: "request_changes",
    comment: req.body.comment || "Changes requested",
  });

  return res.json(updated);
}

async function publishNow(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  await postModel.updateById(post.id, { status: "scheduled" });

  await enqueuePublishJob(
    {
      postId: post.id,
      platform: post.channel,
      contentDraftId: post.id,
      socialAccountId: post.socialAccountId || null,
      content: post.content?.body || "",
      mediaUrls: post.content?.mediaUrls || [],
    },
    { delay: 0 }
  );

  return res.status(202).json({
    postId: post.id,
    status: "publishing",
    platform: post.channel,
    title: post.content?.title,
  });
}

async function deletePost(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  await postModel.deleteOne({ _id: post.id });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  getById,
  update,
  submitApproval,
  approve,
  requestChanges,
  publishNow,
  deletePost,
};
