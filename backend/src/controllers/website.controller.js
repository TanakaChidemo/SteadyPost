const { z } = require("zod");
const { previewWebsite, WebsiteFetchError } = require("../services/website");
const websiteConnectionModel = require("../models/websiteConnection.model");

const urlSchema = z.object({
  url: z.string().trim().min(1, "url is required").max(2048, "url is too long"),
});

// The website, not our request, is at fault for these — report as a bad
// gateway so the client can tell "fix your input" from "the site failed".
const UPSTREAM_ERRORS = new Set(["NETWORK", "HTTP_ERROR", "NOT_HTML", "TOO_LARGE", "TOO_MANY_REDIRECTS"]);

function sendFetchError(res, err) {
  const status = err.code === "TIMEOUT" ? 504 : UPSTREAM_ERRORS.has(err.code) ? 502 : 422;
  return res.status(status).json({ error: err.message, code: err.code });
}

function toConnectionResponse(connection) {
  return {
    id: connection.id,
    workspaceId: connection.workspaceId,
    url: connection.url,
    lastSyncedTime: connection.lastSyncedTime,
    found: connection.found,
    fields: { ...connection.scrapedFields, contentFeedUrl: connection.contentFeedUrl },
    sources: connection.sources,
  };
}

async function preview(req, res) {
  const parsed = urlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid website payload", details: parsed.error.issues });
  }

  try {
    return res.json(await previewWebsite(parsed.data.url));
  } catch (err) {
    if (!(err instanceof WebsiteFetchError)) throw err;
    return sendFetchError(res, err);
  }
}

/**
 * Connect a website to the current workspace, or refresh it: fetches the
 * site once and saves the URL and extracted fields as the workspace's
 * WebsiteConnection. A failed fetch leaves any saved connection untouched.
 */
async function connect(req, res) {
  const parsed = urlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid website payload", details: parsed.error.issues });
  }

  let result;
  try {
    result = await previewWebsite(parsed.data.url);
  } catch (err) {
    if (!(err instanceof WebsiteFetchError)) throw err;
    return sendFetchError(res, err);
  }

  const { contentFeedUrl, ...scrapedFields } = result.fields;
  const connection = await websiteConnectionModel.upsertForWorkspace(req.workspaceId, {
    url: result.url,
    lastSyncedTime: new Date(),
    found: result.found,
    scrapedFields,
    sources: result.sources,
    contentFeedUrl,
  });
  return res.json(toConnectionResponse(connection));
}

/** The current workspace's saved website fields, for onboarding prefill. */
async function getConnection(req, res) {
  const connection = await websiteConnectionModel.findByWorkspaceId(req.workspaceId);
  if (!connection) {
    return res.status(404).json({ error: "No website connected to this workspace" });
  }
  return res.json(toConnectionResponse(connection));
}

module.exports = { preview, connect, getConnection };
