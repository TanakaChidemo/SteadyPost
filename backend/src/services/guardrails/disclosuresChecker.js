function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SPONSORED_TRIGGERS = [
  { pattern: /\b(?:sponsored\s+by|in\s+partnership\s+with|paid\s+partnership|brand\s+ambassador)\b/i, label: "sponsored partnership" },
  { pattern: /\b(?:affiliate\s+link|amzn\.to|commission\s+earned|aff\s+link)\b/i, label: "affiliate link" },
  { pattern: /\b(?:use\s+code\s+[A-Za-z0-9_-]+|promo\s+code|coupon\s+code|discount\s+code)\b/i, label: "promotional discount code" },
];

const STANDARD_DISCLOSURES = [
  /#ad\b/i,
  /#sponsored\b/i,
  /#partner\b/i,
  /#paidpartnership\b/i,
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

      const isPresent = trimmed.startsWith("#")
        ? new RegExp("(?:^|\\s)" + escapeRegex(trimmed) + '(?:$|[\\s.,!?;)"\'])', "i").test(content)
        : content.toLowerCase().includes(trimmed.toLowerCase());

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
