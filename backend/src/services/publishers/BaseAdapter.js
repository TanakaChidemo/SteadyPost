const logger = require("../../config/logger");

/**
 * Base abstract adapter interface for all social media and business platforms.
 * Every platform API (Meta, Twitter, LinkedIn, Google Business Profile) must extend this class
 * with a consistent method signature so they can be swapped or mocked in tests.
 */
class BaseAdapter {
  constructor(platform) {
    if (!platform) {
      throw new Error("BaseAdapter requires a platform identifier");
    }
    this.platform = platform;
    this.logger = logger.child ? logger.child({ platform }) : logger;
  }

  /**
   * Publish content to the platform.
   * @param {Object} params
   * @param {string} params.postId - Internal post ID
   * @param {string} params.content - Text body of the post
   * @param {Array<string>} [params.mediaUrls] - Array of media URLs or base64 data URIs
   * @param {Array<string>} [params.hashtags] - Array of hashtags
   * @param {Object} [params.account] - Resolved SocialAccount record with credentials
   * @param {string} [params.workspaceId] - Workspace ID
   * @param {Object} [params.options] - Platform-specific options (e.g. GBP callToAction, topicType)
   * @returns {Promise<{
   *   platform: string,
   *   externalId: string,
   *   url?: string,
   *   publishedAt: string,
   *   raw?: any,
   *   simulated?: boolean
   * }>}
   */
  async publish(_params) {
    throw new Error(`publish() not implemented for platform: ${this.platform}`);
  }

  /**
   * Collect engagement metrics for a previously published post.
   * @param {Object} params
   * @param {string} params.externalPostId - External platform post ID
   * @param {string} [params.postId] - Internal post ID
   * @param {Object} [params.account] - SocialAccount record with credentials
   * @param {string} [params.workspaceId] - Workspace ID
   * @returns {Promise<{
   *   reach: number,
   *   likes: number,
   *   comments: number,
   *   shares: number,
   *   clicks: number,
   *   raw?: any,
   *   simulated?: boolean
   * }>}
   */
  async getMetrics(_params) {
    // Default fallback metrics
    return {
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
      simulated: true,
    };
  }

  /**
   * Validate credentials/token for an account.
   * @param {Object} account
   * @returns {Promise<boolean>}
   */
  async validateCredentials(account) {
    return Boolean(account && (account.accessToken || account.externalAccountId));
  }
}

module.exports = BaseAdapter;
