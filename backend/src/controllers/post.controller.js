const { z } = require("zod");
const postModel = require("../models/post.model");
const contentDraftModel = require("../models/contentDraft.model");
const approvalEventModel = require("../models/approvalEvent.model");
const predictionRecordModel = require("../models/predictionRecord.model");
const postMetricsModel = require("../models/postMetrics.model");
const businessProfileModel = require("../models/businessProfile.model");
const contentAdaptationService = require("../services/contentAdaptation.service");
const { enqueuePublishJob } = require("../queue");
const { validateAccountWorkspaceOwnership } = require("../utils/workspaceValidation");

const ALLOWED_CHANNELS = ["twitter", "linkedin", "instagram", "facebook", "gbp", "google_business"];
const MAX_IDEA_LENGTH = 5000;

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

  if (socialAccountId) {
    try {
      await validateAccountWorkspaceOwnership({
        socialAccountId,
        workspaceId: req.workspaceId,
        userId: req.user.id,
      });
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

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
  if (req.body.socialAccountId !== undefined) {
    if (req.body.socialAccountId) {
      try {
        await validateAccountWorkspaceOwnership({
          socialAccountId: req.body.socialAccountId,
          workspaceId: req.workspaceId,
          userId: req.user.id,
        });
      } catch (err) {
        return res.status(err.status || 403).json({ error: err.message });
      }
    }
    updates.socialAccountId = req.body.socialAccountId;
  }
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

  if (post.socialAccountId) {
    try {
      await validateAccountWorkspaceOwnership({
        socialAccountId: post.socialAccountId,
        workspaceId: req.workspaceId,
        userId: req.user.id,
      });
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  const targetStatus = post.scheduledAt ? "scheduled" : "approved";
  const updated = await postModel.updateById(post.id, { status: targetStatus });

  await approvalEventModel.create({
    postId: post.id,
    actorId: req.user.id,
    action: "approve",
    comment: req.body.comment || "",
  });

  if (post.scheduledAt) {
    const delay = Math.max(0, new Date(post.scheduledAt).getTime() - Date.now());
    await enqueuePublishJob(
      {
        postId: post.id,
        platform: post.channel,
        contentDraftId: post.id,
        socialAccountId: post.socialAccountId || null,
        workspaceId: req.workspaceId,
        content: post.content?.body || "",
        mediaUrls: post.content?.mediaUrls || [],
        hashtags: post.content?.hashtags || [],
      },
      { delay }
    );
  }

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

  if (post.socialAccountId) {
    try {
      await validateAccountWorkspaceOwnership({
        socialAccountId: post.socialAccountId,
        workspaceId: req.workspaceId,
        userId: req.user.id,
      });
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  await postModel.updateById(post.id, { status: "scheduled" });

  await enqueuePublishJob(
    {
      postId: post.id,
      platform: post.channel,
      contentDraftId: post.id,
      socialAccountId: post.socialAccountId || null,
      workspaceId: req.workspaceId,
      content: post.content?.body || "",
      mediaUrls: post.content?.mediaUrls || [],
      hashtags: post.content?.hashtags || [],
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

const publishApprovedSchema = z.object({
  postIds: z.array(z.string()).optional(),
  campaignId: z.string().optional(),
});

async function publishApproved(req, res) {
  const parsed = publishApprovedSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const { postIds, campaignId } = parsed.data;
  let postsToPublish = [];

  if (Array.isArray(postIds) && postIds.length > 0) {
    const foundPosts = await Promise.all(postIds.map((id) => postModel.findById(id)));
    postsToPublish = foundPosts.filter((p) => p && p.workspaceId === req.workspaceId && p.status === "approved");
  } else {
    const query = { status: "approved" };
    if (campaignId) query.campaignId = campaignId;
    postsToPublish = await postModel.findByWorkspaceId(req.workspaceId, query);
  }

  if (postsToPublish.length === 0) {
    return res.status(200).json({
      message: "No approved posts found to publish",
      queuedCount: 0,
      items: [],
    });
  }

  const queuedItems = [];

  for (const post of postsToPublish) {
    if (post.socialAccountId) {
      try {
        await validateAccountWorkspaceOwnership({
          socialAccountId: post.socialAccountId,
          workspaceId: req.workspaceId,
          userId: req.user.id,
        });
      } catch (err) {
        return res.status(err.status || 403).json({
          error: `Post ${post.id}: ${err.message}`,
        });
      }
    }

    const delay = post.scheduledAt ? Math.max(0, new Date(post.scheduledAt).getTime() - Date.now()) : 0;
    await postModel.updateById(post.id, { status: delay > 0 ? "scheduled" : "publishing" });

    await enqueuePublishJob(
      {
        postId: post.id,
        platform: post.channel,
        contentDraftId: post.id,
        socialAccountId: post.socialAccountId || null,
        workspaceId: req.workspaceId,
        content: post.content?.body || "",
        mediaUrls: post.content?.mediaUrls || [],
        hashtags: post.content?.hashtags || [],
      },
      { delay }
    );

    queuedItems.push({
      postId: post.id,
      channel: post.channel,
      title: post.content?.title,
      status: delay > 0 ? "scheduled" : "publishing",
      scheduledAt: post.scheduledAt || null,
      delay,
    });
  }

  return res.status(202).json({
    message: `Queued ${queuedItems.length} approved post(s) for publishing`,
    queuedCount: queuedItems.length,
    items: queuedItems,
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

async function getTopPerforming(req, res) {
  const { limit = 10, channel, metric = "engagement" } = req.query;
  const result = await postMetricsModel.getTopPerformingForWorkspace(req.workspaceId, {
    limit: Number(limit) || 10,
    channel,
    metric,
  });
  return res.json(result);
}

const generateVariantsSchema = z.object({
  idea: z
    .string()
    .trim()
    .min(1, "Idea or topic is required")
    .max(MAX_IDEA_LENGTH, `Idea cannot exceed ${MAX_IDEA_LENGTH} characters`),
  channels: z.array(z.string()).optional(),
  tone: z.string().optional(),
  campaignId: z.string().optional().nullable(),
  sourcePostId: z.string().optional().nullable(),
  saveAsDrafts: z.boolean().optional(),
});

async function generateVariants(req, res) {
  const parsed = generateVariantsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const { idea, channels, tone, campaignId = null, sourcePostId = null, saveAsDrafts = false } = parsed.data;

  let targetChannels = ["instagram", "facebook"];
  if (Array.isArray(channels)) {
    if (channels.length === 0) {
      return res.status(400).json({ error: "At least one target channel is required" });
    }
    const filtered = [...new Set(channels.map((c) => String(c).toLowerCase().trim()))].filter((c) =>
      ALLOWED_CHANNELS.includes(c)
    );
    if (filtered.length === 0) {
      return res.status(400).json({
        error: "None of the requested channels are supported",
        supportedChannels: ALLOWED_CHANNELS,
      });
    }
    targetChannels = filtered;
  }

  let effectiveTone = tone;
  let businessProfile = null;
  if (req.workspaceId) {
    businessProfile = await businessProfileModel.findByWorkspaceId(req.workspaceId);
    if (!effectiveTone && businessProfile?.tone?.length) {
      effectiveTone = businessProfile.tone[0];
    }
  }
  if (!effectiveTone) effectiveTone = "professional";

  let sourcePost = null;
  if (sourcePostId) {
    sourcePost = await postModel.findById(sourcePostId);
    if (!sourcePost || sourcePost.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: "Source post not found" });
    }
  }

  const adaptationResult = await contentAdaptationService.adaptIdeaToChannels({
    idea,
    channels: targetChannels,
    tone: effectiveTone,
    businessProfile,
    sourcePost,
  });

  if (saveAsDrafts && adaptationResult.variants?.length > 0) {
    const createdDrafts = [];
    for (const variant of adaptationResult.variants) {
      const post = await postModel.create({
        workspaceId: req.workspaceId,
        authorId: req.user.id,
        channel: variant.channel,
        campaignId,
        content: {
          title: variant.content.title,
          body: variant.content.body,
          mediaUrls: variant.content.mediaUrls || [],
          hashtags: variant.content.hashtags || [],
        },
        status: "draft",
        origin: sourcePostId ? "manual" : campaignId ? "campaign" : "manual",
        aiMetadata: {
          provider: variant.provider,
          model: variant.model,
          tone: effectiveTone,
          idea,
          sourcePostId,
          generatedAt: new Date(),
        },
        versions: [
          {
            body: variant.content.body,
            editedAt: new Date(),
            editedBy: req.user.id,
          },
        ],
      });
      createdDrafts.push(post);
      variant.post = post;
    }
    adaptationResult.savedDrafts = createdDrafts;
  }

  return res.json(adaptationResult);
}

const repurposePostSchema = z.object({
  targetChannels: z
    .array(z.enum(["twitter", "linkedin", "instagram", "facebook"]))
    .min(1, "At least one target channel is required"),
  tone: z.string().optional(),
  saveAsDrafts: z.boolean().optional(),
});

async function repurposePost(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const parsed = repurposePostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const { tone, saveAsDrafts = false } = parsed.data;
  const targetChannels = [...new Set(parsed.data.targetChannels)];

  let effectiveTone = tone;
  let businessProfile = null;
  if (req.workspaceId) {
    businessProfile = await businessProfileModel.findByWorkspaceId(req.workspaceId);
    if (!effectiveTone && businessProfile?.tone?.length) {
      effectiveTone = businessProfile.tone[0];
    }
  }
  if (!effectiveTone) effectiveTone = "professional";

  const ideaText = `${post.content?.title ? post.content.title + ": " : ""}${post.content?.body || ""}`;

  const adaptationResult = await contentAdaptationService.adaptIdeaToChannels({
    idea: ideaText,
    channels: targetChannels,
    tone: effectiveTone,
    businessProfile,
    sourcePost: post,
  });

  if (saveAsDrafts && adaptationResult.variants?.length > 0) {
    const createdDrafts = [];
    for (const variant of adaptationResult.variants) {
      const newPost = await postModel.create({
        workspaceId: req.workspaceId,
        authorId: req.user.id,
        channel: variant.channel,
        campaignId: post.campaignId || null,
        content: {
          title: variant.content.title,
          body: variant.content.body,
          mediaUrls: post.content?.mediaUrls || [],
          hashtags: variant.content.hashtags || [],
        },
        status: "draft",
        origin: "manual",
        aiMetadata: {
          provider: variant.provider,
          model: variant.model,
          tone: effectiveTone,
          sourcePostId: post.id,
          repurposed: true,
          generatedAt: new Date(),
        },
        versions: [
          {
            body: variant.content.body,
            editedAt: new Date(),
            editedBy: req.user.id,
          },
        ],
      });
      createdDrafts.push(newPost);
      variant.post = newPost;
    }
    adaptationResult.savedDrafts = createdDrafts;
  }

  return res.json({
    sourcePost: {
      id: post.id,
      channel: post.channel,
      title: post.content?.title,
      body: post.content?.body,
    },
    ...adaptationResult,
  });
}

const batchCreateSchema = z.object({
  posts: z
    .array(
      z.object({
        title: z.string().max(200).optional(),
        body: z
          .string()
          .min(1, "Post body is required")
          .max(MAX_IDEA_LENGTH, `Post body cannot exceed ${MAX_IDEA_LENGTH} characters`),
        channel: z.enum(["twitter", "linkedin", "instagram", "facebook"]),
        campaignId: z.string().optional().nullable(),
        mediaUrls: z.array(z.string()).optional(),
        hashtags: z.array(z.string()).optional(),
        aiMetadata: z.record(z.any()).optional(),
      })
    )
    .min(1, "At least one post is required")
    .max(20, "Cannot batch create more than 20 posts at once"),
});

async function batchCreate(req, res) {
  const parsed = batchCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const itemsToInsert = parsed.data.posts.map((item) => ({
    workspaceId: req.workspaceId,
    ownerId: req.user.id,
    channel: item.channel,
    platforms: [item.channel],
    title: item.title || `Post for ${item.channel}`,
    body: item.body,
    mediaUrls: item.mediaUrls || [],
    hashtags: item.hashtags || [],
    status: "draft",
    aiMetadata: item.aiMetadata || {},
    versions: [
      {
        body: item.body,
        editedAt: new Date(),
        editedBy: req.user.id,
      },
    ],
  }));

  const createdDrafts = await contentDraftModel.createMany(itemsToInsert);
  return res.status(201).json({ items: createdDrafts });
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
  getTopPerforming,
  generateVariants,
  repurposePost,
  batchCreate,
  publishApproved,
};
