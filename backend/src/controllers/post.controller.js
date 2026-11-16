const { z } = require("zod");
const postModel = require("../models/post.model");
const { can } = require("../auth/permissions");
const approvalEventModel = require("../models/approvalEvent.model");
const predictionRecordModel = require("../models/predictionRecord.model");
const postMetricsModel = require("../models/postMetrics.model");
const businessProfileModel = require("../models/businessProfile.model");
const contentAdaptationService = require("../services/contentAdaptation.service");
const { enqueuePublishJob } = require("../queue");
const { resolveAccountCredentials } = require("../queue/publishProcessor");
const { getAdapter } = require("../services/publishers/adapterRegistry");
const guardrailsService = require("../services/guardrails/guardrailsService");
const approvalService = require("../services/approval.service");
const userModel = require("../models/user.model");
const { validateAccountWorkspaceOwnership } = require("../utils/workspaceValidation");
const { isGbpAccount, isGbpListingVerified, getGbpUnverifiedError, validateGbpOptions } = require("../utils/gbpValidation");

const ALLOWED_CHANNELS = ["twitter", "linkedin", "instagram", "facebook", "gbp", "google_business"];
const MAX_IDEA_LENGTH = 5000;

const createPostSchema = z.object({
  title: z.string().optional(),
  body: z.string().min(1, "Post body is required"),
  channel: z.string().min(1, "Channel is required"),
  socialAccountId: z.string().optional().nullable(),
  targetAccountIds: z.array(z.string()).max(25).optional(),
  campaignId: z.string().optional().nullable(),
  mediaUrls: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  origin: z.enum(["manual", "campaign", "opportunity"]).optional(),
  aiMetadata: z.record(z.any()).optional(),
  gbpOptions: z.record(z.any()).optional(),
});

async function list(req, res) {
  const { status, campaignId } = req.query;
  const items = await postModel.findByWorkspaceId(req.workspaceId, { status, campaignId });

  // The latest approval step on each post, so the studio can show the editor's
  // note to the owner and the owner's comment back to the editor, and who
  // wrote each post, since drafts are shared across the business (F10).
  const latest = await approvalEventModel.latestByPostIds(items.map((p) => p.id));
  const named = await withActorNames([...latest.values()]);
  const byPost = new Map(named.map((e) => [e.postId, e]));
  const authors = await namesFor(items.map((p) => p.authorId));
  return res.json({
    items: items.map((p) => ({
      ...p,
      authorName: authors.get(p.authorId) || "Former member",
      lastApprovalEvent: byPost.get(p.id) || null,
    })),
  });
}

/** Checks every account a draft targets belongs to this business. Throws like validateAccountWorkspaceOwnership. */
async function validateTargets(targetAccountIds, req) {
  const ids = [...new Set(targetAccountIds)];
  for (const socialAccountId of ids) {
    await validateAccountWorkspaceOwnership({ socialAccountId, workspaceId: req.workspaceId, userId: req.user.id });
  }
  return ids;
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
    targetAccountIds: requestedTargets = [],
    campaignId = null,
    mediaUrls = [],
    hashtags = [],
    scheduledAt = null,
    origin = "manual",
    aiMetadata = {},
  } = parsed.data;

  let targetAccountIds;
  try {
    if (socialAccountId) {
      await validateAccountWorkspaceOwnership({
        socialAccountId,
        workspaceId: req.workspaceId,
        userId: req.user.id,
      });
    }
    targetAccountIds = await validateTargets(requestedTargets, req);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const guardrails = await guardrailsService.auditDraft({
    content: body,
    channel,
    mediaUrls,
    hashtags,
    workspaceId: req.workspaceId,
  });

  const effectiveGbpOptions = aiMetadata.gbpOptions || req.body.gbpOptions;
  if (effectiveGbpOptions) {
    const gbpErr = validateGbpOptions(effectiveGbpOptions, { requireDates: false });
    if (gbpErr) {
      return res.status(400).json({ error: gbpErr });
    }
  }

  const post = await postModel.create({
    workspaceId: req.workspaceId,
    authorId: req.user.id,
    channel,
    socialAccountId,
    targetAccountIds,
    campaignId,
    content: { title, body, mediaUrls, hashtags },
    status: "draft",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    origin,
    aiMetadata: {
      ...aiMetadata,
      ...(effectiveGbpOptions ? { gbpOptions: effectiveGbpOptions } : {}),
      guardrails,
    },
    versions: [{ body, editedAt: new Date(), editedBy: req.user.id }],
  });

  return res.status(201).json(post);
}

