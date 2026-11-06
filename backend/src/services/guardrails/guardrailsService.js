const { checkBannedClaims } = require("./bannedClaimsChecker");
const { checkDisclosures } = require("./disclosuresChecker");
const { checkTone } = require("./toneMatcher");
const { checkTrendSensitivity } = require("./sensitivityFilter");
const { checkImageGuardrails } = require("./imageGuardrails");
const businessProfileModel = require("../../models/businessProfile.model");

/**
 * Audits a draft post content against brand profile (tone match, banned claims, required disclosures).
 * Note: Platform character and format constraints are managed by the omnichannel adaptation service (F03/F05).
 */
async function auditDraft({
  content = "",
  channel = "instagram",
  hashtags = [],
  mediaUrls = [],
  workspaceId = null,
  profile = null,
} = {}) {
  // Resolve business profile if not provided
  let effectiveProfile = profile;
  if (!effectiveProfile && workspaceId) {
    effectiveProfile = await businessProfileModel.findByWorkspaceId(workspaceId);
  }

  const guardrailsConfig = effectiveProfile?.guardrails || {};
  const targetTones = effectiveProfile?.tone?.length ? effectiveProfile.tone : ["professional"];
  const bannedClaims = guardrailsConfig.bannedClaims || [];
  const bannedKeywords = guardrailsConfig.bannedKeywords || [];
  const requiredDisclosures = guardrailsConfig.requiredDisclosures || [];
  const toneStrictness = guardrailsConfig.toneStrictness || "moderate";

  // Combine body content and hashtags so disclosures (#ad) and banned keywords in hashtags are evaluated
  const normalizedHashtags = Array.isArray(hashtags)
    ? hashtags
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
    : [];
  const fullText = [content, normalizedHashtags.join(" ")].filter(Boolean).join(" ");

  // 1. Banned claims & keywords check
  const bannedCheck = checkBannedClaims({
    text: fullText,
    workspaceBannedClaims: bannedClaims,
    workspaceBannedKeywords: bannedKeywords,
  });

  // 2. Disclosures check
  const disclosuresCheck = checkDisclosures({
    text: fullText,
    workspaceRequiredDisclosures: requiredDisclosures,
  });

  // 3. Tone match check
  const toneCheck = await checkTone({
    content,
    targetTones,
    strictness: toneStrictness,
  });

  // Aggregate violations
  const violations = [
    ...bannedCheck.violations.map((v) => ({ ...v, category: "banned_claims" })),
    ...disclosuresCheck.missing.map((v) => ({ ...v, category: "missing_disclosures" })),
  ];

  if (!toneCheck.passed) {
    violations.push({
      category: "tone_mismatch",
      message: toneCheck.critique || "Tone does not match the workspace brand profile.",
      suggestions: toneCheck.suggestions,
    });
  }

  const warnings = [];
  if (Array.isArray(mediaUrls) && mediaUrls.length > 4) {
    warnings.push({
      category: "media_limit",
      message: `Attached ${mediaUrls.length} media files; social platforms allow up to 4 per post.`,
    });
  }

  const allPassed = violations.length === 0;

  // Compute composite score (0 - 100)
  let score = 100;
  score -= violations.filter((v) => v.category === "banned_claims").length * 35;
  score -= violations.filter((v) => v.category === "missing_disclosures").length * 20;
  if (!toneCheck.passed) {
    score -= Math.round((1 - (toneCheck.score ?? 0.5)) * 25);
  }
  score = Math.max(0, Math.min(100, score));

  return {
    evaluatedAt: new Date().toISOString(),
    passed: allPassed,
    approvalMandatory: true, // Human-in-the-loop: approval remains mandatory even if guardrails pass!
    score,
    channel,
    bannedClaims: bannedCheck,
    disclosures: disclosuresCheck,
    tone: toneCheck,
    violations,
    warnings,
  };
}

/**
 * Screen a trend candidate before draft generation (#24 dependency).
 */
async function auditTrend({
  topic = "",
  snippet = "",
  workspaceId = null,
  profile = null,
} = {}) {
  let effectiveProfile = profile;
  if (!effectiveProfile && workspaceId) {
    effectiveProfile = await businessProfileModel.findByWorkspaceId(workspaceId);
  }

  const sensitivityLevel =
    effectiveProfile?.guardrails?.sensitivityLevel ||
    effectiveProfile?.guardrails?.sensitivitySensitivity ||
    "standard";
  const result = await checkTrendSensitivity({ topic, snippet, sensitivityLevel });

  return {
    evaluatedAt: new Date().toISOString(),
    topic,
    snippet,
    passed: !result.isSensitive,
    isSensitive: result.isSensitive,
    category: result.category,
    confidence: result.confidence,
    reason: result.reason,
  };
}

/**
 * Audit image generation prompt and parameters before calling image provider (#09 dependency).
 */
async function auditImagePrompt({
  prompt = "",
  aspectRatio = "1:1",
  workspaceId = null,
  profile = null,
} = {}) {
  let effectiveProfile = profile;
  if (!effectiveProfile && workspaceId) {
    effectiveProfile = await businessProfileModel.findByWorkspaceId(workspaceId);
  }

  const guardrailsConfig = effectiveProfile?.guardrails || {};
  const bannedClaims = guardrailsConfig.bannedClaims || [];
  const bannedKeywords = guardrailsConfig.bannedKeywords || [];

  return checkImageGuardrails({
    prompt,
    aspectRatio,
    workspaceBannedClaims: bannedClaims,
    workspaceBannedKeywords: bannedKeywords,
  });
}

module.exports = {
  auditDraft,
  auditTrend,
  auditImagePrompt,
};
