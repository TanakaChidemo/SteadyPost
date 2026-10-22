const { fetchPage, WebsiteFetchError } = require("./fetchPage");
const { extractProfile } = require("./extractProfile");

/**
 * One-time website read for onboarding prefill (F24). Stateless: nothing is
 * saved here — saving it per workspace is the connection endpoint (#03.1).
 */
async function previewWebsite(input) {
  const { url, html } = await fetchPageWithRetry(input);
  return { url, ...extractProfile(html, url) };
}

// Hosts that put idle sites to sleep (Fly.io, Render, Heroku free tiers)
// can take longer than the timeout to answer the first request after a
// quiet spell, then respond normally. One retry gives them that chance;
// any other failure is reported straight away.
async function fetchPageWithRetry(input) {
  try {
    return await fetchPage(input);
  } catch (err) {
    if (!(err instanceof WebsiteFetchError) || err.code !== "TIMEOUT") throw err;
    return fetchPage(input);
  }
}

module.exports = { previewWebsite, WebsiteFetchError };
