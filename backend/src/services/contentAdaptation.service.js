const { getLlmAdapter } = require("./llm/llmAdapterRegistry");

const PLATFORM_SPECS = {
  twitter: {
    id: "twitter",
    name: "Twitter / X",
    maxChars: 280,
    maxHashtags: 2,
    guidelines: "Punchy, concise under 280 characters, strong hook, minimal hashtags.",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    maxChars: 3000,
    maxHashtags: 5,
    guidelines: "Professional thought leadership, clean line breaks, actionable insights, engagement question at the end.",
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    maxChars: 2200,
    maxHashtags: 10,
    guidelines: "Warm, visual storytelling, emoji hooks, save/share call-to-action, 3-5 curated hashtags at bottom.",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    maxChars: 5000,
    maxHashtags: 4,
    guidelines: "Conversational, community-oriented, invites comments and questions.",
  },
  gbp: {
    id: "gbp",
    name: "Google Business Profile",
    maxChars: 1500,
    maxHashtags: 3,
    guidelines: "Concise local update, clear customer benefit, and actionable call-to-action.",
  },
};

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "will", "your", "about", "every",
  "some", "more", "when", "what", "their", "there", "they", "been", "were",
  "which", "would", "could", "should", "into", "than", "them", "then", "just",
  "also", "here", "make", "like", "time", "each", "very", "most", "over",
  "such", "only", "other",
]);

function clampText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || "";
  const slice = text.slice(0, maxChars - 3);
  const lastSpace = slice.lastIndexOf(" ");
  const truncated = lastSpace > 0 && slice.length - lastSpace < 25 ? slice.slice(0, lastSpace) : slice;
  return `${truncated.trimEnd()}...`;
}

function extractKeywords(text, count = 5) {
  if (!text) return [];
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const unique = Array.from(new Set(clean));
  return unique.slice(0, count).map((w) => `#${w.charAt(0).toUpperCase() + w.slice(1)}`);
}

function buildLocalChannelVariant({
  channel,
  idea,
  tone = "professional",
  _businessProfile = null,
  sourcePost = null,
}) {
  const normalizedChannel = channel === "google_business" ? "gbp" : channel;
  const spec = PLATFORM_SPECS[normalizedChannel] || PLATFORM_SPECS.instagram;
  const cleanIdea = idea.trim().replace(/\s+/g, " ");

  let title = `${spec.name} Post: ${cleanIdea.slice(0, 30)}...`;
  let body = "";
  const hashtags = extractKeywords(cleanIdea, spec.maxHashtags);

  if (normalizedChannel === "twitter") {
    title = `Tweet: ${cleanIdea.slice(0, 30)}...`;
    const prefix = tone === "professional" || tone === "authoritative" ? "💡 " : "✨ ";
    body = clampText(`${prefix}${cleanIdea}`, spec.maxChars);
  } else if (normalizedChannel === "linkedin") {
    title = `LinkedIn Insight: ${cleanIdea.slice(0, 35)}...`;
    const callout =
      tone === "casual" || tone === "playful"
        ? "What has your experience been with this? Let's connect below."
        : "What has your perspective or strategy been on this? Looking forward to hearing your insights in the comments.";
    body = clampText(`${cleanIdea}\n\n${callout}`, spec.maxChars);
  } else if (normalizedChannel === "instagram") {
    title = `Instagram Post: ${cleanIdea.slice(0, 35)}...`;
    body = clampText(
      `${cleanIdea}\n\nSave this for later and share your thoughts below! 📌`,
      spec.maxChars
    );
  } else if (normalizedChannel === "facebook") {
    title = `Facebook Update: ${cleanIdea.slice(0, 35)}...`;
    body = clampText(
      `${cleanIdea}\n\nWhat are your thoughts on this? Join the conversation below! 👇`,
      spec.maxChars
    );
  } else if (normalizedChannel === "gbp") {
    title = `GBP Local Update: ${cleanIdea.slice(0, 35)}...`;
    body = clampText(
      `${cleanIdea}\n\nLearn more or visit us today!`,
      spec.maxChars
    );
  } else {
    body = clampText(cleanIdea, spec.maxChars);
  }

  return {
    channel,
    content: {
      title,
      body,
      mediaUrls: sourcePost?.content?.mediaUrls || [],
      hashtags,
    },
    tone,
    charCount: body.length,
    maxChars: spec.maxChars,
    provider: "template",
    model: "template-fallback",
  };
}

