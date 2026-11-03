// Baseline prohibited patterns across all workspaces (medical, deceptive financial, unverified absolutes)
const BASELINE_BANNED_CLAIMS = [
  {
    pattern: /\b(?:miracle\s+cure|cure(?:s)?\s+(?:cancer|diabetes|alzheimer|covid)|reverses?\s+aging)\b/i,
    reason: "Unsubstantiated medical cure claim violates advertising guidelines.",
  },
  {
    pattern: /\b(?:guaranteed\s+(?:100%|daily|monthly)?\s*(?:return|profit|roi)|get\s+rich\s+quick|risk[\s-]free\s+investment|double\s+your\s+money)\b/i,
    reason: "Deceptive or unsubstantiated financial guarantee violates regulatory standards.",
  },
  {
    pattern: /\b(?:100%\s+risk[\s-]free\s+guarantee|instant\s+riches|guaranteed\s+cure)\b/i,
    reason: "Absolute risk-free guarantee without qualification violates marketing standards.",
  },
];

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkBannedClaims({
  text = "",
  workspaceBannedClaims = [],
  workspaceBannedKeywords = [],
} = {}) {
  const content = text || "";
  const violations = [];

  // 1. Check baseline prohibited claims
  for (const baseline of BASELINE_BANNED_CLAIMS) {
    const match = content.match(baseline.pattern);
    if (match) {
      violations.push({
        phrase: match[0],
        reason: baseline.reason,
        type: "baseline_policy",
      });
    }
  }

  // 2. Check workspace-configured banned claims (phrases)
  if (Array.isArray(workspaceBannedClaims)) {
    for (const claim of workspaceBannedClaims) {
      const trimmed = (claim || "").trim();
      if (!trimmed) continue;
      const regex = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, "i");
      const match = content.match(regex);
      if (match) {
        violations.push({
          phrase: trimmed,
          matchedText: match[0],
          reason: `Violates workspace-defined banned claim: "${trimmed}".`,
          type: "banned_claim",
        });
      }
    }
  }

  // 3. Check workspace-configured banned keywords
  if (Array.isArray(workspaceBannedKeywords)) {
    for (const kw of workspaceBannedKeywords) {
      const trimmed = (kw || "").trim();
      if (!trimmed) continue;
      const regex = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, "i");
      const match = content.match(regex);
      if (match) {
        violations.push({
          phrase: trimmed,
          matchedText: match[0],
          reason: `Contains restricted workspace keyword: "${trimmed}".`,
          type: "banned_keyword",
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

module.exports = {
  BASELINE_BANNED_CLAIMS,
  checkBannedClaims,
};
