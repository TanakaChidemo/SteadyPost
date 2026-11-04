const logger = require("../config/logger");
const scheduledPostModel = require("../models/scheduledPost.model");
const postModel = require("../models/post.model");
const postMetricsModel = require("../models/postMetrics.model");
const socialAccountModel = require("../models/socialAccount.model");
const { getAdapter } = require("../services/publishers/adapterRegistry");

/**
 * Resolves account credentials for the given socialAccountId and workspaceId.
 */
async function resolveAccountCredentials({ socialAccountId, workspaceId, platform }) {
  if (socialAccountId) {
    const account = await socialAccountModel.findById(socialAccountId);
    if (account) {
      // Validate workspace match
      if (workspaceId && account.workspaceId && account.workspaceId !== workspaceId) {
        throw new Error(
          `Security violation: Social account ${socialAccountId} does not belong to workspace ${workspaceId}`
        );
      }
      return {
        id: account.id || account._id,
        isMock: !account.accessToken,
        externalAccountId: account.externalAccountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
        workspaceId: account.workspaceId,
        ownerId: account.ownerId,
        platform: account.platform,
      };
    }
  }

  // If no socialAccountId provided or not found, try to find an account for the workspace
  if (workspaceId && platform) {
    const accounts = await socialAccountModel.list(workspaceId);
    const matching = accounts.find((a) => a.platform === platform);
    if (matching) {
      return {
        id: matching.id || matching._id,
        isMock: !matching.accessToken,
        externalAccountId: matching.externalAccountId,
        accessToken: matching.accessToken,
        displayName: matching.displayName,
        workspaceId: matching.workspaceId,
        ownerId: matching.ownerId,
        platform: matching.platform,
      };
    }
  }

  // Sandbox fallback credentials
  return {
    isMock: true,
    externalAccountId: `mock_${platform}_${Date.now()}`,
    accessToken: `mock_${platform}_token`,
    displayName: `Mock ${platform} Account`,
  };
}

/**
 * Async job processor for publishing content via platform adapters.
 * job shape: { id, data: { postId, platform, contentDraftId, content, mediaUrls, hashtags, socialAccountId, workspaceId, options } }
 */
async function processPublishJob(job) {
  const data = job.data || job;
  const { platform, postId, workspaceId, socialAccountId, options = {} } = data;
  logger.info({ postId, platform, workspaceId, attemptsMade: job.attemptsMade || 0 }, "Processing publish job");

  try {
    // 1. Resolve workspace credentials
    const account = await resolveAccountCredentials({ socialAccountId, workspaceId, platform });

    // 2. Dispatch to registered platform adapter
    const adapter = getAdapter(platform);
    const result = await adapter.publish({
      postId,
      content: data.content,
      mediaUrls: data.mediaUrls || [],
      hashtags: data.hashtags || [],
      account,
      workspaceId,
      options,
      platform,
    });

    const externalPostId = result.externalId || `ext_${platform}_${Date.now()}`;

    // 3. Update unified Post model
    await postModel
      .updateById(postId, {
        status: "published",
        publishedAt: new Date(),
        externalPostId,
        errorMessage: null,
      })
      .catch((err) => {
        logger.warn({ postId, err: err.message }, "Could not update post model on publish success");
      });

    // 4. Update legacy ScheduledPost model if exists
    await scheduledPostModel
      .updateById(postId, {
        status: "published",
        externalPostId,
        errorMessage: null,
      })
      .catch(() => {});

    // 5. Collect initial resulting metrics
    try {
      const initialMetrics = await adapter.getMetrics({
        externalPostId,
        account,
        postId,
        platform,
      });

      if (initialMetrics) {
        await postMetricsModel.create({
          postId,
          reach: initialMetrics.reach || 0,
          likes: initialMetrics.likes || 0,
          comments: initialMetrics.comments || 0,
          shares: initialMetrics.shares || 0,
          clicks: initialMetrics.clicks || 0,
          captureTime: new Date(),
        });
        logger.info({ postId, platform, initialMetrics }, "Collected resulting metrics for post");
      }
    } catch (metricErr) {
      logger.warn({ postId, platform, err: metricErr.message }, "Non-blocking metrics collection error");
    }

    logger.info({ postId, platform, externalPostId }, "Publish job completed successfully");
    return result;
  } catch (err) {
    const attemptsMade = (job.attemptsMade || 0) + 1;
    const maxRetries = job.opts?.maxRetries || 3;
    const willRetry = attemptsMade < maxRetries;

    logger.error(
      { postId, platform, attemptsMade, maxRetries, willRetry, err: err.message },
      "Publish job attempt failed"
    );

    const errorMessage = willRetry
      ? `Attempt ${attemptsMade} failed: ${err.message || "Publishing failed"}. Retrying...`
      : `Publishing failed after ${attemptsMade} attempts: ${err.message || "Platform API error"}`;

    const updateStatus = willRetry ? "scheduled" : "failed";

    await postModel
      .updateById(postId, {
        status: updateStatus,
        errorMessage,
      })
      .catch(() => {});

    await scheduledPostModel
      .updateById(postId, {
        status: updateStatus,
        errorMessage,
      })
      .catch(() => {});

    throw err;
  }
}

/**
 * Async job processor for periodic/delayed metrics collection.
 */
async function processMetricsJob(job) {
  const data = job.data || job;
  const { postId, externalPostId, platform, socialAccountId, workspaceId } = data;

  try {
    const account = await resolveAccountCredentials({ socialAccountId, workspaceId, platform });
    const adapter = getAdapter(platform);
    const metrics = await adapter.getMetrics({ externalPostId, account, postId, platform });

    if (metrics) {
      const recorded = await postMetricsModel.create({
        postId,
        reach: metrics.reach || 0,
        likes: metrics.likes || 0,
        comments: metrics.comments || 0,
        shares: metrics.shares || 0,
        clicks: metrics.clicks || 0,
        captureTime: new Date(),
      });
      logger.info({ postId, recordedId: recorded.id }, "Periodic metrics snapshot collected");
      return recorded;
    }
  } catch (err) {
    logger.warn({ postId, err: err.message }, "Metrics collection job failed");
    throw err;
  }
}

module.exports = {
  processPublishJob,
  processMetricsJob,
  resolveAccountCredentials,
};