async function forwardToAiService(path, body) {
  const adapter = getLlmAdapter();
  if (typeof adapter._postJson === "function") {
    const timeoutMs = parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 12000;
    return adapter._postJson(path, body, {
      timeoutMs,
      logLevel: "warn",
      reason: "AI service unavailable, using local template adaptation",
    });
  }
  if (path === "/generate/variants" && typeof adapter.generateVariants === "function") {
    return adapter.generateVariants(body);
  }
  return null;
}

async function adaptIdeaToChannels({
  idea,
  channels = ["instagram", "facebook"],
  tone = "professional",
  businessProfile = null,
  sourcePost = null,
  llmProvider = undefined,
}) {
  const allowed = ["twitter", "linkedin", "instagram", "facebook", "gbp", "google_business"];
  let targetChannels = ["instagram", "facebook"];
  if (Array.isArray(channels)) {
    if (channels.length === 0) {
      const err = new Error("At least one target channel is required");
      err.status = 400;
      throw err;
    }
    const filtered = [...new Set(channels.map((c) => String(c).toLowerCase().trim()))].filter((c) =>
      allowed.includes(c)
    );
    if (filtered.length === 0) {
      const err = new Error("None of the requested channels are supported");
      err.status = 400;
      throw err;
    }
    targetChannels = filtered;
  }

  // 1. Try registered LLM adapter (defaults to Python AI service / Groq / OpenRouter / Gemini / OpenAI)
  const aiPayload = {
    idea,
    channels: targetChannels,
    tone,
    businessProfile: businessProfile
      ? {
          businessType: businessProfile.businessType,
          offer: businessProfile.offer,
          audience: businessProfile.audience,
          tone: businessProfile.tone,
        }
      : null,
    sourcePost: sourcePost
      ? {
          id: sourcePost.id || sourcePost._id,
          channel: sourcePost.channel,
          body: sourcePost.content?.body || "",
          title: sourcePost.content?.title || "",
        }
      : null,
  };

  const aiResult = await getLlmAdapter(llmProvider).generateVariants(aiPayload);

  if (aiResult && Array.isArray(aiResult.variants) && aiResult.variants.length > 0) {
    const aiVariantsByChannel = new Map();
    for (const v of aiResult.variants) {
      const normalized = String(v?.channel || "").toLowerCase().trim();
      const canonical = normalized === "google_business" ? "gbp" : normalized;
      if (canonical && !aiVariantsByChannel.has(canonical)) {
        aiVariantsByChannel.set(canonical, v);
      }
    }

    const mergedVariants = targetChannels.map((channel) => {
      const specKey = channel === "google_business" ? "gbp" : channel;
      const spec = PLATFORM_SPECS[specKey] || PLATFORM_SPECS.instagram;
      const aiVariant = aiVariantsByChannel.get(specKey);

      if (aiVariant) {
        const rawBody = aiVariant.content?.body ?? aiVariant.body ?? "";
        const rawTitle = aiVariant.content?.title ?? aiVariant.title;
        const rawMediaUrls = aiVariant.content?.mediaUrls ?? aiVariant.mediaUrls;
        const rawHashtags = aiVariant.content?.hashtags ?? aiVariant.hashtags;
        const clampedBody = clampText(rawBody, spec.maxChars);

        return {
          channel,
          content: {
            title: rawTitle || `${spec.name} Post: ${idea.slice(0, 30)}...`,
            body: clampedBody,
            mediaUrls: sourcePost?.content?.mediaUrls || rawMediaUrls || [],
            hashtags: rawHashtags || extractKeywords(clampedBody, spec.maxHashtags),
          },
          tone,
          charCount: clampedBody.length,
          maxChars: spec.maxChars,
          provider: aiVariant.provider || aiResult.provider || "template",
          model: aiVariant.model || aiResult.model || "template-fallback",
        };
      }

      return buildLocalChannelVariant({
        channel,
        idea,
        tone,
        businessProfile,
        sourcePost,
      });
    });

    return {
      idea,
      tone,
      sourcePostId: sourcePost?.id || sourcePost?._id || null,
      variants: mergedVariants,
    };
  }

  // 2. Fallback to local template adaptation
  const variants = targetChannels.map((channel) =>
    buildLocalChannelVariant({
      channel,
      idea,
      tone,
      businessProfile,
      sourcePost,
    })
  );

  return {
    idea,
    tone,
    sourcePostId: sourcePost?.id || sourcePost?._id || null,
    variants,
  };
}

module.exports = {
  PLATFORM_SPECS,
  extractKeywords,
  clampText,
  buildLocalChannelVariant,
  adaptIdeaToChannels,
  forwardToAiService,
};
