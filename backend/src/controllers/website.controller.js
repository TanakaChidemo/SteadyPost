const { z } = require("zod");
const { previewWebsite, WebsiteFetchError } = require("../services/website");

const previewSchema = z.object({
  url: z.string().trim().min(1, "url is required").max(2048, "url is too long"),
});

// The website, not our request, is at fault for these — report as a bad
// gateway so the client can tell "fix your input" from "the site failed".
const UPSTREAM_ERRORS = new Set(["NETWORK", "HTTP_ERROR", "NOT_HTML", "TOO_LARGE", "TOO_MANY_REDIRECTS"]);

async function preview(req, res) {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid website payload", details: parsed.error.issues });
  }

  try {
    return res.json(await previewWebsite(parsed.data.url));
  } catch (err) {
    if (!(err instanceof WebsiteFetchError)) throw err;
    const status = err.code === "TIMEOUT" ? 504 : UPSTREAM_ERRORS.has(err.code) ? 502 : 422;
    return res.status(status).json({ error: err.message, code: err.code });
  }
}

module.exports = { preview };
