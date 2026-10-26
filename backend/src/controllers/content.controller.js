const ContentDraft = require("../models/contentDraft.model");
const postModel = require("../models/post.model");
const { z } = require("zod");

const draftSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  platforms: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string()).optional(),
  status: z.string().optional(),
  aiMetadata: z.record(z.any()).optional(),
});

async function list(req, res) {
  const drafts = await ContentDraft.find({ ownerId: req.user.id });
  let postDrafts = [];
  try {
    if (req.workspaceId) {
      postDrafts = await postModel.findByWorkspaceId(req.workspaceId, { status: "draft" });
    } else {
      postDrafts = await postModel.Post.find({ authorId: req.user.id, status: "draft" }).lean();
    }
  } catch (err) {
    postDrafts = [];
  }

  const existingTitlesAndBodies = new Set(
    drafts.map((d) => `${(d.title || "").trim()}:::${(d.body || "").trim()}`)
  );

  const extra = [];
  for (const p of postDrafts) {
    const key = `${(p.content?.title || "").trim()}:::${(p.content?.body || "").trim()}`;
    if (!existingTitlesAndBodies.has(key)) {
      existingTitlesAndBodies.add(key);
      extra.push({
        _id: p.id || p._id,
        ownerId: p.authorId,
        title: p.content?.title || `Draft for ${p.channel}`,
        body: p.content?.body || "",
        platforms: [p.channel],
        mediaUrls: p.content?.mediaUrls || [],
        status: "draft",
        aiMetadata: p.aiMetadata || {},
        updatedAt: p.updatedAt || new Date(),
        createdAt: p.createdAt || new Date(),
      });
    }
  }

  const all = [...drafts, ...extra];
  const sorted = all.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return res.json({ items: sorted.slice(0, 100) });
}

async function create(req, res) {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid draft payload", details: parsed.error.issues });
  }

  const { title, body, platforms = [], mediaUrls = [], aiMetadata = {} } = parsed.data;

  const draft = await ContentDraft.create({
    ownerId: req.user.id,
    title,
    body,
    platforms,
    mediaUrls,
    status: "draft",
    aiMetadata,
    versions: [{ body, editedAt: new Date(), editedBy: req.user.id }],
  });

  return res.status(201).json(draft);
}

async function getById(req, res) {
  const draftId = req.params.id;
  if (!draftId) return res.status(400).json({ error: "Draft ID required" });

  const draft = await ContentDraft.findOne({ _id: draftId, ownerId: req.user.id });
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  return res.json(draft);
}

async function update(req, res) {
  const draftId = req.params.id;
  if (!draftId) return res.status(400).json({ error: "Draft ID required" });

  const draft = await ContentDraft.findOne({ _id: draftId, ownerId: req.user.id });
  if (!draft) return res.status(404).json({ error: "Draft not found" });

  if (req.body.body && req.body.body !== draft.body) {
    draft.versions = draft.versions || [];
    draft.versions.push({
      body: draft.body,
      editedAt: new Date(),
      editedBy: req.user.id,
    });
  }

  draft.title = req.body.title !== undefined ? req.body.title : draft.title;
  draft.body = req.body.body !== undefined ? req.body.body : draft.body;
  draft.platforms = req.body.platforms !== undefined ? req.body.platforms : draft.platforms;
  draft.mediaUrls = req.body.mediaUrls !== undefined ? req.body.mediaUrls : draft.mediaUrls;
  draft.status = req.body.status !== undefined ? req.body.status : draft.status;
  if (req.body.aiMetadata) {
    draft.aiMetadata = { ...(draft.aiMetadata || {}), ...req.body.aiMetadata };
  }

  await ContentDraft.save(draft);
  return res.json(draft);
}

async function remove(req, res) {
  const draftId = req.params.id;
  if (!draftId) return res.status(400).json({ error: "Draft ID required" });

  const result = await ContentDraft.deleteOne({ _id: draftId, ownerId: req.user.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Draft not found" });
  return res.status(204).send();
}

async function listVersions(req, res) {
  const draftId = req.params.id;
  const draft = await ContentDraft.findOne({ _id: draftId, ownerId: req.user.id });
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  return res.json({ versions: draft.versions || [] });
}

async function uploadMedia(req, res) {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: "At least one image or video file is required" });
  }

  // No object storage in this scaffold — files are converted to base64 data
  // URLs and held in memory for the life of the request/session.
  const mediaUrls = files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString("base64")}`);

  return res.status(200).json({ mediaUrls, count: mediaUrls.length });
}

module.exports = { list, create, getById, update, remove, listVersions, uploadMedia };
