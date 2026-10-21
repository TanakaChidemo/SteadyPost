const opportunityModel = require("../models/opportunity.model");
const postModel = require("../models/post.model");

async function list(req, res) {
  const { response } = req.query;
  const items = await opportunityModel.findByWorkspaceId(req.workspaceId, { response });
  return res.json({ items });
}

async function getById(req, res) {
  const item = await opportunityModel.findById(req.params.id);
  if (!item || item.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Opportunity not found" });
  }
  return res.json(item);
}

async function respond(req, res) {
  const { response, feedbackNote } = req.body;
  if (!response) return res.status(400).json({ error: "Response is required" });

  const item = await opportunityModel.findById(req.params.id);
  if (!item || item.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Opportunity not found" });
  }

  const updated = await opportunityModel.recordResponse(item.id, {
    response,
    feedbackNote,
  });

  return res.json(updated);
}

async function convertToDraft(req, res) {
  const item = await opportunityModel.findById(req.params.id);
  if (!item || item.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Opportunity not found" });
  }

  const { title = "Opportunity Draft", body = "", channel = "facebook" } = req.body;

  const post = await postModel.create({
    workspaceId: req.workspaceId,
    authorId: req.user.id,
    channel,
    content: {
      title,
      body: body || item.sourceReference?.snippet || "",
      mediaUrls: [],
      hashtags: [],
    },
    status: "draft",
    origin: "opportunity",
    aiMetadata: {
      opportunityId: item.id,
      triggerType: item.triggerType,
      relevanceScore: item.relevanceScore,
    },
    versions: [{ body: body || item.sourceReference?.snippet || "", editedAt: new Date(), editedBy: req.user.id }],
  });

  await opportunityModel.recordResponse(item.id, {
    response: "approved",
    linkedDraftId: post.id,
  });

  return res.status(201).json({
    post,
    opportunityId: item.id,
  });
}

module.exports = { list, getById, respond, convertToDraft };
