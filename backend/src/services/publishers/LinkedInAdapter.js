const BaseAdapter = require("./BaseAdapter");

class LinkedInAdapter extends BaseAdapter {
  constructor() {
    super("linkedin");
  }

  isLiveAccount(account) {
    return Boolean(
      account &&
      account.accessToken &&
      account.externalAccountId &&
      !account.isMock &&
      process.env.LINKEDIN_CLIENT_ID
    );
  }

  async publish({ postId, content, _mediaUrls = [], hashtags = [], account }) {
    const isLive = this.isLiveAccount(account);

    if (!isLive) {
      this.logger.info({ postId }, "Publishing via LinkedIn Sandbox Simulator");
      const fakeId = `urn:li:share:${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      return {
        platform: "linkedin",
        externalId: fakeId,
        url: `https://www.linkedin.com/feed/update/${fakeId}`,
        simulated: true,
        publishedAt: new Date().toISOString(),
      };
    }

    let postText = content ? content.trim() : "";
    if (hashtags && hashtags.length > 0) {
      const tags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
      if (!postText.includes(tags)) {
        postText = `${postText}\n\n${tags}`.trim();
      }
    }

    const authorUrn = account.externalAccountId.startsWith("urn:li:")
      ? account.externalAccountId
      : `urn:li:person:${account.externalAccountId}`;

    try {
      const body = {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: postText,
            },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          Authorization: `Bearer ${account.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`LinkedIn publish failed: ${JSON.stringify(data)}`);
      }

      const externalId = data.id || `urn:li:share:${Date.now()}`;
      return {
        platform: "linkedin",
        externalId,
        url: `https://www.linkedin.com/feed/update/${externalId}`,
        raw: data,
        publishedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err: err.message, postId }, "LinkedIn API call failed");
      throw err;
    }
  }

  async getMetrics({ externalPostId, account }) {
    const isLive = this.isLiveAccount(account);

    if (!isLive || !externalPostId) {
      const likes = Math.floor(Math.random() * 30) + 5;
      const comments = Math.floor(Math.random() * 8) + 1;
      const shares = Math.floor(Math.random() * 6);
      const clicks = Math.floor(Math.random() * 20) + 2;
      const reach = (likes + comments + shares) * 25 + Math.floor(Math.random() * 150);

      return {
        reach,
        likes,
        comments,
        shares,
        clicks,
        simulated: true,
      };
    }

    try {
      const url = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&shares[0]=${encodeURIComponent(externalPostId)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`LinkedIn metrics fetch failed: ${JSON.stringify(data)}`);
      }

      const stats = data.elements?.[0]?.totalShareStatistics || {};
      const likes = stats.likeCount || 0;
      const comments = stats.commentCount || 0;
      const shares = stats.shareCount || 0;
      const clicks = stats.clickCount || 0;
      const reach = stats.impressionCount || (likes + comments) * 20;

      return { reach, likes, comments, shares, clicks, raw: data, simulated: false };
    } catch (err) {
      this.logger.warn({ err: err.message, externalPostId }, "Failed to fetch live LinkedIn metrics");
      return { reach: 20, likes: 5, comments: 1, shares: 1, clicks: 3, simulated: true };
    }
  }
}

module.exports = LinkedInAdapter;
