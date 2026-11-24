const walkthroughData = require("../data/channelWalkthroughs.json");
const channelSetupProgressModel = require("../models/channelSetupProgress.model");
const socialAccountModel = require("../models/socialAccount.model");
const { isGbpListingVerified } = require("../utils/gbpValidation");

const VALID_PLATFORMS = channelSetupProgressModel.PLATFORMS;
const VALID_STATUSES = channelSetupProgressModel.STATUSES;

function getPlatformGuide(platform) {
  return walkthroughData.platforms[platform] || null;
}

function getAllowedBlockersForPlatform(platform) {
  const guide = getPlatformGuide(platform);
  if (!guide) return [];
  const fromSteps = (guide.steps || []).flatMap((s) => (Array.isArray(s.blockerCodes) ? s.blockerCodes : []));
  const fromMessages = Object.keys(guide.blockerMessages || {});
  return Array.from(new Set([...fromSteps, ...fromMessages]));
}

/**
 * A Google Business Profile listing only counts as publish-ready/done once it
 * has been verified according to the shared isGbpListingVerified rule.
 */
function isGbpAccountVerified(account) {
  return isGbpListingVerified(account);
}

function isPlatformPublishReady(platform, connectedAccounts = []) {
  const matching = connectedAccounts.filter(
    (a) => a.platform === platform || (platform === "gbp" && a.platform === "google_business")
  );
  if (matching.length === 0) return false;
  if (platform === "gbp") {
    return matching.some(isGbpListingVerified);
  }
  return true;
}

function buildWalkthroughHandoff(platform, blockerReason, stepNumber = null) {
  const guide = getPlatformGuide(platform);
  if (!guide) return null;

  const matchingStep =
    (blockerReason &&
      guide.steps.find((s) => Array.isArray(s.blockerCodes) && s.blockerCodes.includes(blockerReason))) ||
    (stepNumber && guide.steps.find((s) => s.number === Number(stepNumber))) ||
    guide.steps[0];

  const neutralMessage =
    platform === "instagram"
      ? "Instagram isn't connected yet."
      : platform === "facebook"
      ? "Facebook Page isn't connected yet."
      : platform === "gbp"
      ? "Google Business Profile isn't verified and connected yet."
      : `${guide.name} isn't connected yet.`;

  return {
    feature: "F27",
    specNumber: "#08",
    platform,
    platformName: guide.name,
    lastChecked: guide.lastChecked,
    step: matchingStep.id,
    stepNumber: matchingStep.number,
    blockerReason: blockerReason || null,
    title: matchingStep.title,
    message: (blockerReason && guide.blockerMessages?.[blockerReason]) || neutralMessage,
    checklist: matchingStep.instructions,
    linkText: matchingStep.linkText,
    linkUrl: matchingStep.linkUrl,
    delegation: guide.delegation,
  };
}

/**
 * Records a detected blocker (or completion) for a workspace + platform and
 * returns both the saved progress document and the matching walkthrough payload.
 */
async function recordDetectedState({
  workspaceId,
  userId,
  platform,
  blockerReason = null,
  status = null,
  currentStep = null,
  completedSteps = undefined,
}) {
  const guide = getPlatformGuide(platform);
  const totalSteps = guide ? guide.steps.length : 4;

  let resolvedStep = currentStep;
  if (!resolvedStep && blockerReason && guide) {
    const match = guide.steps.find(
      (s) => Array.isArray(s.blockerCodes) && s.blockerCodes.includes(blockerReason)
    );
    resolvedStep = match ? match.number : 1;
  }
  if (!resolvedStep) {
    resolvedStep = status === "done" ? totalSteps : 1;
  }

  const resolvedStatus = status || (blockerReason ? "in_progress" : "done");
  const resolvedCompleted =
    completedSteps !== undefined
      ? completedSteps
      : resolvedStatus === "done"
      ? Array.from({ length: totalSteps }, (_, idx) => idx + 1)
      : undefined;

  let progress = null;
  if (workspaceId) {
    progress = await channelSetupProgressModel.upsertProgress(workspaceId, platform, {
      currentStep: resolvedStep,
      ...(resolvedCompleted !== undefined ? { completedSteps: resolvedCompleted } : {}),
      status: resolvedStatus,
      blockerReason,
      lastCheckedAt: new Date(),
      updatedBy: userId || null,
    });
  }

  const walkthrough =
    resolvedStatus !== "done"
      ? buildWalkthroughHandoff(platform, blockerReason, resolvedStep)
      : null;
  return { progress, walkthrough };
}

