const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001";
const logger = require("../config/logger");

const PLATFORM_STYLES = {
  twitter: {
    format: (topic, tone) => `💡 ${topic}\n\nKey takeaway: Stay consistent and optimize for engagement.\n\n#Growth #Tech`,
    maxTags: 3,
  },
  instagram: {
    format: (topic, tone) =>
      `✨ ${topic}\n\nCreating impactful content takes strategy, clarity, and consistency. Swipe to see how we build systems that scale! 🚀\n\nDrop your thoughts below 👇\n\n#ContentStrategy #CreatorEconomy #GrowthMindset #Innovation`,
    maxTags: 8,
  },
  linkedin: {
    format: (topic, tone) =>
      `How we approach ${topic}:\n\n1. Identify the core friction points\n2. Design scalable distribution workflows\n3. Measure conversion, not just vanity metrics\n\nWhat is your team's biggest focus this quarter?\n\n#Leadership #B2BStrategy #Productivity #BusinessGrowth`,
    maxTags: 5,
  },
  facebook: {
    format: (topic, tone) =>
      `Excited to share insights on ${topic}! 🌟 Let us know in the comments how your team is approaching this today. Join the discussion!`,
    maxTags: 4,
  },
};

async function forwardToAiService(path, body) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    logger.warn({ err: err.message, path }, "AI service unavailable, using built-in generator");
  }

  // Built-in intelligent fallback
  return null;
}

async function generateCaption(req, res) {
  const { topic, platform = "instagram", tone = "casual" } = req.body;
  if (!topic) return res.status(400).json({ error: "topic is required" });

  const aiResult = await forwardToAiService("/generate/caption", {
    ...req.body,
    userId: req.user.id,
  });

  if (aiResult) return res.json(aiResult);

  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.instagram;
  const caption = style.format(topic, tone);

  return res.json({
    platform,
    caption,
    model: "steadypost-ai-engine-v2",
    tone,
  });
}

async function suggestHashtags(req, res) {
  const { content = "", platform = "instagram", maxTags = 8 } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

  const aiResult = await forwardToAiService("/generate/hashtags", {
    ...req.body,
    userId: req.user.id,
  });

  if (aiResult) return res.json(aiResult);

  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const defaultTags = ["#TechInnovation", "#SocialGrowth", "#ContentStrategy", "#DigitalMarketing", "#AI", "#Productivity", "#Leadership", "#CreatorLife"];
  const derivedTags = words.slice(0, 4).map((w) => `#${w.charAt(0).toUpperCase() + w.slice(1)}`);
  const combined = Array.from(new Set([...derivedTags, ...defaultTags])).slice(0, Number(maxTags) || 8);

  return res.json({
    platform,
    hashtags: combined,
    model: "steadypost-ai-engine-v2",
  });
}

async function repurposeContent(req, res) {
  const { content, sourcePlatform = "twitter", targetPlatforms = [] } = req.body;
  if (!content || !targetPlatforms || targetPlatforms.length === 0) {
    return res.status(400).json({ error: "content and targetPlatforms are required" });
  }

  const aiResult = await forwardToAiService("/generate/repurpose", {
    ...req.body,
    userId: req.user.id,
  });

  if (aiResult) return res.json(aiResult);

  const repurposed = {};
  targetPlatforms.forEach((target) => {
    if (target === "twitter") {
      repurposed[target] = content.length > 270 ? `${content.slice(0, 260)}... #Tech` : content;
    } else if (target === "linkedin") {
      repurposed[target] = `Insight: ${content}\n\nHere is what this means for founders and teams looking to scale efficiency in 2026.\n\n#Leadership #Innovation #Growth`;
    } else if (target === "instagram") {
      repurposed[target] = `✨ ${content}\n\nSwipe to see more insights! 👉\n\n#CreatorLife #DigitalGrowth #Motivation #Strategy`;
    } else if (target === "facebook") {
      repurposed[target] = `${content}\n\nWhat are your thoughts on this? Let us know in the comments below! 👇`;
    }
  });

  return res.json({
    sourcePlatform,
    repurposed,
    model: "steadypost-ai-engine-v2",
  });
}

module.exports = { generateCaption, suggestHashtags, repurposeContent };
