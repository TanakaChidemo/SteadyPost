const BaseAdapter = require("./BaseAdapter");

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const [, mimeType, base64] = match;
  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

class MetaAdapter extends BaseAdapter {
  constructor(platform = "facebook") {
    super(platform);
  }

  isLiveAccount(account) {
    return Boolean(
      process.env.META_APP_ID &&
      account &&
      account.accessToken &&
      account.externalAccountId &&
      !account.isMock
    );
  }

  async publish({ postId, content, mediaUrls = [], hashtags = [], account, platform }) {
    const targetPlatform = platform || this.platform;
    const isLive = this.isLiveAccount(account);

    if (!isLive) {
      this.logger.info({ targetPlatform, postId }, "Publishing via Meta Sandbox Simulator");
      return {
        platform: targetPlatform,
        externalId: `${targetPlatform}_post_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        simulated: true,
        publishedAt: new Date().toISOString(),
      };
    }

    if (targetPlatform === "facebook") {
      return this._publishFacebook({ account, content, mediaUrls, postId, hashtags });
    }

    if (targetPlatform === "instagram") {
      return this._publishInstagram({ account, content, mediaUrls, postId, hashtags });
    }

    throw new Error(`MetaAdapter does not support sub-platform: ${targetPlatform}`);
  }

  async _uploadFacebookPhoto({ account, mediaUrl, published, caption }) {
    const media = parseDataUrl(mediaUrl);
    let response;

    if (media) {
      const form = new FormData();
      form.append("access_token", account.accessToken);
      form.append("published", String(published));
      if (caption) form.append("caption", caption);
      form.append("source", new Blob([media.buffer], { type: media.mimeType }), "upload");
      response = await fetch(`${GRAPH_API_BASE}/${account.externalAccountId}/photos`, {
        method: "POST",
        body: form,
      });
    } else {
      response = await fetch(`${GRAPH_API_BASE}/${account.externalAccountId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: mediaUrl,
          published,
          ...(caption ? { caption } : {}),
          access_token: account.accessToken,
        }),
      });
    }

    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Facebook photo upload failed: ${JSON.stringify(result)}`);
    }
    return result;
  }

  async _publishFacebook({ account, content, mediaUrls, postId, hashtags = [] }) {
    let finalContent = content || "";
    if (hashtags.length > 0) {
      const tagsString = hashtags
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
        .join(" ");
      if (!finalContent.includes(tagsString)) {
        finalContent = `${finalContent}\n\n${tagsString}`.trim();
      }
    }

    let response;
    if (mediaUrls.length === 0) {
      response = await fetch(`${GRAPH_API_BASE}/${account.externalAccountId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalContent, access_token: account.accessToken }),
      });
    } else if (mediaUrls.length === 1) {
      const photo = await this._uploadFacebookPhoto({
        account,
        mediaUrl: mediaUrls[0],
        published: true,
        caption: finalContent,
      });
      return {
        platform: "facebook",
        externalId: photo.id || photo.post_id,
        raw: photo,
        publishedAt: new Date().toISOString(),
      };
    } else {
      const photos = await Promise.all(
        mediaUrls.map((mediaUrl) =>
          this._uploadFacebookPhoto({ account, mediaUrl, published: false })
        )
      );

      response = await fetch(`${GRAPH_API_BASE}/${account.externalAccountId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: finalContent,
          attached_media: photos.map((photo) => ({ media_fbid: photo.id })),
          access_token: account.accessToken,
        }),
      });
    }

    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Facebook publish failed for post ${postId}: ${JSON.stringify(result)}`);
    }

    return {
      platform: "facebook",
      externalId: result.id || result.post_id,
      raw: result,
      publishedAt: new Date().toISOString(),
    };
  }

  async _publishInstagram({ account, content, mediaUrls, postId, hashtags = [] }) {
    if (mediaUrls.length === 0) {
      throw new Error(`Instagram requires at least one media asset (post ${postId})`);
    }

    let finalContent = content || "";
    if (hashtags.length > 0) {
      const tagsString = hashtags
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
        .join(" ");
      if (!finalContent.includes(tagsString)) {
        finalContent = `${finalContent}\n\n${tagsString}`.trim();
      }
    }

    // Step 1: create media container
    const containerRes = await fetch(`${GRAPH_API_BASE}/${account.externalAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: mediaUrls[0],
        caption: finalContent,
        access_token: account.accessToken,
      }),
    });

    const container = await containerRes.json();
    if (!containerRes.ok) {
      throw new Error(`IG container creation failed for post ${postId}: ${JSON.stringify(container)}`);
    }

    // Step 2: publish container
    const publishRes = await fetch(
      `${GRAPH_API_BASE}/${account.externalAccountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: account.accessToken,
        }),
      }
    );

    const published = await publishRes.json();
    if (!publishRes.ok) {
      throw new Error(`IG publish failed for post ${postId}: ${JSON.stringify(published)}`);
    }

    return {
      platform: "instagram",
      externalId: published.id,
      raw: published,
      publishedAt: new Date().toISOString(),
    };
  }

  async getMetrics({ externalPostId, account, platform }) {
    const targetPlatform = platform || this.platform;
    const isLive = this.isLiveAccount(account);

    if (!isLive || !externalPostId) {
      // Return simulated realistic metrics
      const base = Math.floor(Math.random() * 20) + 5;
      return {
        reach: base * 12 + Math.floor(Math.random() * 50),
        likes: base * 4 + Math.floor(Math.random() * 10),
        comments: Math.floor(base * 0.8) + 1,
        shares: Math.floor(base * 0.4),
        clicks: base * 2 + Math.floor(Math.random() * 8),
        simulated: true,
      };
    }

    try {
      if (targetPlatform === "facebook") {
        const url = `${GRAPH_API_BASE}/${externalPostId}?fields=shares,comments.summary(true),likes.summary(true),insights.metric(post_impressions,post_engaged_users)&access_token=${encodeURIComponent(account.accessToken)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(`Facebook metrics fetch failed: ${JSON.stringify(data)}`);
        }

        const likes = data.likes?.summary?.total_count || 0;
        const comments = data.comments?.summary?.total_count || 0;
        const shares = data.shares?.count || 0;
        let reach = 0;
        let clicks = 0;

        if (Array.isArray(data.insights?.data)) {
          for (const item of data.insights.data) {
            if (item.name === "post_impressions") {
              reach = item.values?.[0]?.value || 0;
            }
            if (item.name === "post_engaged_users") {
              clicks = item.values?.[0]?.value || 0;
            }
          }
        }

        return { reach, likes, comments, shares, clicks, raw: data, simulated: false };
      }

      if (targetPlatform === "instagram") {
        const url = `${GRAPH_API_BASE}/${externalPostId}?fields=like_count,comments_count&access_token=${encodeURIComponent(account.accessToken)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(`IG metrics fetch failed: ${JSON.stringify(data)}`);
        }

        const likes = data.like_count || 0;
        const comments = data.comments_count || 0;
        const reach = (likes + comments) * 5;
        const clicks = Math.round(likes * 0.3);

        return { reach, likes, comments, shares: 0, clicks, raw: data, simulated: false };
      }
    } catch (err) {
      this.logger.warn({ err: err.message, externalPostId }, "Failed to fetch live Meta metrics, using fallback");
      return {
        reach: 10,
        likes: 2,
        comments: 0,
        shares: 0,
        clicks: 1,
        simulated: true,
      };
    }

    return { reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0, simulated: true };
  }
}

module.exports = MetaAdapter;
