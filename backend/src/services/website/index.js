const { fetchPage, WebsiteFetchError } = require("./fetchPage");
const { extractProfile } = require("./extractProfile");

/**
 * One-time website read for onboarding prefill (F24). Stateless: nothing is
 * saved here — storing a WebsiteConnection per workspace is #03.1.
 */
async function previewWebsite(input) {
  const { url, html } = await fetchPage(input);
  return { url, ...extractProfile(html, url) };
}

module.exports = { previewWebsite, WebsiteFetchError };
