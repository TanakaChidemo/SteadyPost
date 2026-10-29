const BaseAdapter = require("./BaseAdapter");
const businessProfileModel = require("../../models/businessProfile.model");

class GbpAdapter extends BaseAdapter {
  constructor() {
    super("gbp");
  }

  isLiveAccount(account) {
    return Boolean(
      account &&
      account.accessToken &&
      account.externalAccountId &&
      !account.isMock &&
      (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_GBP_API_KEY)
    );
  }

  async buildLocalPostPayload({ content, mediaUrls = [], options = {}, workspaceId }) {
    let websiteUrl = options.ctaUrl || null;
    if (!websiteUrl && workspaceId) {
      try {
        const bp = await businessProfileModel.findByWorkspaceId(workspaceId);
        if (bp?.websiteUrl) websiteUrl = bp.websiteUrl;
      } catch (err) {
        // non-blocking
      }
    }

    const ctaAction = options.callToAction?.actionType || (websiteUrl ? "LEARN_MORE" : undefined);
    const callToAction = ctaAction
      ? {
          actionType: ctaAction,
          url: options.callToAction?.url || websiteUrl || "https://google.com",
        }
      : undefined;

    const payload = {
      languageCode: options.languageCode || "en-US",
      summary: content ? content.trim() : "",
      topicType: options.topicType || "STANDARD", // STANDARD | EVENT | OFFER
    };

    if (callToAction) {
      payload.callToAction = callToAction;
    }

    if (options.event) {
      payload.event = options.event;
    }

    if (options.offer) {
      payload.offer = options.offer;
    }

    if (mediaUrls && mediaUrls.length > 0) {
      payload.media = mediaUrls.map((url) => ({
        mediaFormat: "PHOTO",
        sourceUrl: url,
      }));
    }

    return payload;
  }

  async publish({ postId, content, mediaUrls = [], account, workspaceId, options = {} }) {
    const isLive = this.isLiveAccount(account);
    const payload = await this.buildLocalPostPayload({ content, mediaUrls, options, workspaceId });

    if (!isLive) {
      this.logger.info({ postId, options }, "Publishing via GBP Local Posts Sandbox Simulator (#13)");
      const fakeId = `gbp_post_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      return {
        platform: "gbp",
        externalId: fakeId,
        url: `https://business.google.com/posts/l/${fakeId}`,
        simulated: true,
        topicType: payload.topicType,
        callToAction: payload.callToAction,
        publishedAt: new Date().toISOString(),
      };
    }

    // Google Business Profile API:
    // POST https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/localPosts
    // account.externalAccountId typically holds accounts/{accountId}/locations/{locationId}
    const locationPath = account.externalAccountId.startsWith("accounts/")
      ? account.externalAccountId
      : `accounts/me/locations/${account.externalAccountId}`;

    const url = `https://mybusiness.googleapis.com/v4/${locationPath}/localPosts`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Google Business Profile Local Post publish failed: ${JSON.stringify(data)}`);
      }

      const externalId = data.name || data.localPostId || `gbp_${Date.now()}`;
      return {
        platform: "gbp",
        externalId,
        url: data.searchUrl || `https://business.google.com/posts/l/${externalId}`,
        raw: data,
        publishedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err: err.message, postId }, "Google Business Profile API call failed");
      throw err;
    }
  }

  async getMetrics({ externalPostId, account }) {
    const isLive = this.isLiveAccount(account);

    if (!isLive || !externalPostId) {
      // Local business posts generate local search views, call clicks, and website clicks
      const views = Math.floor(Math.random() * 80) + 15;
      const clicks = Math.floor(Math.random() * 18) + 2;
      const calls = Math.floor(Math.random() * 5);
      const likes = Math.floor(Math.random() * 8);

      return {
        reach: views,
        likes,
        comments: 0,
        shares: calls, // calls / direction requests
        clicks,
        simulated: true,
      };
    }

    try {
      const locationPath = account.externalAccountId.startsWith("accounts/")
        ? account.externalAccountId
        : `accounts/me/locations/${account.externalAccountId}`;
      const url = `https://mybusiness.googleapis.com/v4/${locationPath}/localPosts/${externalPostId}/reportInsights`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`GBP metrics fetch failed: ${JSON.stringify(data)}`);
      }

      const reach = data.localPostViews || 0;
      const clicks = (data.localPostActions?.websiteClicks || 0) + (data.localPostActions?.callClicks || 0);
      const shares = data.localPostActions?.drivingDirections || 0;

      return { reach, likes: 0, comments: 0, shares, clicks, raw: data, simulated: false };
    } catch (err) {
      this.logger.warn({ err: err.message, externalPostId }, "Failed to fetch live GBP metrics");
      return { reach: 35, likes: 0, comments: 0, shares: 1, clicks: 4, simulated: true };
    }
  }
}

module.exports = GbpAdapter;
