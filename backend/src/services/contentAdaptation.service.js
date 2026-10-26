const logger = require("../config/logger");
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001";

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
    guidelines: "Warm, visual storytelling, emoji hooks, save/share call-to-action, 5-8 curated hashtags at bottom.",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    maxChars: 5000,
    maxHashtags: 4,
    guidelines: "Conversational, community-oriented, invites comments and questions.",
  },
};

function extractKeywords(text, count = 5) {
  if (!text) return ["#SteadyPost", "#Growth", "#Innovation"].slice(0, count);
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["this", "that", "with", "from", "have", "will", "your", "about"].includes(w));

  const unique = Array.from(new Set(clean));
  const tags = unique.slice(0, count).map((w) => `#${w.charAt(0).toUpperCase() + w.slice(1)}`);
  return tags.length > 0 ? tags : ["#SteadyPost", "#Growth"].slice(0, count);
}

function buildLocalChannelVariant({ channel, idea, tone = "professional", businessProfile = null, sourcePost = null }) {
  const spec = PLATFORM_SPECS[channel] || PLATFORM_SPECS.instagram;
  const rawKeywords = extractKeywords(idea, 8);
  const brandName = businessProfile?.businessType ? businessProfile.businessType : "SteadyPost";
  const audience = businessProfile?.audience ? `for ${businessProfile.audience}` : "";
  const brandContext = brandName ? ` (${brandName})` : "";

  let title = "Omnichannel Campaign";
  let body = "";
  let hashtags = [];

  const cleanIdea = idea.trim().replace(/\s+/g, " ");

  if (channel === "twitter") {
    title = `Tweet: ${cleanIdea.slice(0, 30)}...`;
    hashtags = rawKeywords.slice(0, 2);
    const tagsString = hashtags.join(" ");

    // Ensure under 280 characters
    let tweetCore = "";
    if (tone === "inspirational") {
      tweetCore = `🚀 ${cleanIdea}\n\nBig takeaway: Relentless consistency separates ideas from execution.`;
    } else if (tone === "witty" || tone === "playful") {
      tweetCore = `Hot take: ${cleanIdea}\n\nMost teams overthink it. Keep it simple and ship.`;
    } else if (tone === "authoritative" || tone === "professional") {
      tweetCore = `💡 ${cleanIdea}\n\nKey lesson: Scalable distribution beats sporadic hustle every time.`;
    } else {
      tweetCore = `${cleanIdea}\n\nWhat is your perspective on this?`;
    }

    const availableChars = spec.maxChars - (tagsString.length + 3);
    if (tweetCore.length > availableChars) {
      tweetCore = tweetCore.slice(0, availableChars - 3) + "...";
    }
    body = `${tweetCore}\n\n${tagsString}`.trim();
  } else if (channel === "linkedin") {
    title = `LinkedIn Insight: ${cleanIdea.slice(0, 35)}...`;
    hashtags = Array.from(new Set([...rawKeywords.slice(0, 3), "#Leadership", "#Strategy"])).slice(0, 4);

    const hook = tone === "inspirational"
      ? `Transforming ideas into real momentum isn't easy, but here is what we've discovered:`
      : `A critical observation on modern execution in 2026:`;

    const point1 = `1. The core challenge: Overcoming friction when executing around "${cleanIdea.slice(0, 60)}".`;
    const point2 = `2. The tactical shift: Aligning workflows ${audience} to prioritize compounding value over short-term noise.`;
    const point3 = `3. The result: Sustainable growth with clear, measurable outcomes.`;

    const question = `How is your organization approaching this challenge this quarter? Join the discussion below.`;

    body = [
      hook,
      "",
      `Insight: ${cleanIdea}`,
      "",
      point1,
      point2,
      point3,
      "",
      question,
      "",
      hashtags.join(" "),
    ].join("\n");
  } else if (channel === "instagram") {
    title = `Instagram Post: ${cleanIdea.slice(0, 35)}...`;
    hashtags = Array.from(new Set([...rawKeywords.slice(0, 5), "#ContentStrategy", "#CreatorEconomy", "#GrowthMindset"])).slice(0, 7);

    body = [
      `✨ ${cleanIdea}`,
      "",
      `When you build intentionally ${audience}, every small improvement compounds into major milestones. Here is our reminder to stay focused on high-leverage outcomes. 💫`,
      "",
      `📌 Save this post for your next strategy session!`,
      `👇 Share your thoughts in the comments!`,
      "",
      hashtags.join(" "),
    ].join("\n");
  } else if (channel === "facebook") {
    title = `Facebook Update: ${cleanIdea.slice(0, 35)}...`;
    hashtags = rawKeywords.slice(0, 3);

    body = [
      `Excited to dive into this topic today${brandContext}! 🌟`,
      "",
      cleanIdea,
      "",
      `We'd love to hear from our community: What has been your biggest win or obstacle with this lately? Drop a comment below and let's exchange notes! 👇`,
      "",
      hashtags.join(" "),
    ].join("\n");
  } else {
    title = `Post: ${cleanIdea.slice(0, 35)}...`;
    hashtags = rawKeywords.slice(0, 3);
    body = `${cleanIdea}\n\n${hashtags.join(" ")}`;
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
    provider: "local",
    model: "steadypost-adaptation-engine-v2",
  };
}

async function forwardToAiService(path, body) {
  if (process.env.NODE_ENV === "test" && !process.env.TEST_AI_SERVICE) {
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

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
    logger.warn({ err: err.message, path }, "AI service unavailable, using local adaptation engine");
  }
  return null;
}

async function adaptIdeaToChannels({
  idea,
  channels = ["twitter", "linkedin", "instagram", "facebook"],
  tone = "professional",
  businessProfile = null,
  sourcePost = null,
}) {
  const targetChannels = Array.isArray(channels) && channels.length > 0
    ? channels
    : ["twitter", "linkedin", "instagram", "facebook"];

  // 1. Try remote AI service (Groq / OpenRouter / Gemini / OpenAI)
  const aiPayload = {
    idea,
    channels: targetChannels,
    tone,
    businessProfile: businessProfile ? {
      businessType: businessProfile.businessType,
      offer: businessProfile.offer,
      audience: businessProfile.audience,
      tone: businessProfile.tone,
    } : null,
    sourcePost: sourcePost ? {
      id: sourcePost.id || sourcePost._id,
      channel: sourcePost.channel,
      body: sourcePost.content?.body || "",
      title: sourcePost.content?.title || "",
    } : null,
  };

  const aiResult = await forwardToAiService("/generate/variants", aiPayload);

  if (aiResult && Array.isArray(aiResult.variants) && aiResult.variants.length > 0) {
    return {
      idea,
      tone,
      sourcePostId: sourcePost?.id || sourcePost?._id || null,
      variants: aiResult.variants.map((v) => {
        const spec = PLATFORM_SPECS[v.channel] || PLATFORM_SPECS.instagram;
        return {
          channel: v.channel,
          content: {
            title: v.content?.title || `Adapted for ${spec.name}`,
            body: v.content?.body || "",
            mediaUrls: sourcePost?.content?.mediaUrls || v.content?.mediaUrls || [],
            hashtags: v.content?.hashtags || extractKeywords(v.content?.body || idea, spec.maxHashtags),
          },
          tone,
          charCount: (v.content?.body || "").length,
          maxChars: spec.maxChars,
          provider: aiResult.provider || v.provider || "remote-llm",
          model: aiResult.model || v.model || "multi-model-llm",
        };
      }),
    };
  }

  // 2. Fallback to local intelligent adaptation engine
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
  buildLocalChannelVariant,
  adaptIdeaToChannels,
};
