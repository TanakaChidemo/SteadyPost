const guardrailsService = require("../services/guardrails/guardrailsService");

async function checkDraft(req, res) {
  const { content, channel = "instagram", mediaUrls = [], hashtags = [] } = req.body;
  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }

  const result = await guardrailsService.auditDraft({
    content,
    channel,
    mediaUrls,
    hashtags,
    workspaceId: req.workspaceId,
  });

  return res.json(result);
}

async function checkTrend(req, res) {
  const { topic, snippet = "" } = req.body;
  if (!topic) {
    return res.status(400).json({ error: "topic is required" });
  }

  const result = await guardrailsService.auditTrend({
    topic,
    snippet,
    workspaceId: req.workspaceId,
  });

  return res.json(result);
}

async function checkImage(req, res) {
  const { prompt, aspectRatio = "1:1" } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const result = await guardrailsService.auditImagePrompt({
    prompt,
    aspectRatio,
    workspaceId: req.workspaceId,
  });

  return res.json(result);
}

module.exports = {
  checkDraft,
  checkTrend,
  checkImage,
};
