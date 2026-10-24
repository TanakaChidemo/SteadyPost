// Turns the fields read from a business's website (#03 extractor, saved per
// workspace by #03.1) into onboarding prefill values (#04.1).

const OFFER_LIMIT = 500; // LIMITS.offer in profileOptions.js

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// Sites often give the country as an ISO code ("ZW"); the profile wants a name.
function countryName(value) {
  const country = clean(value);
  if (!/^[A-Z]{2}$/.test(country)) return country;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) || country;
  } catch {
    return country;
  }
}

function truncateAtWord(value, limit) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

/**
 * Prefill values for the onboarding form from a website's fields. Only
 * includes what the site provided; the name is never included, because it
 * is only offered as a suggestion (see nameSuggestion).
 */
export function prefillFromWebsite(fields) {
  if (!fields) return {};
  const prefill = {};

  const offer = truncateAtWord(clean(fields.description), OFFER_LIMIT);
  if (offer) prefill.offer = offer;

  const address = fields.address || {};
  const location = {};
  if (clean(address.locality)) location.city = clean(address.locality);
  if (clean(address.region)) location.region = clean(address.region);
  if (countryName(address.country)) location.country = countryName(address.country);
  if (Object.keys(location).length) prefill.location = location;

  return prefill;
}

const comparable = (value) => clean(value).toLowerCase();

/**
 * The website's business name, when it differs from the name entered, to
 * show as a one-click suggestion. Null when there's nothing to suggest.
 * Decided 2026-10-22: the name is never filled in or changed automatically.
 */
export function nameSuggestion(currentName, websiteName) {
  const suggested = clean(websiteName);
  if (!suggested || comparable(suggested) === comparable(currentName)) return null;
  return suggested;
}

const TEXT_FIELDS = ["businessType", "websiteUrl", "offer", "audience"];
const LOCATION_FIELDS = ["city", "region", "country", "serviceArea"];
const LABELS = {
  businessType: "type of business",
  offer: "what you offer",
  audience: "customers",
  city: "town",
  region: "region",
  country: "country",
  serviceArea: "area you serve",
};

/**
 * Fill in the form fields the user hasn't, from `prefill`. Never replaces
 * anything already entered, and never touches the name.
 */
export function applyPrefill(values, prefill) {
  if (!prefill) return values;
  const next = { ...values, location: { ...values.location } };
  for (const key of TEXT_FIELDS) {
    if (!clean(next[key]) && clean(prefill[key])) next[key] = prefill[key];
  }
  for (const key of LOCATION_FIELDS) {
    if (!clean(next.location[key]) && clean(prefill.location?.[key])) next.location[key] = prefill.location[key];
  }
  return next;
}

/** Labels of the fields that differ between two form states, e.g. after a prefill. */
export function filledLabels(before, after) {
  const labels = [];
  for (const key of TEXT_FIELDS) if (before[key] !== after[key] && LABELS[key]) labels.push(LABELS[key]);
  for (const key of LOCATION_FIELDS) if (before.location[key] !== after.location[key]) labels.push(LABELS[key]);
  return labels;
}

// Why a website read failed, in words for the business owner. The codes come
// from the backend's WebsiteFetchError.
const READ_ERRORS = {
  TIMEOUT: "it took too long to respond",
  NETWORK: "we couldn't reach it",
  HTTP_ERROR: "it returned an error page",
  NOT_HTML: "that address isn't a web page",
  TOO_LARGE: "its page is too large to read",
  TOO_MANY_REDIRECTS: "it redirects too many times",
  BLOCKED_ADDRESS: "that address isn't a public website",
  INVALID_URL: "that doesn't look like a website address",
};

export function websiteReadError(err) {
  return READ_ERRORS[err?.response?.data?.code] || "we couldn't reach it";
}