/** Display names for user ids, as a Map of id -> name (or email). */
async function namesFor(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const users = await userModel.User.find({ _id: { $in: ids } }, { name: 1, email: 1 }).lean();
  return new Map(users.map((u) => [u._id, u.name || u.email]));
}

/** Adds `actorName` to each approval event, for the post's history. */
async function withActorNames(events) {
  const names = await namesFor(events.map((e) => e.actorId));
  return events.map((e) => ({ ...e, actorName: names.get(e.actorId) || "Former member" }));
}

async function getById(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const [events, predictionRecords, latestMetrics] = await Promise.all([
    approvalEventModel.findByPostId(post.id),
    predictionRecordModel.findByPostId(post.id),
    postMetricsModel.getLatestByPostId(post.id),
  ]);
  const approvalEvents = await withActorNames(events);

  return res.json({
    ...post,
    approvalEvents,
    predictionRecords,
    latestMetrics,
  });
}

// Posts that are on their way out, or already out, can't be edited.
const LOCKED_FOR_EDITING = ["scheduled", "publishing", "published"];

async function update(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }
  if (LOCKED_FOR_EDITING.includes(post.status)) {
    return res.status(409).json({ error: `This post is already ${post.status}, so it can't be edited.` });
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
  if (req.body.targetAccountIds !== undefined) {
    if (!Array.isArray(req.body.targetAccountIds) || req.body.targetAccountIds.some((id) => typeof id !== "string")) {
      return res.status(400).json({ error: "targetAccountIds must be a list of account ids" });
    }
    try {
      updates.targetAccountIds = await validateTargets(req.body.targetAccountIds, req);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
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

  if (updates.content || updates.channel) {
    const updatedContent = updates.content || post.content || {};
    const updatedChannel = updates.channel || post.channel || "instagram";
    const guardrails = await guardrailsService.auditDraft({
      content: updatedContent.body || "",
      channel: updatedChannel,
      mediaUrls: updatedContent.mediaUrls || [],
      hashtags: updatedContent.hashtags || [],
      workspaceId: req.workspaceId,
    });
    updates.aiMetadata = {
      ...(post.aiMetadata || {}),
      guardrails,
    };
  }

  // Google Business Profile options (topic, call to action) for a post sent
  // from a studio draft, used when it's published or queued on approval.
  const incomingGbp =
    req.body.aiMetadata?.gbpOptions !== undefined
      ? req.body.aiMetadata.gbpOptions
      : req.body.gbpOptions;
  if (incomingGbp !== undefined) {
    if (incomingGbp !== null && typeof incomingGbp !== "object") {
      return res.status(400).json({ error: "gbpOptions must be an object" });
    }
    const isDraft = post.status === "draft";
    const gbpErr = validateGbpOptions(incomingGbp, { requireDates: !isDraft });
    if (gbpErr) {
      return res.status(400).json({ error: gbpErr });
    }
    updates.aiMetadata = { ...(updates.aiMetadata || post.aiMetadata || {}), gbpOptions: incomingGbp || {} };
  }

  // An editor changing a post that's waiting for, or has, the owner's approval
  // sends it back to draft: the owner only ever approves what they've seen.
  const needsReapproval = ["pending_approval", "approved"].includes(post.status);
  if (needsReapproval && req.membership.role !== "owner" && Object.keys(updates).length > 0) {
    updates.status = "draft";
  }

  const updated = await postModel.updateById(post.id, updates);
  return res.json(updated);
}

// Approval actions go through the shared workflow (services/approval.service)
// so the app, approval links and Telegram all follow the same rules.
function approvalHandler(action) {
  return async (req, res) => {
    try {
      const { post, guardrailsWarning } = await approvalService.applyApprovalAction({
        workspaceId: req.workspaceId,
        postId: req.params.id,
        actorId: req.user.id,
        role: req.membership.role,
        action,
        comment: req.body?.comment,
      });
      return res.json(action === "submit" ? { ...post, guardrailsWarning } : post);
    } catch (err) {
      if (err instanceof approvalService.ApprovalError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  };
}

const submitApproval = approvalHandler("submit");
const approve = approvalHandler("approve");
const requestChanges = approvalHandler("request_changes");
const reject = approvalHandler("reject");

// Statuses a post can't be published from again.
const ALREADY_PUBLISHING = ["scheduled", "publishing", "published"];

const publishSinglePostSchema = z.object({
  scheduledAt: z.string().datetime().optional().nullable(),
  socialAccountId: z.string().optional().nullable(),
  options: z.record(z.any()).optional(),
});

async function publishNow(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  if (ALREADY_PUBLISHING.includes(post.status)) {
    return res.status(409).json({ error: `This post is already ${post.status}` });
  }

  const parsed = publishSinglePostSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const { scheduledAt, socialAccountId, options = {} } = parsed.data;
  const effectiveAccountId = socialAccountId !== undefined ? socialAccountId : post.socialAccountId || null;

  const effectiveOptions = { ...(post.aiMetadata?.gbpOptions || {}), ...options };
  const gbpErr = validateGbpOptions(effectiveOptions, { requireDates: true });
  if (gbpErr) {
    return res.status(400).json({ error: gbpErr });
  }

  if (effectiveAccountId) {
    try {
      const validatedAcc = await validateAccountWorkspaceOwnership({
        socialAccountId: effectiveAccountId,
        workspaceId: req.workspaceId,
        userId: req.user.id,
      });
      if (isGbpAccount(validatedAcc || post.channel) && !isGbpListingVerified(validatedAcc)) {
        return res.status(400).json(getGbpUnverifiedError());
      }
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  // Only owners reach here; publishing a post that wasn't approved counts as
  // the owner approving it, so the audit trail stays complete.
  if (post.status !== "approved") {
    await approvalEventModel.create({
      workspaceId: req.workspaceId,
      postId: post.id,
      actorId: req.user.id,
      action: "approve",
      comment: "Published directly by the owner",
    });
  }

  const effectiveScheduledAt = scheduledAt !== undefined ? scheduledAt : post.scheduledAt;
  const scheduledDate = effectiveScheduledAt ? new Date(effectiveScheduledAt) : null;
  const delay = scheduledDate ? Math.max(0, scheduledDate.getTime() - Date.now()) : 0;
  const nextStatus = delay > 0 ? "scheduled" : "publishing";

  const dbUpdates = {
    status: nextStatus,
    ...(socialAccountId !== undefined ? { socialAccountId: effectiveAccountId } : {}),
    ...(scheduledAt !== undefined ? { scheduledAt: scheduledDate } : {}),
  };
  await postModel.updateById(post.id, dbUpdates);

  await enqueuePublishJob(
    {
      postId: post.id,
      platform: post.channel,
      contentDraftId: post.id,
      socialAccountId: effectiveAccountId,
      workspaceId: req.workspaceId,
      content: post.content?.body || "",
      mediaUrls: post.content?.mediaUrls || [],
      hashtags: post.content?.hashtags || [],
      options: {
        ...(post.aiMetadata?.gbpOptions || post.aiMetadata?.options || {}),
        ...options,
      },
    },
    { delay }
  );

  return res.status(202).json({
    postId: post.id,
    status: nextStatus,
    platform: post.channel,
    title: post.content?.title,
    scheduledAt: scheduledDate,
    delay,
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
        const validatedAcc = await validateAccountWorkspaceOwnership({
          socialAccountId: post.socialAccountId,
          workspaceId: req.workspaceId,
          userId: req.user.id,
        });
        if (isGbpAccount(validatedAcc || post.channel) && !isGbpListingVerified(validatedAcc)) {
          return res.status(400).json(getGbpUnverifiedError(post.id));
        }
      } catch (err) {
        return res.status(err.status || 403).json({
          error: `Post ${post.id}: ${err.message}`,
        });
      }
    }

    const gbpErr = validateGbpOptions(post.aiMetadata?.gbpOptions, { requireDates: true });
    if (gbpErr) {
      return res.status(400).json({ error: `Post ${post.id}: ${gbpErr}` });
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
        options: {
          ...(post.aiMetadata?.gbpOptions || post.aiMetadata?.options || {}),
        },
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

  // The owner can delete any post. Editors can delete their own drafts, since
  // drafts are shared with the business now, but nothing else (F10).
  const ownDraft = post.status === "draft" && post.authorId === req.user.id;
  if (!can(req.membership.role, "post.delete") && !ownDraft) {
    return res.status(403).json({
      error: "You can delete your own drafts. Only the business owner can delete other posts.",
      code: "FORBIDDEN",
    });
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

async function getPostMetrics(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const [latestMetrics, history] = await Promise.all([
    postMetricsModel.getLatestByPostId(post.id),
    postMetricsModel.findByPostId(post.id),
  ]);

  return res.json({
    postId: post.id,
    channel: post.channel,
    status: post.status,
    externalPostId: post.externalPostId || null,
    latestMetrics,
    history,
  });
}

async function refreshPostMetrics(req, res) {
  const post = await postModel.findById(req.params.id);
  if (!post || post.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Post not found" });
  }

  if (post.status !== "published") {
    return res.status(400).json({ error: "Metrics can only be refreshed for published posts" });
  }

  const account = await resolveAccountCredentials({
    socialAccountId: post.socialAccountId || null,
    workspaceId: req.workspaceId,
    platform: post.channel,
  });

  const adapter = getAdapter(post.channel);
  let collected;
  try {
    collected = await adapter.getMetrics({
      externalPostId: post.externalPostId,
      postId: post.id,
      account,
      platform: post.channel,
    });
  } catch (err) {
    return res.status(502).json({
      error: `Platform metrics collection failed: ${err.message || "Failed to reach platform API"}`,
    });
  }

  const snapshot = await postMetricsModel.create({
    postId: post.id,
    reach: collected?.reach || 0,
    likes: collected?.likes || 0,
    comments: collected?.comments || 0,
    shares: collected?.shares || 0,
    clicks: collected?.clicks || 0,
    captureTime: new Date(),
  });

  return res.json({
    postId: post.id,
    latestMetrics: snapshot,
    snapshot,
  });
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
    .array(z.enum(ALLOWED_CHANNELS))
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
        channel: z.enum(ALLOWED_CHANNELS),
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

  const profile = req.workspaceId ? await businessProfileModel.findByWorkspaceId(req.workspaceId) : null;

  const itemsToInsert = await Promise.all(
    parsed.data.posts.map(async (item) => {
      const guardrails = await guardrailsService.auditDraft({
        content: item.body,
        channel: item.channel,
        mediaUrls: item.mediaUrls || [],
        hashtags: item.hashtags || [],
        workspaceId: req.workspaceId,
        profile,
      });

      return {
        workspaceId: req.workspaceId,
        authorId: req.user.id,
        channel: item.channel,
        campaignId: item.campaignId || null,
        content: {
          title: item.title || `Post for ${item.channel}`,
          body: item.body,
          mediaUrls: item.mediaUrls || [],
          hashtags: item.hashtags || [],
        },
        status: "draft",
        origin: "manual",
        aiMetadata: {
          ...(item.aiMetadata || {}),
          guardrails,
        },
        versions: [
          {
            body: item.body,
            editedAt: new Date(),
            editedBy: req.user.id,
          },
        ],
      };
    })
  );

  // Drafts live on the business's posts, so the whole team sees them (F10).
  const createdDrafts = await postModel.createMany(itemsToInsert);
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
  reject,
  publishNow,
  deletePost,
  getTopPerforming,
  getPostMetrics,
  refreshPostMetrics,
  generateVariants,
  repurposePost,
  batchCreate,
  publishApproved,
};
