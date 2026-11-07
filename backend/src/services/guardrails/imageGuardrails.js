const { checkBannedClaims } = require("./bannedClaimsChecker");

const RESTRICTED_IMAGE_PROMPT_PATTERNS = [
  { pattern: /\b(?:nude|naked|nsfw|pornographic|explicit\s+nudity)\b/i, reason: "Explicit or adult visual content is prohibited." },
  { pattern: /\b(?:gore|bloody\s+violence|mutilation|decapitat(?:ed|ion)|gory)\b/i, reason: "Graphic violence and gore are prohibited in social visuals." },
  { pattern: /\b(?:hate\s+symbol|swastika|white\s+supremacy|terrorist\s+flag)\b/i, reason: "Hateful symbols and extremist imagery are prohibited." },
  { pattern: /\b(?:counterfeit|fake\s+id|forged\s+passport)\b/i, reason: "Deceptive or fraudulent visual themes are prohibited." },
];

const ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "16:9", "9:16", "3:2", "2:3"];

function checkImageGuardrails({
  prompt = "",
  aspectRatio = "1:1",
  workspaceBannedClaims = [],
  workspaceBannedKeywords = [],
} = {}) {
  const violations = [];
  const warnings = [];
  const textPrompt = prompt || "";

  // 1. General safety pattern check
  for (const item of RESTRICTED_IMAGE_PROMPT_PATTERNS) {
    if (item.pattern.test(textPrompt)) {
      violations.push({
        type: "restricted_image_content",
        message: item.reason,
      });
    }
  }

  // 2. Check workspace banned claims & keywords in image prompt
  const bannedCheck = checkBannedClaims({
    text: textPrompt,
    workspaceBannedClaims,
    workspaceBannedKeywords,
  });

  if (!bannedCheck.passed) {
    for (const v of bannedCheck.violations) {
      violations.push({
        type: "workspace_brand_violation",
        message: `Image prompt contains restricted term or claim: "${v.phrase}".`,
      });
    }
  }

  // 3. Aspect ratio validation
  let normalizedAspectRatio = (aspectRatio || "1:1").trim();
  if (!ALLOWED_ASPECT_RATIOS.includes(normalizedAspectRatio)) {
    warnings.push({
      type: "unusual_aspect_ratio",
      message: `Aspect ratio "${aspectRatio}" is non-standard for social publishing. Recommended: 1:1 (square), 4:5 (Instagram), or 16:9 (landscape).`,
    });
    normalizedAspectRatio = "1:1";
  }

  // Add default brand safety negative prompt tags
  const negativePrompt = "blurry, distorted, low quality, nsfw, watermark, text artifacts, bad anatomy";

  return {
    passed: violations.length === 0,
    prompt: textPrompt,
    safePrompt: textPrompt.trim(),
    aspectRatio: normalizedAspectRatio,
    negativePrompt,
    violations,
    warnings,
  };
}

module.exports = {
  checkImageGuardrails,
  RESTRICTED_IMAGE_PROMPT_PATTERNS,
  ALLOWED_ASPECT_RATIOS,
};
