const logger = require("../../config/logger");
const { getLlmAdapter } = require("../llm/llmAdapterRegistry");

// Idioms that must NOT trigger sensitivity flags
const BENIGN_IDIOMS = [
  /\bkilling\s+it\b/i,
  /\bkiller\s+(?:deal|app|product|feature|recipe|workout|outfit|content)\b/i,
  /\bcrash\s+course\b/i,
  /\bto\s+die\s+for\b/i,
  /\bdrop\s+dead\b/i,
  /\bdead\s+(?:simple|serious|on|ahead|center)\b/i,
  /\bviral\s+(?:meme|video|trend|growth|hit)\b/i,
  /\bbomb\s+(?:review|performance)\b/i,
  /\bbombarded\s+with\b/i,
  /\bslaying\s+(?:it|the\s+game)\b/i,
  /\bfired\s+up\b/i,
];

// Sensitive category patterns for fast-path screening
const SENSITIVE_PATTERNS = [
  {
    category: "tragedy_natural_disaster",
    pattern: /\b(?:earthquake|tsunami|hurricane|tornado|wildfire|cyclone|landslide|devastating\s+flood)\b.*?\b(?:devastat(?:ed|ing)|death\s*toll|casualties|fatalities|displaced|destroyed|victims?|survivors?|catastroph(?:e|ic))\b/i,
    patternShort: /\b(?:deadly\s+(?:earthquake|tornado|flood|storm)|fatal\s+hurricane|massive\s+tsunami|devastating\s+wildfire|catastrophic\s+flood)\b/i,
    reason: "Natural disaster with casualties or humanitarian emergency.",
  },
  {
    category: "mass_casualty_violence",
    pattern: /\b(?:mass\s+shooting|terrorist\s+attack|bombing|airstrike|hostage\s+crisis|fatal\s+stabbing|suicide\s+bombing)\b/i,
    reason: "Violent incident or mass casualty event.",
  },
  {
    category: "fatal_accident",
    pattern: /\b(?:plane\s+crash|flight\s+crash|train\s+derailment|fatal\s+pileup|deadly\s+explosion|building\s+collapse)\b.*?\b(?:kills?|killed|deaths?|dead|fatalities|casualties)\b/i,
    patternShort: /\b(?:fatal\s+(?:plane\s+crash|explosion|crash)|deadly\s+(?:train\s+derailment|collapse|explosion))\b/i,
    reason: "Fatal transportation or industrial catastrophe.",
  },
  {
    category: "bereavement_death",
    pattern: /\b(?:tragic\s+death|mourns?\s+the\s+loss|passes?\s+away\s+at|(?:dies?|died)\s+at\s+\d+|found\s+dead\s+in|suicide\s+death|obituary\s+for|funeral\s+services?)\b/i,
    patternShort: /\b(?:mourns?\s+(?:death|loss)|passed\s+away\s+after\s+battle|tragically\s+died)\b/i,
    reason: "Grief, obituary, or death of a public figure.",
  },
  {
    category: "war_armed_conflict",
    pattern: /\b(?:war\s+crimes?|civilian\s+casualties|military\s+invasion|shelling\s+of\s+civilians|missile\s+strike\s+kills)\b/i,
    reason: "Active war, civilian casualties, or military hostilities.",
  },
  {
    category: "scandal_abuse",
    pattern: /\b(?:child\s+(?:abuse|exploitation)|sexual\s+assault\s+allegations|human\s+trafficking\s+bust)\b/i,
    reason: "Severe criminal controversy or abuse allegations.",
  },
  {
    category: "civil_unrest",
    pattern: /\b(?:violent\s+riots?|martial\s+law\s+declared)\b/i,
    reason: "Violent civil unrest or state of emergency.",
  },
];

function sanitizeIdioms(text) {
  let cleaned = text;
  for (const idiom of BENIGN_IDIOMS) {
    cleaned = cleaned.replace(idiom, " benign_phrase ");
  }
  return cleaned;
}

function evaluateLocally(text, sensitivityLevel = "standard") {
  const sanitized = sanitizeIdioms(text);

  for (const item of SENSITIVE_PATTERNS) {
    if (item.pattern.test(sanitized) || (item.patternShort && item.patternShort.test(sanitized))) {
      return {
        isSensitive: true,
        category: item.category,
        confidence: 0.95,
        reason: item.reason,
      };
    }
  }

  // Broad checks for higher sensitivity settings or direct mentions of mass death
  if (sensitivityLevel === "conservative") {
    const generalCasualties = /\b(?:fatalities|casualties|death\s+toll\s+rises|tragedy\s+strikes)\b/i;
    if (generalCasualties.test(sanitized)) {
      return {
        isSensitive: true,
        category: "general_tragedy",
        confidence: 0.85,
        reason: "Content mentions casualties, fatalities, or tragedy.",
      };
    }
  }

  // Check direct casualty pairing (e.g. "14 confirmed fatalities", "45 passengers dead", "killing hundreds", "kills 150", "killed all 5")
  const casualtyMatch = sanitized.match(
    /\b(?:(?:\d+|dozens?|scores?|hundreds?|thousands?)\s+(?:(?:\w+\s+)?(?:killed|dead|fatalities|casualties)|slain)|(?:kills?|killing|killed)(?:\s+(?:all|over|at\s+least|more\s+than|nearly|up\s+to))?\s+(?:\d+|dozens?|scores?|hundreds?|thousands?))\b/i
  );
  if (casualtyMatch) {
    return {
      isSensitive: true,
      category: "casualty_event",
      confidence: 0.90,
      reason: `Mentions casualties: "${casualtyMatch[0]}".`,
    };
  }

  return {
    isSensitive: false,
    category: null,
    confidence: 0.1,
    reason: null,
  };
}

async function checkTrendSensitivity({
  topic = "",
  snippet = "",
  sensitivityLevel = "standard",
} = {}) {
  const fullText = [topic, snippet].filter(Boolean).join(" — ").trim();
  if (!fullText) {
    return {
      isSensitive: false,
      category: null,
      confidence: 0,
      reason: "Empty content provided",
    };
  }

  // First run local high-speed classifier
  const localResult = evaluateLocally(fullText, sensitivityLevel);
  if (localResult.isSensitive) {
    return localResult;
  }

  try {
    const data = await getLlmAdapter().checkSensitivity({ topic, snippet, sensitivityLevel });
    if (data) {
      if (data.source === "fallback") {
        return localResult;
      }
      return {
        isSensitive: Boolean(data.isSensitive),
        category: data.category || null,
        confidence: typeof data.confidence === "number" ? data.confidence : 0.85,
        reason: data.reason || null,
      };
    }
  } catch (err) {
    // Graceful fallback to local result
    logger.debug({ err: err.message }, "AI service sensitivity check unavailable, using local evaluator");
  }

  return localResult;
}

module.exports = {
  checkTrendSensitivity,
  evaluateLocally,
  BENIGN_IDIOMS,
  SENSITIVE_PATTERNS,
};