/**
 * GET /api/v1/channel-setup/guides
 */
async function getGuides(_req, res) {
  return res.json(walkthroughData);
}

/**
 * GET /api/v1/channel-setup/progress
 */
async function getProgress(req, res) {
  const workspaceId = req.workspaceId;
  const [savedItems, connectedAccounts] = await Promise.all([
    channelSetupProgressModel.listByWorkspace(workspaceId),
    socialAccountModel.list({ workspaceId }),
  ]);

  const byPlatform = new Map(savedItems.map((item) => [item.platform, item]));

  const items = VALID_PLATFORMS.map((platform) => {
    const guide = getPlatformGuide(platform);
    const totalSteps = guide ? guide.steps.length : 4;
    const isConnected = isPlatformPublishReady(platform, connectedAccounts);
    const existing = byPlatform.get(platform);

    if (existing) {
      if (isConnected && existing.status !== "done" && !existing.blockerReason) {
        return {
          ...existing,
          status: "done",
          currentStep: totalSteps,
          completedSteps: Array.from({ length: totalSteps }, (_, i) => i + 1),
          isConnected: true,
          lastChecked: guide?.lastChecked || null,
        };
      }
      return {
        ...existing,
        isConnected,
        lastChecked: guide?.lastChecked || null,
      };
    }

    return {
      workspaceId,
      platform,
      currentStep: isConnected ? totalSteps : 1,
      completedSteps: isConnected ? Array.from({ length: totalSteps }, (_, i) => i + 1) : [],
      status: isConnected ? "done" : "not_started",
      blockerReason: null,
      lastCheckedAt: null,
      isConnected,
      lastChecked: guide?.lastChecked || null,
    };
  });

  return res.json({
    workspaceId,
    viewerRole: req.membership?.role || "viewer",
    items,
  });
}

/**
 * PUT /api/v1/channel-setup/progress/:platform
 */
async function updateProgress(req, res) {
  const { platform } = req.params;
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  const guide = getPlatformGuide(platform);
  const maxStep = guide ? guide.steps.length : 4;
  const allowedBlockers = getAllowedBlockersForPlatform(platform);
  const { currentStep, completedSteps, status, blockerReason } = req.body || {};

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  if (blockerReason !== undefined && blockerReason !== null) {
    if (!allowedBlockers.includes(blockerReason)) {
      return res.status(400).json({
        error: `Blocker '${blockerReason}' is not valid for platform '${platform}'`,
      });
    }
  }

  const update = {
    updatedBy: req.user?.id || null,
    lastCheckedAt: new Date(),
  };

  if (currentStep !== undefined) {
    const stepNum = Number(currentStep);
    if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > maxStep) {
      return res.status(400).json({ error: `currentStep must be between 1 and ${maxStep}` });
    }
    update.currentStep = stepNum;
  }

  if (completedSteps !== undefined) {
    if (
      !Array.isArray(completedSteps) ||
      !completedSteps.every((n) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= maxStep)
    ) {
      return res.status(400).json({
        error: `completedSteps must be an array of step numbers between 1 and ${maxStep}`,
      });
    }
    update.completedSteps = completedSteps.map(Number);
  }

  if (status !== undefined) {
    update.status = status;
    if (status === "done") {
      update.blockerReason = null;
    }
  } else if (currentStep !== undefined) {
    const existing = await channelSetupProgressModel.findByWorkspaceAndPlatform(req.workspaceId, platform);
    if (!existing || existing.status === "not_started") {
      update.status = "in_progress";
    }
  }

  if (blockerReason !== undefined) {
    update.blockerReason = blockerReason;
  }

  const saved = await channelSetupProgressModel.upsertProgress(req.workspaceId, platform, update);
  const walkthrough = saved.blockerReason
    ? buildWalkthroughHandoff(platform, saved.blockerReason, saved.currentStep)
    : null;

  return res.json({
    progress: saved,
    walkthrough,
  });
}

/**
 * POST /api/v1/channel-setup/check/:platform
 * Powers the "Done — check again" button in the setup walkthrough (#08, F27).
 * Only records a specific blocker when actual detection data is provided;
 * otherwise preserves neutral "not connected yet" state without guessing.
 */
