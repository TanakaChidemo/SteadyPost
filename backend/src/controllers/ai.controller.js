const businessProfileModel = require("../models/businessProfile.model");
const guardrailsService = require("../services/guardrails/guardrailsService");
const contentAdaptationService = require("../services/contentAdaptation.service");
const { getLlmAdapter, llmAdapterRegistry } = require("../services/llm/llmAdapterRegistry");

function checkProvider(provider, res) {
  if (provider && !llmAdapterRegistry.has(provider)) {
    res.status(400).json({
      error: `Unsupported LLM provider: '${provider}'. Supported: ${llmAdapterRegistry.listProviders().join(", ")}`,
    });
    return false;
  }
  return true;
}

const PLATFORM_STYLES = {
  twitter: {
    format: (topic, _tone) => `💡 ${topic}\n\nKey takeaway: Stay consistent and optimize for engagement.\n\n#Growth #Tech`,
    maxTags: 3,
  },
  instagram: {
    format: (topic, _tone) =>
      `✨ ${topic}\n\nCreating impactful content takes strategy, clarity, and consistency. Swipe to see how we build systems that scale! 🚀\n\nDrop your thoughts below 👇\n\n#ContentStrategy #CreatorEconomy #GrowthMindset #Innovation`,
    maxTags: 8,
  },
  linkedin: {
    format: (topic, _tone) =>
      `How we approach ${topic}:\n\n1. Identify the core friction points\n2. Design scalable distribution workflows\n3. Measure conversion, not just vanity metrics\n\nWhat is your team's biggest focus this quarter?\n\n#Leadership #B2BStrategy #Productivity #BusinessGrowth`,
    maxTags: 5,
  },
  facebook: {
    format: (topic, _tone) =>
      `Excited to share insights on ${topic}! 🌟 Let us know in the comments how your team is approaching this today. Join the discussion!`,
    maxTags: 4,
  },
  gbp: {
    format: (topic, _tone) =>
      `📍 ${topic}\n\nVisit or message us today to learn more and book directly with our team.`,
    maxTags: 3,
  },
};

async function generateCaption(req, res) {
  const { topic, platform = "instagram", tone, provider } = req.body;
  if (!topic) return res.status(400).json({ error: "topic is required" });
  if (!checkProvider(provider, res)) return;

  let effectiveTone = tone;
  let profile = null;
  let profileContext = null;

  if (req.workspaceId) {
    profile = await businessProfileModel.findByWorkspaceId(req.workspaceId);
    if (profile) {
      if (!effectiveTone && profile.tone?.length) {
        effectiveTone = profile.tone[0];
      }
      profileContext = {
        businessType: profile.businessType,
        offer: profile.offer,
        audience: profile.audience,
        tone: profile.tone,
      };
    }
  }

  if (!effectiveTone) effectiveTone = "casual";

  const llmAdapter = getLlmAdapter(provider);
  const aiResult = await llmAdapter.generateCaption({
    ...req.body,
    tone: effectiveTone,
    businessProfile: profileContext,
    workspaceId: req.workspaceId,
    userId: req.user.id,
  });

  const style = PLATFORM_STYLES[platform] || PLATFORM_STYLES.instagram;
  const localCaption = style.format(topic, effectiveTone);
  const captionText = aiResult ? aiResult.caption : localCaption;

  if (aiResult) {
    let auditedCandidates = aiResult.candidates;
    if (Array.isArray(aiResult.candidates) && aiResult.candidates.length > 0) {
      auditedCandidates = await Promise.all(
        aiResult.candidates.map(async (cand) => {
          if (cand && cand.status === "success" && cand.caption) {
            const candGuardrails = await guardrailsService.auditDraft({
              content: cand.caption,
              channel: platform,
              workspaceId: req.workspaceId,
              profile,
            });
            return { ...cand, guardrails: candGuardrails };
          }
          return { ...cand, guardrails: null };
        })
      );
    }

    const primaryCandidateAudit = Array.isArray(auditedCandidates)
      ? auditedCandidates.find((c) => c.status === "success" && c.caption === captionText)?.guardrails ||
        auditedCandidates.find((c) => c.status === "success" && c.guardrails)?.guardrails
      : null;

    const guardrails =
      primaryCandidateAudit ||
      (await guardrailsService.auditDraft({
        content: captionText || "",
        channel: platform,
        workspaceId: req.workspaceId,
        profile,
      }));

    return res.json({
      ...aiResult,
      guardrails,
      ...(Array.isArray(auditedCandidates) ? { candidates: auditedCandidates } : {}),
    });
  }

  const guardrails = await guardrailsService.auditDraft({
    content: localCaption || "",
    channel: platform,
    workspaceId: req.workspaceId,
    profile,
  });

  return res.json({
    platform,
    caption: localCaption,
    model: "steadypost-ai-engine-v2",
    tone: effectiveTone,
    guardrails,
    candidates: [
      {
        provider: "local",
        label: "SteadyPost Fallback Engine",
        model: "steadypost-ai-engine-v2",
        caption: localCaption,
        status: "success",
        error: null,
        guardrails,
      },
    ],
  });
}

