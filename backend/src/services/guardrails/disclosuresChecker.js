const { escapeRegex } = require("../../utils/regex");

const SPONSORED_TRIGGERS = [
  { pattern: /\b(?:sponsored\s+by|in\s+partnership\s+with|paid\s+partnership|brand\s+ambassador)\b/i, label: "sponsored partnership" },
  { pattern: /\b(?:affiliate\s+link|amzn\.to|commission\s+earned|aff\s+link)\b/i, label: "affiliate link" },
  { pattern: /\b(?:use\s+code\s+[A-Za-z0-9_-]+|promo\s+code|coupon\s+code|discount\s+code)\b/i, label: "promotional discount code" },
];

const STANDARD_DISCLOSURES = [
  /(?<![\w#])#ad(?![\w])/i,
  /(?<![\w#])#sponsored(?![\w])/i,
  /(?<![\w#])#partner(?![\w])/i,
  /(?<![\w#])#paidpartnership(?![\w])/i,
  /\[ad\]/i,
  /\(ad\)/i,
  /\bpaid\s+promotion\b/i,
];

function checkDisclosures({
  text = "",
  workspaceRequiredDisclosures = [],
} = {}) {
  const content = text || "";
  const detectedTriggers = [];
  const missing = [];
  const present = [];

  // 1. Detect if content contains commercial/affiliate/sponsored hooks
  for (const trigger of SPONSORED_TRIGGERS) {
    if (trigger.pattern.test(content)) {
      detectedTriggers.push(trigger.label);
    }
  }

  // 2. Check for standard disclosures if triggers are present
  const hasStandardDisclosure = STANDARD_DISCLOSURES.some((d) => d.test(content));

  if (detectedTriggers.length > 0 && !hasStandardDisclosure) {
    missing.push({
      disclosure: "#ad or #sponsored",
      reason: `Commercial or sponsored content detected (${detectedTriggers.join(", ")}), but no clear disclosure was found.`,
      suggestedFix: "Include #ad or #sponsored visibly in your caption.",
    });
  }

  // 3. Check workspace-specific required disclosures
  if (Array.isArray(workspaceRequiredDisclosures)) {
    for (const reqDisc of workspaceRequiredDisclosures) {
      const trimmed = (reqDisc || "").trim();
      if (!trimmed) continue;

      const pattern = trimmed.startsWith("#")
        ? `(?<![\\w#])${escapeRegex(trimmed)}(?![\\w])`
        : `(?<![\\w])${escapeRegex(trimmed)}(?![\\w])`;
      const isPresent = new RegExp(pattern, "i").test(content);

      if (isPresent) {
        present.push(trimmed);
      } else {
        missing.push({
          disclosure: trimmed,
          reason: `Workspace requires mandatory disclosure: "${trimmed}".`,
          suggestedFix: `Add "${trimmed}" to the post body.`,
        });
      }
    }
  }

  return {
    passed: missing.length === 0,
    detectedTriggers,
    missing,
    present,
  };
}

module.exports = {
  SPONSORED_TRIGGERS,
  STANDARD_DISCLOSURES,
  checkDisclosures,
};
