const logger = require("../../config/logger");
const socialAccountModel = require("../../models/socialAccount.model");
const { getAdapter } = require("./adapterRegistry");

const MOCK_CREDENTIALS = {
  isMock: true,
  pageId: "mock_fb_page_102938",
  pageAccessToken: "mock_fb_token",
  igUserId: "mock_ig_user_445566",
  igAccessToken: "mock_ig_token",
  externalAccountId: "mock_account_102938",
  accessToken: "mock_fb_token",
};

/**
 * Look up the linked social account.
 */
async function getSocialAccountCredentials(socialAccountId) {
  if (!socialAccountId) {
    return MOCK_CREDENTIALS;
  }

  const account = await socialAccountModel.findById(socialAccountId);
  if (!account) {
    logger.warn({ socialAccountId }, "Social account not found, using sandbox simulation");
    return MOCK_CREDENTIALS;
  }

  return {
    isMock: !account.accessToken,
    pageId: account.externalAccountId,
    pageAccessToken: account.accessToken,
    igUserId: account.externalAccountId,
    igAccessToken: account.accessToken,
    externalAccountId: account.externalAccountId,
    accessToken: account.accessToken,
    displayName: account.displayName,
    workspaceId: account.workspaceId,
    ownerId: account.ownerId,
    platform: account.platform,
    id: account.id || account._id,
  };
}

/**
 * Publish via platform adapter (delegates to MetaAdapter or registered platform adapter).
 */
async function publish({ platform, postId, content, mediaUrls = [], socialAccountId, hashtags = [], workspaceId, options = {} }) {
  const account = await getSocialAccountCredentials(socialAccountId);
  const targetPlatform = platform || account.platform || "facebook";
  const adapter = getAdapter(targetPlatform);

  return adapter.publish({
    platform: targetPlatform,
    postId,
    content,
    mediaUrls,
    hashtags,
    account,
    workspaceId: workspaceId || account.workspaceId,
    options,
  });
}

module.exports = {
  publish,
  getSocialAccountCredentials,
};
