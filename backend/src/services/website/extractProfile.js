const cheerio = require("cheerio");

// schema.org types that describe the business itself. There are hundreds of
// LocalBusiness subtypes (Bakery, Dentist, HairSalon...), so any named node
// whose type isn't in NON_BUSINESS_TYPES is treated as a probable business,
// just ranked below these explicit ones.
const BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "Organization",
  "Corporation",
  "Store",
  "Restaurant",
  "FoodEstablishment",
  "ProfessionalService",
  "HomeAndConstructionBusiness",
  "HealthAndBeautyBusiness",
  "MedicalBusiness",
  "AutomotiveBusiness",
  "LodgingBusiness",
  "SportsActivityLocation",
  "EntertainmentBusiness",
  "FinancialService",
  "LegalService",
  "OnlineBusiness",
  "OnlineStore",
]);

// Common types that appear on business sites but never describe the business.
const NON_BUSINESS_TYPES = new Set([
  "WebSite",
  "WebPage",
  "AboutPage",
  "ContactPage",
  "CollectionPage",
  "FAQPage",
  "ItemPage",
  "SearchResultsPage",
  "BreadcrumbList",
  "ItemList",
  "ListItem",
  "SiteNavigationElement",
  "WPHeader",
  "WPFooter",
  "SearchAction",
  "ImageObject",
  "VideoObject",
  "Article",
  "BlogPosting",
  "NewsArticle",
  "Product",
  "Offer",
  "AggregateOffer",
  "OfferCatalog",
  "Service",
  "Review",
  "AggregateRating",
  "Rating",
  "Person",
  "Event",
  "Question",
  "Answer",
  "HowTo",
  "Recipe",
  "PostalAddress",
  "OpeningHoursSpecification",
  "GeoCoordinates",
  "Brand",
  "Country",
]);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_ABBREV = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };
const MAX_SERVICES = 50;
const MAX_DESCRIPTION = 1000;

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function typesOf(node) {
  return asArray(node && node["@type"]).map((t) => String(t).replace(/^https?:\/\/schema\.org\//, ""));
}

function text(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return text(value.name || value["@value"] || value.url);
  const s = String(value).replace(/\s+/g, " ").trim();
  return s || null;
}

function absolute(href, baseUrl) {
  if (!href) return null;
  try {
    const url = new URL(String(href).trim(), baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// --- JSON-LD ---------------------------------------------------------------

function flattenJsonLd(value, out = []) {
  for (const item of asArray(value)) {
    if (!item || typeof item !== "object") continue;
    if (item["@graph"]) flattenJsonLd(item["@graph"], out);
    if (item["@type"]) out.push(item);
  }
  return out;
}

function readJsonLd($) {
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      flattenJsonLd(JSON.parse(raw), nodes);
    } catch {
      // Sites often ship broken JSON-LD; skip the block rather than fail.
    }
  });
  return nodes;
}

// --- Microdata -------------------------------------------------------------

function microdataValue($, el) {
  const $el = $(el);
  if ($el.is("[itemscope]")) return readMicrodataItem($, el);
  if ($el.is("meta")) return $el.attr("content");
  if ($el.is("a, link, area")) return $el.attr("href");
  if ($el.is("img, audio, video, source, iframe, embed")) return $el.attr("src");
  if ($el.is("time")) return $el.attr("datetime") || $el.text();
  if ($el.is("data, meter")) return $el.attr("value");
  return $el.attr("content") || $el.text();
}

function readMicrodataItem($, scopeEl) {
  const $scope = $(scopeEl);
  const item = {};
  const type = $scope.attr("itemtype");
  if (type) item["@type"] = type.split(/\s+/).map((t) => t.replace(/^https?:\/\/schema\.org\//, ""));

  // Only properties that belong to this scope, not to a nested itemscope.
  $scope.find("[itemprop]").each((_, el) => {
    const owner = $(el).parent().closest("[itemscope]");
    if (owner.get(0) !== scopeEl) return;
    const value = microdataValue($, el);
    for (const prop of String($(el).attr("itemprop")).split(/\s+/)) {
      if (!prop) continue;
      item[prop] = item[prop] === undefined ? value : asArray(item[prop]).concat([value]);
    }
  });
  return item;
}

function readMicrodata($) {
  const nodes = [];
  $("[itemscope][itemtype]").each((_, el) => {
    if ($(el).is("[itemprop]")) return; // nested item, read via its parent
    nodes.push(readMicrodataItem($, el));
  });
  return nodes;
}

// --- Choosing the business node --------------------------------------------

function businessScore(node) {
  const types = typesOf(node);
  if (!types.length || types.every((t) => NON_BUSINESS_TYPES.has(t))) return 0;

  const explicit = types.some((t) => BUSINESS_TYPES.has(t));
  const hasDetails = Boolean(node.address || node.openingHoursSpecification || node.openingHours);
  // An unknown type with no name or business details is too weak a signal.
  if (!explicit && !hasDetails && !node.name) return 0;

  let score = explicit ? 3 : 1;
  if (types.includes("LocalBusiness")) score += 1;
  if (node.address) score += 2;
  if (node.openingHoursSpecification || node.openingHours) score += 2;
  if (node.name) score += 1;
  return score;
}

function pickBusiness(nodes) {
  let best = null;
  let bestScore = 0;
  for (const node of nodes) {
    const score = businessScore(node);
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

// --- Field normalisers -----------------------------------------------------

function normaliseAddress(value) {
  const first = asArray(value)[0];
  if (!first) return null;
  if (typeof first === "string") return text(first) ? { formatted: text(first) } : null;

  const country = first.addressCountry;
  const parts = {
    streetAddress: text(first.streetAddress),
    locality: text(first.addressLocality),
    region: text(first.addressRegion),
    postalCode: text(first.postalCode),
    country: text(typeof country === "object" ? country.name : country),
  };
  const formatted = Object.values(parts).filter(Boolean).join(", ");
  return formatted ? { ...parts, formatted } : null;
}

function dayName(value) {
  const s = String(value).replace(/^https?:\/\/schema\.org\//, "").trim();
  return DAYS.find((d) => d.toLowerCase() === s.toLowerCase()) || null;
}

function expandDays(spec) {
  const days = [];
  for (const part of spec.split(",")) {
    const [from, to] = part.trim().toLowerCase().split("-");
    const a = DAY_ABBREV[from && from.slice(0, 2)];
    if (a === undefined) return null;
    const b = to === undefined ? a : DAY_ABBREV[to.slice(0, 2)];
    if (b === undefined) return null;
    for (let i = a; ; i = (i + 1) % 7) {
      days.push(DAYS[i]);
      if (i === b) break;
    }
  }
  return days;
}

// "Mo-Fr 09:00-17:00", "Sa 10:00-14:00", "Mo,We,Fr 08:00-12:00"
function parseOpeningHoursText(line) {
  const m = /^\s*([A-Za-z,\- ]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(line);
  const days = m && expandDays(m[1].replace(/\s+/g, ""));
  if (!days) return { raw: line.trim() };
  return { days, opens: m[2].padStart(5, "0"), closes: m[3].padStart(5, "0") };
}

function normaliseHours(node) {
  const hours = [];
  for (const spec of asArray(node.openingHoursSpecification)) {
    if (!spec || typeof spec !== "object") continue;
    const days = asArray(spec.dayOfWeek).map(dayName).filter(Boolean);
    const opens = text(spec.opens);
    const closes = text(spec.closes);
    if (days.length && opens && closes) {
      hours.push({ days, opens: opens.slice(0, 5), closes: closes.slice(0, 5) });
    }
  }
  for (const entry of asArray(node.openingHours)) {
    // Some sites put several ranges in one string, separated by commas
    // between ranges (but commas also separate days, e.g. "Mo,We 9:00-12:00").
    for (const line of String(entry).split(/(?<=\d{2}:\d{2})\s*[,;]\s*/)) {
      if (line.trim()) hours.push(parseOpeningHoursText(line));
    }
  }
  return hours.length ? hours : null;
}

function catalogNames(catalog, out) {
  for (const entry of asArray(catalog)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.itemListElement) catalogNames(entry.itemListElement, out);
    else out.push(entry.itemOffered ? entry.itemOffered : entry);
  }
  return out;
}

function normaliseServices(node) {
  const names = [];
  for (const offer of asArray(node.makesOffer)) {
    names.push(text(offer && (offer.itemOffered || offer)));
  }
  for (const item of catalogNames(node.hasOfferCatalog, [])) names.push(text(item));
  for (const type of asArray(node.serviceType)) names.push(text(type));

  const unique = [...new Set(names.filter(Boolean))].slice(0, MAX_SERVICES);
  return unique.length ? unique : null;
}

function normaliseLogo(node, baseUrl) {
  for (const candidate of [...asArray(node.logo), ...asArray(node.image)]) {
    const href = typeof candidate === "object" ? candidate.url || candidate.contentUrl : candidate;
    const url = absolute(href, baseUrl);
    if (url) return url;
  }
  return null;
}

// --- Open Graph and feed ---------------------------------------------------

function readOpenGraph($) {
  const og = {};
  $("meta[property^='og:'], meta[name^='og:']").each((_, el) => {
    const key = ($(el).attr("property") || $(el).attr("name")).slice(3).toLowerCase();
    const value = text($(el).attr("content"));
    if (value && og[key] === undefined) og[key] = value;
  });
  return og;
}

// Title segments that describe the page, not the business.
const GENERIC_TITLE = /^(home(\s*page)?|welcome!?|index|untitled|main|official (web)?site|website)$/i;

// The business name from <title>, for sites with no markup at all (often
// single-page apps whose HTML is an empty shell). "Home | Rosie's Bakery"
// gives "Rosie's Bakery"; a title that is only "Home" gives nothing.
function readTitleName($) {
  const title = text($("head > title").first().text());
  if (!title) return null;
  const parts = title
    .split(/\s+[|–—·:-]\s+|\s*[|–—·]\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !GENERIC_TITLE.test(part));
  return parts[0] || null;
}

// A logo from the page's icons: an apple-touch-icon, or an SVG/PNG icon.
// A plain favicon.ico is too small to use as a logo, so it is skipped.
function readIconLogo($, baseUrl) {
  const touch = $('link[rel~="apple-touch-icon"]').first().attr("href");
  if (touch) return absolute(touch, baseUrl);

  let logo = null;
  $('link[rel~="icon"]').each((_, el) => {
    const href = $(el).attr("href");
    const type = ($(el).attr("type") || "").toLowerCase();
    const isImage = type === "image/svg+xml" || type === "image/png" || /\.(svg|png)(\?|#|$)/i.test(href || "");
    if (!logo && isImage) logo = absolute(href, baseUrl);
  });
  return logo;
}

// The site's own one-line summary, used to prefill the profile's Offer (#04.1).
function normaliseDescription(value) {
  const s = text(value);
  if (!s) return null;
  if (s.length <= MAX_DESCRIPTION) return s;
  const cut = s.slice(0, MAX_DESCRIPTION);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : MAX_DESCRIPTION);
}

function readMetaDescription($) {
  return $('meta[name="description" i]').first().attr("content");
}

function readFeedUrl($, baseUrl) {
  const href = $(
    'link[rel~="alternate"][type="application/rss+xml"], link[rel~="alternate"][type="application/atom+xml"]'
  )
    .first()
    .attr("href");
  return absolute(href, baseUrl);
}

/**
 * Extract the business details a site exposes through schema.org markup
 * (JSON-LD or microdata) and Open Graph tags, falling back to the page
 * <title> for the name and its icons for the logo. The description comes
 * from schema.org, then og:description, then <meta name="description">.
 * Pure: no network access.
 *
 * Field names line up with BusinessProfile (#04) so the website connection
 * (#03.1) can map them across directly.
 */
function extractProfile(html, baseUrl) {
  const $ = cheerio.load(html || "");
  const jsonLd = readJsonLd($);
  const business = pickBusiness([...jsonLd, ...readMicrodata($)]) || {};
  const businessSource = jsonLd.includes(business) ? "json-ld" : "microdata";
  const og = readOpenGraph($);

  const fields = {
    name: null,
    description: null,
    address: null,
    hours: null,
    services: null,
    logo: null,
    contentFeedUrl: readFeedUrl($, baseUrl),
  };
  const sources = {};

  const set = (key, value, source) => {
    if (value && !fields[key]) {
      fields[key] = value;
      sources[key] = source;
    }
  };

  set("name", text(business.name), businessSource);
  set("name", og.site_name, "open-graph");
  set("name", og.title, "open-graph");
  set("name", readTitleName($), "html");
  set("description", normaliseDescription(business.description), businessSource);
  set("description", normaliseDescription(og.description), "open-graph");
  set("description", normaliseDescription(readMetaDescription($)), "html");
  set("address", normaliseAddress(business.address), businessSource);
  set("hours", normaliseHours(business), businessSource);
  set("services", normaliseServices(business), businessSource);
  set("logo", normaliseLogo(business, baseUrl), businessSource);
  set("logo", absolute(og.image, baseUrl), "open-graph");
  set("logo", readIconLogo($, baseUrl), "html");
  if (fields.contentFeedUrl) sources.contentFeedUrl = "html";

  const found = ["name", "description", "address", "hours", "services", "logo"].some((k) => fields[k]);
  return { found, fields, sources };
}

module.exports = { extractProfile };
