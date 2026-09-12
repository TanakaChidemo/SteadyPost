const logger = require("../config/logger");
const scheduledPostModel = require("../models/scheduledPost.model");
const metaPublisher = require("../services/publishers/metaPublisher");

/**
 * Async job processor for publishing content.
 * jobData shape: { postId, platform, contentDraftId, content, mediaUrls, socialAccountId }
 */
async function processPublishJob(job) {
  const data = job.data || job;
  const { platform, postId } = data;
  logger.info({ postId, platform }, "Processing publish job");

  try {
    let result;
    switch (platform) {
      case "facebook":
      case "instagram":
        result = await metaPublisher.publish(data);
        break;

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const externalPostId = result.externalId || `ext_${platform}_${Date.now()}`;

    await scheduledPostModel.updateById(postId, {
      status: "published",
      externalPostId,
      errorMessage: null,
    });

    logger.info({ postId, platform, externalPostId }, "Publish job completed successfully");
    return result;
  } catch (err) {
    logger.error({ postId, platform, err: err.message }, "Publish job failed");

    await scheduledPostModel
      .updateById(postId, { status: "failed", errorMessage: err.message || "Publishing failed" })
      .catch(() => {});

    throw err;
  }
}

module.exports = { processPublishJob };
