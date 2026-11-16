function isGbpPlatform(platform) {
  const norm = String(platform || "").toLowerCase().trim();
  return norm === "gbp" || norm === "google_business" || norm === "google";
}

function isGbpAccount(accountOrPlatform) {
  if (!accountOrPlatform) return false;
  if (typeof accountOrPlatform === "string") {
    return isGbpPlatform(accountOrPlatform);
  }
  return isGbpPlatform(accountOrPlatform.platform);
}

function isGbpListingVerified(account) {
  if (!account) return false;
  // If account has an explicit platform that is not GBP, location verification does not apply
  if (account.platform && !isGbpPlatform(account.platform)) {
    return true;
  }
  // If verificationState is specified, only explicitly "VERIFIED" is publishable
  if (account.verificationState !== undefined) {
    return account.verificationState === "VERIFIED" && account.isVerified !== false;
  }
  // If isVerified is explicitly specified
  if (account.isVerified !== undefined) {
    return account.isVerified === true;
  }
  // If neither is specified (e.g. sandbox mock account), default to verified
  return true;
}

function getGbpUnverifiedError(postOrAccountId) {
  const prefix = postOrAccountId ? `Post ${postOrAccountId}: ` : "";
  return {
    error: `${prefix}Google Business Profile listing is unverified. Verification can take several business days.`,
    code: "GBP_LISTING_UNVERIFIED",
    handoff: "setup_walkthrough",
    walkthroughStep: 5,
  };
}

module.exports = {
  isGbpPlatform,
  isGbpAccount,
  isGbpListingVerified,
  getGbpUnverifiedError,
};