async function suggestHashtags(req, res) {
  const { content = "", platform = "instagram", maxTags = 8, provider } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });
  if (!checkProvider(provider, res)) return;

  const aiResult = await getLlmAdapter(provider).suggestHashtags({
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
  const { content, sourcePlatform = "twitter", targetPlatforms = [], provider } = req.body;
  if (!content || !targetPlatforms || targetPlatforms.length === 0) {
    return res.status(400).json({ error: "content and targetPlatforms are required" });
  }
  if (!checkProvider(provider, res)) return;

  const aiResult = await getLlmAdapter(provider).repurposeContent({
    ...req.body,
    userId: req.user.id,
  });

  let activeRepurposed = aiResult?.repurposed;
  if (!activeRepurposed) {
    activeRepurposed = {};
    targetPlatforms.forEach((target) => {
      if (target === "twitter") {
        activeRepurposed[target] = content.length > 270 ? `${content.slice(0, 260)}... #Tech` : content;
      } else if (target === "linkedin") {
        activeRepurposed[target] = `Insight: ${content}\n\nHere is what this means for founders and teams looking to scale efficiency in 2026.\n\n#Leadership #Innovation #Growth`;
      } else if (target === "instagram") {
        activeRepurposed[target] = `✨ ${content}\n\nSwipe to see more insights! 👉\n\n#CreatorLife #DigitalGrowth #Motivation #Strategy`;
      } else if (target === "facebook") {
        activeRepurposed[target] = `${content}\n\nWhat are your thoughts on this? Let us know in the comments below! 👇`;
      } else if (target === "gbp" || target === "google_business") {
        activeRepurposed[target] = `📍 ${content}\n\nContact or visit us today to learn more!`;
      } else {
        activeRepurposed[target] = content;
      }
    });
  }

  const profile = req.workspaceId
    ? await businessProfileModel.findByWorkspaceId(req.workspaceId)
    : null;

  const entries = await Promise.all(
    Object.entries(activeRepurposed).map(async ([target, text]) => {
      const audit = await guardrailsService.auditDraft({
        content: text || "",
        channel: target,
        workspaceId: req.workspaceId,
        profile,
      });
      return [target, audit];
    })
  );
  const guardrails = Object.fromEntries(entries);

  return res.json({
    sourcePlatform,
    repurposed: activeRepurposed,
    guardrails,
    model: aiResult?.model || "steadypost-ai-engine-v2",
  });
}

async function generateVariants(req, res) {
  const { idea, topic, channels = ["twitter", "linkedin", "instagram", "facebook"], tone, provider } = req.body;
  const contentIdea = idea || topic;
  if (!contentIdea) return res.status(400).json({ error: "idea or topic is required" });
  if (!checkProvider(provider, res)) return;

  let effectiveTone = tone;
  let businessProfile = null;
  if (req.workspaceId) {
    businessProfile = await businessProfileModel.findByWorkspaceId(req.workspaceId);
    if (!effectiveTone && businessProfile?.tone?.length) {
      effectiveTone = businessProfile.tone[0];
    }
  }
  if (!effectiveTone) effectiveTone = "professional";

  try {
    const result = await contentAdaptationService.adaptIdeaToChannels({
      idea: contentIdea,
      channels,
      tone: effectiveTone,
      businessProfile,
      llmProvider: provider,
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { generateCaption, suggestHashtags, repurposeContent, generateVariants };
