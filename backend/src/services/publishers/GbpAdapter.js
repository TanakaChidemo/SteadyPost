const BaseAdapter = require("./BaseAdapter");
const businessProfileModel = require("../../models/businessProfile.model");
const smartLinkModel = require("../../models/smartLink.model");
const { isGbpListingVerified } = require("../../utils/gbpValidation");

const VALID_TOPIC_TYPES = ["STANDARD", "EVENT", "OFFER", "ALERT"];
const VALID_CTA_ACTIONS = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"];

function parseDateParts(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === "object" && dateVal.year && dateVal.month && dateVal.day) {
    return {
      year: Number(dateVal.year),
      month: Number(dateVal.month),
      day: Number(dateVal.day),
    };
  }
  if (typeof dateVal === "string") {
    const parts = dateVal.trim().split("-").map((p) => parseInt(p, 10));
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
  }
  return null;
}

/**
 * Platform adapter for Google Business Profile (GBP) Local Posts (#13).
 *
 * Implements:
 * 1. Four GBP Local Post types: STANDARD, EVENT, OFFER, ALERT.
 * 2. Six Call-To-Action (CTA) buttons: BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL.
 * 3. Access risk mitigation: swappable architecture supporting direct Google API,
 *    third-party posting aggregator (e.g. bundle.social), and sandbox simulation.
 * 4. Google per-post insights deprecation handling: post performance is tracked
 *    via #12 smart-link click analytics rather than deprecated Google APIs.
 * 5. Listing verification enforcement: unverified listings are gated and handed off
 *    to the Setup Walkthrough (#08, F27).
 */
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
      (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_GBP_API_KEY || process.env.GBP_ACCESS_TOKEN)
    );
  }

  getPostingMode(account) {
    if (process.env.GBP_POSTING_MODE === "aggregator") return "aggregator";
    if (process.env.GBP_POSTING_MODE === "direct") return "direct";
    if (process.env.GBP_AGGREGATOR_API_KEY || process.env.GBP_AGGREGATOR_URL) return "aggregator";
    if (this.isLiveAccount(account)) return "direct";
    return "simulator";
  }

  /**
   * Builds and validates a Google Business Profile Local Post payload.
   */
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

    const requestedTopicType = String(options.topicType || "STANDARD").toUpperCase().trim();
    const topicType = VALID_TOPIC_TYPES.includes(requestedTopicType) ? requestedTopicType : "STANDARD";

    const payload = {
      languageCode: options.languageCode || "en-US",
      summary: content ? content.trim() : "",
      topicType,
    };

    // Call To Action (BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL)
    let ctaAction = options.callToAction?.actionType;
    if (!ctaAction && options.ctaAction) ctaAction = options.ctaAction;
    if (!ctaAction && websiteUrl && topicType !== "ALERT") ctaAction = "LEARN_MORE";

    if (ctaAction) {
      const normalizedAction = String(ctaAction).toUpperCase().trim();
      if (VALID_CTA_ACTIONS.includes(normalizedAction)) {
        if (normalizedAction === "CALL") {
          // Google routes CALL actions directly to the business phone on the listing
          payload.callToAction = { actionType: "CALL" };
        } else {
          const targetUrl = options.callToAction?.url || options.ctaUrl || websiteUrl || "https://google.com";
          payload.callToAction = {
            actionType: normalizedAction,
            url: targetUrl,
          };
        }
      }
    }

    // EVENT details (schedule & title) - only for EVENT topicType
    if (topicType === "EVENT") {
      const eventData = options.event || {};
      const scheduleData = eventData.schedule || {};
      const startDate = parseDateParts(scheduleData.startDate || eventData.startDate);
      const endDate = parseDateParts(scheduleData.endDate || eventData.endDate);

      if (!startDate || !endDate) {
        throw new Error("Google Business Profile EVENT posts require valid startDate and endDate.");
      }

      const startVal = startDate.year * 10000 + startDate.month * 100 + startDate.day;
      const endVal = endDate.year * 10000 + endDate.month * 100 + endDate.day;
      if (endVal < startVal) {
        throw new Error("Google Business Profile EVENT post end date must be on or after start date.");
      }

      payload.event = {
        title: eventData.title || (content ? content.slice(0, 50).trim() : "Local Business Event"),
        schedule: {
          startDate,
          startTime: scheduleData.startTime || eventData.startTime || { hours: 10, minutes: 0 },
          endDate,
          endTime: scheduleData.endTime || eventData.endTime || { hours: 18, minutes: 0 },
        },
      };
    }

    // OFFER details (couponCode, redeemOnlineUrl, termsConditions) - only for OFFER topicType
    if (topicType === "OFFER") {
      const offerData = options.offer || {};
      payload.offer = {};
      const couponCode = offerData.couponCode || options.couponCode;
      if (couponCode) payload.offer.couponCode = couponCode;
      const redeemOnlineUrl = offerData.redeemOnlineUrl || options.redeemOnlineUrl || websiteUrl;
      if (redeemOnlineUrl) payload.offer.redeemOnlineUrl = redeemOnlineUrl;
      const terms = offerData.termsConditions || options.termsConditions;
      if (terms) payload.offer.termsConditions = terms;

      if (offerData.event || options.event) {
        const ev = offerData.event || options.event;
        const sch = ev.schedule || {};
        const startDate = parseDateParts(sch.startDate || ev.startDate);
        const endDate = parseDateParts(sch.endDate || ev.endDate);
        payload.event = {
          title: ev.title || (content ? content.slice(0, 50).trim() : "Offer Event"),
          schedule: {
            ...(startDate ? { startDate } : {}),
            startTime: sch.startTime || ev.startTime || { hours: 10, minutes: 0 },
            ...(endDate ? { endDate } : {}),
            endTime: sch.endTime || ev.endTime || { hours: 18, minutes: 0 },
          },
        };
      }
    }

    // ALERT details (e.g. COVID_19 or safety alert) - only for ALERT topicType
    if (topicType === "ALERT") {
      payload.alertType = options.alertType || "COVID_19";
    }

    // Media (Photos)
    if (mediaUrls && mediaUrls.length > 0) {
      payload.media = mediaUrls.map((url) => ({
        mediaFormat: "PHOTO",
        sourceUrl: url,
      }));
    }

    return payload;
  }

  /**
   * Publishes a GBP Local Post through the configured mode.
   */
  async publish({ postId, content, mediaUrls = [], account, workspaceId, options = {} }) {
    // 1. Guardrail: Verified listing check
    if (account && !isGbpListingVerified({ platform: "gbp", ...account })) {
      this.logger.warn({ postId, accountId: account.id }, "Publish blocked: GBP listing is unverified");
      throw new Error(
        "Google Business Profile listing is unverified. Verification can take several business days. Complete verification in the setup walkthrough (#08, F27)."
      );
    }

    const payload = await this.buildLocalPostPayload({ content, mediaUrls, options, workspaceId });
    const mode = this.getPostingMode(account);

    this.logger.info({ postId, mode, topicType: payload.topicType }, "Publishing GBP Local Post (#13)");

    if (mode === "aggregator") {
      return this.publishViaAggregator({ postId, payload, account });
    }

    if (mode === "direct") {
      return this.publishDirectGbp({ postId, payload, account });
    }

    // Default Sandbox Simulator Mode
    return this.publishSimulator({ postId, payload, options });
  }

  /**
   * Simulator mode: provides instantaneous mock responses for sandbox testing.
   */
  async publishSimulator({ postId, payload, options = {} }) {
    this.logger.info({ postId, options }, "Publishing via GBP Local Posts Sandbox Simulator (#13)");
    const fakeId = `gbp_post_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return {
      platform: "gbp",
      provider: "simulator",
      externalId: fakeId,
      url: `https://business.google.com/posts/l/${fakeId}`,
      simulated: true,
      topicType: payload.topicType,
      callToAction: payload.callToAction,
      alertType: payload.alertType,
      event: payload.event,
      offer: payload.offer,
      publishedAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregator posting mode: uses third-party social aggregator (e.g. bundle.social).
   */
  async publishViaAggregator({ postId, payload, account }) {
    const aggregatorUrl = process.env.GBP_AGGREGATOR_URL || "https://api.bundle.social/v1/posts";
    const apiKey = process.env.GBP_AGGREGATOR_API_KEY;
    if (!apiKey) {
      throw new Error("GBP aggregator posting is enabled, but GBP_AGGREGATOR_API_KEY is not configured.");
    }

    try {
      const response = await fetch(aggregatorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          channel: "google_business",
          externalAccountId: account?.externalAccountId,
          localPost: payload,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Posting aggregator returned ${response.status}: ${JSON.stringify(data)}`);
      }

      const externalId = data.id || data.postId || `agg_gbp_${Date.now()}`;
      return {
        platform: "gbp",
        provider: "aggregator",
        externalId,
        url: data.url || `https://business.google.com/posts/l/${externalId}`,
        raw: data,
        publishedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err: err.message, postId }, "Aggregator GBP posting failed");
      throw err;
    }
  }

  /**
   * Direct Google Business Profile API mode.
   */
  async publishDirectGbp({ postId, payload, account }) {
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
        provider: "google_direct",
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

  /**
   * Engagement metrics for GBP Local Posts.
   *
   * NOTE: Google deprecated per-post insights with no direct replacement.
   * Post-level performance for GBP depends entirely on smart-link tracking (#12)
   * which tracks CTA and link click engagement.
   */
  async getMetrics({ externalPostId: _externalPostId, account, postId }) {
    let smartLinkClicks = 0;
    if (postId) {
      try {
        const smartLinks = await smartLinkModel.findByPostId(postId);
        smartLinkClicks = smartLinks.reduce((sum, link) => sum + (link.clickCount || 0), 0);
      } catch (err) {
        this.logger.warn({ postId, err: err.message }, "Could not query smart-link clicks for GBP post");
      }
    }

    const mode = this.getPostingMode(account);
    const isSimulated = mode === "simulator";

    if (isSimulated) {
      // In simulator mode, provide realistic local discovery metrics alongside smart-link clicks
      const searchViews = Math.floor(Math.random() * 80) + 15;
      const simulatedClicks = smartLinkClicks || Math.floor(Math.random() * 15) + 3;

      return {
        reach: searchViews,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: simulatedClicks,
        simulated: true,
        note: "Google deprecated per-post insights. Performance measured via smart-link clicks (#12).",
      };
    }

    // Live mode: Per Google deprecation, reach/likes/comments are 0; clicks come from smart-link tracking
    return {
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: smartLinkClicks,
      simulated: false,
      note: "Google deprecated per-post insights. Clicks tracked via smart-links (#12).",
    };
  }
}

module.exports = GbpAdapter;
