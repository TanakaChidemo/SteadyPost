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

// Uploaded media never leaves this server (no object storage — see
// content.controller.js), so mediaUrls[0] is normally a data: URI, not
// something Facebook's servers can fetch on their own. Graph API's `url`
// param requires a publicly reachable link; its `source` param (raw file
// bytes over multipart) doesn't, so that's what we use whenever the media
// is a data: URI. A real http(s) URL (e.g. from a future object-storage
// integration) still goes through `url` as before.
function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const [, mimeType, base64] = match;
  return { mimeType, buffer: Buffer.from(base64, "base64") };
}

// Uploads one photo to the Page's /photos endpoint. `published: false` stages
// it as an unpublished photo for later use in a multi-photo feed post instead
// of posting it standalone.
async function uploadFacebookPhoto({ account, mediaUrl, published, caption }) {
  const media = parseDataUrl(mediaUrl);

  let response;
  if (media) {
    const form = new FormData();
    form.append("access_token", account.pageAccessToken);
    form.append("published", String(published));
    if (caption) form.append("caption", caption);
    form.append("source", new Blob([media.buffer], { type: media.mimeType }), "upload");
    response = await fetch(`${GRAPH_API_BASE}/${account.pageId}/photos`, { method: "POST", body: form });
  } else {
    response = await fetch(`${GRAPH_API_BASE}/${account.pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: mediaUrl,
        published,
        ...(caption ? { caption } : {}),
        access_token: account.pageAccessToken,
      }),
    });
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Facebook photo upload failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function publishToFacebookPage({ account, content, mediaUrls, postId }) {
  let response;

  if (mediaUrls.length === 0) {
    response = await fetch(`${GRAPH_API_BASE}/${account.pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, access_token: account.pageAccessToken }),
    });
  } else if (mediaUrls.length === 1) {
    const photo = await uploadFacebookPhoto({
      account,
      mediaUrl: mediaUrls[0],
      published: true,
      caption: content,
    });
    return { platform: "facebook", externalId: photo.id || photo.post_id, raw: photo };
  } else {
    // A single /photos call only ever attaches one image. For multiple
    // photos, each has to be uploaded unpublished first, then referenced
    // together from one /feed post via attached_media — otherwise every
    // photo past the first is silently dropped from the post.
    const photos = await Promise.all(
      mediaUrls.map((mediaUrl) => uploadFacebookPhoto({ account, mediaUrl, published: false }))
    );

    response = await fetch(`${GRAPH_API_BASE}/${account.pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        attached_media: photos.map((photo) => ({ media_fbid: photo.id })),
        access_token: account.pageAccessToken,
      }),
    });
  }

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
