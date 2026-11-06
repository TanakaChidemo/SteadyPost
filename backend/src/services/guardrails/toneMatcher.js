const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001";
const logger = require("../../config/logger");

const TONE_KEYWORDS = {
  professional: ["strategy", "efficiency", "analysis", "workflow", "optimize", "deliver", "performance", "quarter", "results"],
  authoritative: ["proven", "standard", "leadership", "framework", "research", "industry", "data-driven", "benchmark"],
  casual: ["hey", "love", "awesome", "cool", "chat", "simple", "fun", "check out", "drop your thoughts"],
  playful: ["excited", "magic", "party", "yay", "super", "secret sauce", "vibe", "spark"],
  inspiring: ["dream", "transform", "empower", "unlock", "elevate", "journey", "potential", "courage", "vision"],
  "tech-forward": ["ai", "automated", "cloud", "algorithms", "architecture", "scale", "infrastructure", "stack", "deploy"],
  bold: ["dominate", "game-changing", "unapologetic", "revolutionary", "breakthrough", "bold", "lead the pack"],
};

const AGGRESSIVE_OR_HOSTILE = [
  /\b(?:shut\s+up|idiots?|morons?|losers?|hate\s+you|pathetic|worthless|screw\s+you)\b/i,
];

function evaluateToneLocally(content = "", targetTones = ["professional"]) {
  const text = (content || "").toLowerCase();
  const suggestions = [];

  // 1. Check for aggressive/toxic tone regardless of brand tone
  for (const hostile of AGGRESSIVE_OR_HOSTILE) {
    if (hostile.test(text)) {
      return {
        passed: false,
        score: 0.1,
        detectedTone: "hostile / aggressive",
        targetTone: targetTones,
        critique: "Draft contains aggressive, disrespectful, or hostile phrasing.",
        suggestions: ["Remove harsh or combative words to maintain professional brand credibility."],
      };
    }
  }

  // 2. Count tone indicators
  const toneScores = {};
  for (const [toneName, keywords] of Object.entries(TONE_KEYWORDS)) {
    let matches = 0;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      if (regex.test(text)) matches++;
    }
    toneScores[toneName] = matches;
  }

  const targetMatches = targetTones.reduce((acc, t) => acc + (toneScores[t] || 0), 0);

  // Analyze stylistic flags
  const exclamationCount = (content.match(/!{2,}/g) || []).length;
  const allCapsWords = (content.match(/\b[A-Z]{4,}\b/g) || []).length;
  const emojiCount = (content.match(/\p{Extended_Pictographic}/gu) || []).length;

  let baseScore = 0.85;
  let critique = null;

  if (targetTones.includes("authoritative") || targetTones.includes("professional")) {
    if (exclamationCount > 1 || allCapsWords > 2) {
      baseScore -= 0.2;
      critique = "Excessive exclamation marks or all-caps words detract from an authoritative/professional tone.";
      suggestions.push("Moderate punctuation to keep an authoritative stance.");
    }
    if (emojiCount > 6) {
      baseScore -= 0.15;
      suggestions.push("Reduce emoji frequency for a more polished professional presentation.");
    }
  }

  if (targetTones.includes("casual") || targetTones.includes("playful")) {
    if (targetMatches === 0 && content.length > 200 && (toneScores.professional > 3)) {
      baseScore -= 0.2;
      suggestions.push("Incorporate friendlier conversational phrases or questions to warm up the tone.");
    }
  }

  const detectedTonesList = Object.entries(toneScores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const detectedTone = detectedTonesList.length > 0 ? detectedTonesList.slice(0, 2).join(", ") : "neutral";
  const finalScore = Math.max(0.2, Math.min(1.0, baseScore + (targetMatches > 0 ? 0.1 : 0.0)));

  return {
    passed: finalScore >= 0.70,
    score: Math.round(finalScore * 100) / 100,
    detectedTone,
    targetTone: targetTones,
    critique: finalScore >= 0.70 ? null : (critique || "Draft diverges from the configured brand tone."),
    suggestions,
  };
}

async function checkTone({
  content = "",
  targetTones = ["professional"],
  strictness = "moderate",
} = {}) {
  const localResult = evaluateToneLocally(content, targetTones);

  // Never allow hostile/aggressive local verdict to be overridden
  if (!localResult.passed && localResult.detectedTone === "hostile / aggressive") {
    return localResult;
  }

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`${AI_SERVICE_URL}/guardrails/tone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, targetTones, strictness }),
      signal: controller.signal,
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.source !== "fallback") {
        return {
          passed: Boolean(data.passed),
          score: typeof data.score === "number" ? data.score : localResult.score,
          detectedTone: data.detectedTone || localResult.detectedTone,
          targetTone: targetTones,
          critique: data.critique || null,
          suggestions: data.suggestions || localResult.suggestions,
        };
      }
    }
  } catch (err) {
    logger.debug({ err: err.message }, "AI service tone check unavailable, using local tone evaluator");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  return localResult;
}

module.exports = {
  checkTone,
  evaluateToneLocally,
  TONE_KEYWORDS,
};
