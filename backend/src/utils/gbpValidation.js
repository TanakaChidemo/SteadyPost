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

/**
 * Returns true if the account is verified for publishing.
 * For GBP:
 * - Must have verificationState === "VERIFIED" (or verified === true if no state string).
 * - Missing, null, undefined, UNVERIFIED, or PENDING_VERIFICATION counts as unverified.
 * - verified === false or isVerified === false explicitly prevents publishing.
 * For non-GBP accounts:
 * - Returns true unless explicitly marked unverified.
 */
function isGbpListingVerified(account) {
  if (!account) return false;
  // If account has an explicit platform that is not GBP, location verification does not apply
  if (account.platform && !isGbpPlatform(account.platform)) {
    return true;
  }
  // For GBP accounts:
  if (typeof account.verificationState === "string") {
    return (
      account.verificationState.trim().toUpperCase() === "VERIFIED" &&
      account.verified !== false &&
      account.isVerified !== false
    );
  }
  if (typeof account.verified === "boolean") {
    return account.verified === true;
  }
  if (typeof account.isVerified === "boolean") {
    return account.isVerified === true;
  }
  // If neither is specified on GBP, default to unverified (do NOT allow publishing)
  return false;
}

/**
 * Standardizes verification fields when creating or saving accounts.
 * For GBP: defaults to UNVERIFIED and verified = false unless explicitly VERIFIED.
 * Never stores verificationState: "VERIFIED" if verified is false.
 * For non-GBP: defaults to null verificationState and verified = null (or true).
 */
function resolveAccountVerification(platform, verificationState, verified) {
  if (isGbpPlatform(platform)) {
    let state = null;
    if (typeof verificationState === "string" && verificationState.trim()) {
      state = verificationState.trim().toUpperCase();
    }
    if (!state) {
      state = verified === true ? "VERIFIED" : "UNVERIFIED";
    }
    const isVerified = state === "VERIFIED" && verified !== false;
    const finalState = isVerified
      ? "VERIFIED"
      : state === "PENDING_VERIFICATION"
      ? "PENDING_VERIFICATION"
      : "UNVERIFIED";
    return {
      verificationState: finalState,
      verified: isVerified,
    };
  }
  return {
    verificationState: verificationState || null,
    verified: typeof verified === "boolean" ? verified : null,
  };
}

function parseDateParts(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === "object" && dateVal.year && dateVal.month && dateVal.day) {
    const y = Number(dateVal.year);
    const m = Number(dateVal.month);
    const d = Number(dateVal.day);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { year: y, month: m, day: d };
    }
    return null;
  }
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { year: y, month: m, day: d };
      }
    }
  }
  return null;
}

function validateGbpOptions(gbpOptions, { requireDates = false } = {}) {
  if (!gbpOptions || typeof gbpOptions !== "object") return null;
  const topicType = String(gbpOptions.topicType || "").toUpperCase().trim();
  if (topicType === "EVENT") {
    const ev = gbpOptions.event || {};
    const sch = ev.schedule || {};
    const start = sch.startDate || ev.startDate;
    const end = sch.endDate || ev.endDate;

    if (requireDates && (!start || !end)) {
      return "Google Business Profile EVENT posts require start date and end date";
    }

    if (start) {
      const pStart = parseDateParts(start);
      if (!pStart) {
        return "Google Business Profile EVENT post start date must be a valid date (YYYY-MM-DD)";
      }
    }

    if (end) {
      const pEnd = parseDateParts(end);
      if (!pEnd) {
        return "Google Business Profile EVENT post end date must be a valid date (YYYY-MM-DD)";
      }
    }

    if (start && end) {
      const pStart = parseDateParts(start);
      const pEnd = parseDateParts(end);
      if (pStart && pEnd) {
        const startVal = pStart.year * 10000 + pStart.month * 100 + pStart.day;
        const endVal = pEnd.year * 10000 + pEnd.month * 100 + pEnd.day;
        if (endVal < startVal) {
          return "Google Business Profile EVENT post end date must be on or after start date";
        }
      }
    }
  }
  return null;
}

function getGbpUnverifiedError(postOrAccountId) {
  const prefix = postOrAccountId ? `Post ${postOrAccountId}: ` : "";
  return {
    error: `${prefix}Google Business Profile listing is unverified. Verification can take several business days.`,
    code: "GBP_LISTING_UNVERIFIED",
    handoff: "setup_walkthrough",
    platform: "gbp",
    blockerReason: "unverified_gbp",
    walkthroughStep: 3,
  };
}

module.exports = {
  isGbpPlatform,
  isGbpAccount,
  isGbpListingVerified,
  resolveAccountVerification,
  parseDateParts,
  validateGbpOptions,
  getGbpUnverifiedError,
};