async function checkPlatform(req, res) {
  const { platform } = req.params;
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `Unsupported platform: ${platform}` });
  }

  const workspaceId = req.workspaceId;
  const userId = req.user?.id || null;
  const {
    pages,
    hasPageAccessToken = true,
    instagramAccountType,
    instagramLinkedToPage,
    gbpLocations,
    gbpVerified,
    waitingOnPlatform,
  } = req.body || {};

  const existingAccounts = await socialAccountModel.list({ workspaceId });
  const isAlreadyConnected = isPlatformPublishReady(platform, existingAccounts);
  const existing = await channelSetupProgressModel.findByWorkspaceAndPlatform(workspaceId, platform);

  // 1. Facebook detection
  if (platform === "facebook") {
    if (Array.isArray(pages)) {
      if (pages.length === 0) {
        const result = await recordDetectedState({
          workspaceId,
          userId,
          platform: "facebook",
          blockerReason: "no_facebook_page",
          status: "in_progress",
        });
        return res.json({
          connected: false,
          handoff: "setup_walkthrough",
          ...result,
        });
      }
      if (!hasPageAccessToken) {
        const result = await recordDetectedState({
          workspaceId,
          userId,
          platform: "facebook",
          blockerReason: "missing_page_permissions",
          status: "in_progress",
        });
        return res.json({
          connected: false,
          handoff: "setup_walkthrough",
          ...result,
        });
      }
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "facebook",
        blockerReason: null,
        status: "done",
      });
      return res.json({ connected: true, handoff: null, ...result });
    }

    if (isAlreadyConnected) {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "facebook",
        blockerReason: null,
        status: "done",
      });
      return res.json({ connected: true, handoff: null, ...result });
    }

    // No Meta lookup data provided — don't invent a blocker if none was detected yet
    const stepToKeep = existing?.currentStep || 1;
    const blockerToKeep = existing?.blockerReason || null;
    const saved = await channelSetupProgressModel.upsertProgress(workspaceId, "facebook", {
      currentStep: stepToKeep,
      status: existing?.status && existing.status !== "not_started" ? existing.status : "in_progress",
      blockerReason: blockerToKeep,
      lastCheckedAt: new Date(),
      updatedBy: userId,
    });
    return res.json({
      connected: false,
      handoff: "setup_walkthrough",
      message: "Facebook Page isn't connected yet.",
      progress: saved,
      walkthrough: buildWalkthroughHandoff("facebook", blockerToKeep, stepToKeep),
    });
  }

  // 2. Instagram detection
  if (platform === "instagram") {
    if (instagramAccountType === "PERSONAL" || instagramAccountType === "personal") {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "instagram",
        blockerReason: "non_professional_ig",
        status: "in_progress",
      });
      return res.json({ connected: false, handoff: "setup_walkthrough", ...result });
    }

    if (instagramLinkedToPage === false) {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "instagram",
        blockerReason: "unlinked_ig",
        status: "in_progress",
      });
      return res.json({ connected: false, handoff: "setup_walkthrough", ...result });
    }

    if (
      instagramLinkedToPage === true &&
      (instagramAccountType === "BUSINESS" ||
        instagramAccountType === "CREATOR" ||
        instagramAccountType === "professional")
    ) {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "instagram",
        blockerReason: null,
        status: "done",
      });
      return res.json({ connected: true, handoff: null, ...result });
    }

    if (isAlreadyConnected) {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "instagram",
        blockerReason: null,
        status: "done",
      });
      return res.json({ connected: true, handoff: null, ...result });
    }

    // No explicit detection data was passed — do NOT guess non_professional_ig or unlinked_ig.
    // Clear any stale guessed blocker, start at step 1 (or keep saved step), and show a neutral message.
    const stepToKeep = existing?.blockerReason ? 1 : existing?.currentStep || 1;
    const saved = await channelSetupProgressModel.upsertProgress(workspaceId, "instagram", {
      currentStep: stepToKeep,
      status: existing?.status && existing.status !== "not_started" ? existing.status : "in_progress",
      blockerReason: null,
      lastCheckedAt: new Date(),
      updatedBy: userId,
    });
    return res.json({
      connected: false,
      handoff: "setup_walkthrough",
      message: "Instagram isn't connected yet.",
      progress: saved,
      walkthrough: buildWalkthroughHandoff("instagram", null, stepToKeep),
    });
  }

  // 3. Google Business Profile detection
  if (platform === "gbp") {
    if (waitingOnPlatform === true) {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "gbp",
        blockerReason: "unverified_gbp",
        status: "waiting_on_platform",
        currentStep: 3,
      });
      return res.json({
        connected: false,
        waitingOnPlatform: true,
        handoff: "setup_walkthrough",
        ...result,
      });
    }

    if (Array.isArray(gbpLocations)) {
      if (gbpLocations.length === 0) {
        const result = await recordDetectedState({
          workspaceId,
          userId,
          platform: "gbp",
          blockerReason: "no_gbp_listing",
          status: "in_progress",
        });
        return res.json({ connected: false, handoff: "setup_walkthrough", ...result });
      }

      const verifiedLoc = gbpLocations.find((loc) => loc && (loc.verified === true || isGbpAccountVerified(loc)));
      if (!verifiedLoc) {
        const pendingLoc = gbpLocations.find(
          (loc) =>
            loc &&
            (loc.verificationPending === true ||
              String(loc.verificationState || "").toUpperCase() === "PENDING_VERIFICATION")
        );
        const result = await recordDetectedState({
          workspaceId,
          userId,
          platform: "gbp",
          blockerReason: "unverified_gbp",
          status: pendingLoc ? "waiting_on_platform" : "in_progress",
          currentStep: 3,
        });
        return res.json({
          connected: false,
          waitingOnPlatform: Boolean(pendingLoc),
          handoff: "setup_walkthrough",
          ...result,
        });
      }

      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "gbp",
        blockerReason: null,
        status: "done",
      });
      return res.json({ connected: true, handoff: null, ...result });
    }

    if (gbpVerified === false) {
      const keepWaiting = existing?.status === "waiting_on_platform";
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "gbp",
        blockerReason: "unverified_gbp",
        status: keepWaiting ? "waiting_on_platform" : "in_progress",
        currentStep: 3,
      });
      return res.json({
        connected: false,
        waitingOnPlatform: keepWaiting,
        handoff: "setup_walkthrough",
        ...result,
      });
    }

    if (gbpVerified === true || isAlreadyConnected) {
      const result = await recordDetectedState({
        workspaceId,
        userId,
        platform: "gbp",
        blockerReason: null,
        status: "done",
      });
      return res.json({ connected: true, handoff: null, ...result });
    }

    // No explicit GBP location payload and no verified GBP account connected yet
    const keepWaiting = existing?.status === "waiting_on_platform";
    const stepToKeep = existing?.currentStep || 1;
    const blockerToKeep = existing?.blockerReason || null;
    const saved = await channelSetupProgressModel.upsertProgress(workspaceId, "gbp", {
      currentStep: stepToKeep,
      status: keepWaiting ? "waiting_on_platform" : "in_progress",
      blockerReason: blockerToKeep,
      lastCheckedAt: new Date(),
      updatedBy: userId,
    });
    return res.json({
      connected: false,
      waitingOnPlatform: keepWaiting,
      handoff: "setup_walkthrough",
      message: keepWaiting
        ? "Still waiting on Google verification review."
        : "Google Business Profile isn't verified and connected yet.",
      progress: saved,
      walkthrough: buildWalkthroughHandoff("gbp", blockerToKeep, stepToKeep),
    });
  }

  // 4. LinkedIn / Twitter slots
  if (isAlreadyConnected) {
    const result = await recordDetectedState({
      workspaceId,
      userId,
      platform,
      blockerReason: null,
      status: "done",
    });
    return res.json({ connected: true, handoff: null, ...result });
  }

  const saved = await channelSetupProgressModel.upsertProgress(workspaceId, platform, {
    currentStep: existing?.currentStep || 1,
    status: existing?.status === "not_started" || !existing ? "in_progress" : existing.status,
    lastCheckedAt: new Date(),
    updatedBy: userId,
  });
  return res.json({
    connected: false,
    handoff: "setup_walkthrough",
    progress: saved,
    walkthrough: buildWalkthroughHandoff(platform, null, saved.currentStep),
  });
}

module.exports = {
  getPlatformGuide,
  getAllowedBlockersForPlatform,
  isGbpAccountVerified,
  isPlatformPublishReady,
  buildWalkthroughHandoff,
  recordDetectedState,
  getGuides,
  getProgress,
  updateProgress,
  checkPlatform,
};
