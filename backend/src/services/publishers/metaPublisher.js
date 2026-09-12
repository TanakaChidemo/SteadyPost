const logger = require("../../config/logger");
const socialAccountModel = require("../../models/socialAccount.model");

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const MOCK_CREDENTIALS = {
  isMock: true,
  pageId: "mock_fb_page_102938",
  pageAccessToken: "mock_fb_token",
  igUserId: "mock_ig_user_445566",
  igAccessToken: "mock_ig_token",
};

/**
 * Look up the linked social account. This scaffold has no real OAuth tokens
 * (accounts are hardcoded demo data), so unless META_APP_ID is configured for
 * a real Graph API integration, every publish goes through the sandbox
 * simulator below instead of calling Facebook/Instagram for real.
 */
async function getSocialAccountCredentials(socialAccountId) {
  if (!socialAccountId || !process.env.META_APP_ID) {
    return MOCK_CREDENTIALS;
  }

  const account = await socialAccountModel.findById(socialAccountId);
  if (!account) {
    logger.warn({ socialAccountId }, "Social account not found, using sandbox simulation");
    return MOCK_CREDENTIALS;
  }

  return {
    isMock: false,
    pageId: account.externalAccountId,
    pageAccessToken: account.accessToken,
    igUserId: account.externalAccountId,
    igAccessToken: account.accessToken,
    displayName: account.displayName,
  };
}

/**
 * Publish to Facebook or Instagram
 */
async function publish({ platform, postId, content, mediaUrls = [], socialAccountId }) {
  const account = await getSocialAccountCredentials(socialAccountId);

  if (account.isMock) {
    logger.info({ platform, postId }, "Publishing via Meta Sandbox Simulator");
    return {
      platform,
      externalId: `${platform}_post_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      simulated: true,
      publishedAt: new Date().toISOString(),
    };
  }

  if (platform === "facebook") {
    return publishToFacebookPage({ account, content, mediaUrls, postId });
  }

  if (platform === "instagram") {
    return publishToInstagram({ account, content, mediaUrls, postId });
  }

  throw new Error(`metaPublisher does not support platform: ${platform}`);
}

async function publishToFacebookPage({ account, content, mediaUrls, postId }) {
  const endpoint =
    mediaUrls.length > 0
      ? `${GRAPH_API_BASE}/${account.pageId}/photos`
      : `${GRAPH_API_BASE}/${account.pageId}/feed`;

  const body =
    mediaUrls.length > 0
      ? { url: mediaUrls[0], caption: content, access_token: account.pageAccessToken }
      : { message: content, access_token: account.pageAccessToken };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Facebook publish failed for post ${postId}: ${JSON.stringify(result)}`);
  }
  return { platform: "facebook", externalId: result.id || result.post_id, raw: result };
}

async function publishToInstagram({ account, content, mediaUrls, postId }) {
  if (mediaUrls.length === 0) {
    throw new Error(`Instagram requires at least one media asset (post ${postId})`);
  }

  // Step 1: create media container
  const containerRes = await fetch(`${GRAPH_API_BASE}/${account.igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: mediaUrls[0],
      caption: content,
      access_token: account.igAccessToken,
    }),
  });

  const container = await containerRes.json();
  if (!containerRes.ok) {
    throw new Error(`IG container creation failed for post ${postId}: ${JSON.stringify(container)}`);
  }

  // Step 2: publish container
  const publishRes = await fetch(`${GRAPH_API_BASE}/${account.igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: container.id,
      access_token: account.igAccessToken,
    }),
  });

  const published = await publishRes.json();
  if (!publishRes.ok) {
    throw new Error(`IG publish failed for post ${postId}: ${JSON.stringify(published)}`);
  }

  return { platform: "instagram", externalId: published.id, raw: published };
}

module.exports = { publish, getSocialAccountCredentials };
