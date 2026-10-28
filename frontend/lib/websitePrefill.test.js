import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyPrefill,
  filledLabels,
  isWebsiteAsleep,
  nameSuggestion,
  prefillFromWebsite,
  websiteReadError,
} from "./websitePrefill.js";

const EMPTY = {
  name: "",
  businessType: "",
  websiteUrl: "",
  offer: "",
  audience: "",
  location: { city: "", region: "", country: "", serviceArea: "" },
};

// What the #03 extractor returns for pastreet.shop.
const PASTREET = {
  name: "Pastreet",
  description: "Buy from local sellers and collect from a nearby pickup point or get it delivered.",
  address: { streetAddress: null, locality: "Harare", region: null, postalCode: null, country: "ZW" },
  hours: null,
  services: null,
  logo: "https://pastreet.shop/pastreet-logo-512.png",
};

describe("prefillFromWebsite", () => {
  it("maps a full website read to the offer and location", () => {
    assert.deepEqual(prefillFromWebsite(PASTREET), {
      offer: "Buy from local sellers and collect from a nearby pickup point or get it delivered.",
      location: { city: "Harare", country: "Zimbabwe" },
    });
  });

  it("only includes what a partial read found", () => {
    assert.deepEqual(prefillFromWebsite({ name: "Kofi's", description: null, address: null }), {});
    assert.deepEqual(prefillFromWebsite({ description: "  Fades and   trims " }), { offer: "Fades and trims" });
    assert.deepEqual(prefillFromWebsite({ address: { region: "West Yorkshire", country: "United Kingdom" } }), {
      location: { region: "West Yorkshire", country: "United Kingdom" },
    });
  });

  it("gives nothing for no website data", () => {
    assert.deepEqual(prefillFromWebsite(null), {});
    assert.deepEqual(prefillFromWebsite({}), {});
  });

  it("never includes the name", () => {
    assert.equal("name" in prefillFromWebsite(PASTREET), false);
  });

  it("cuts a description longer than the Offer field at a word", () => {
    const { offer } = prefillFromWebsite({ description: "cake ".repeat(200) });
    assert.ok(offer.length <= 500);
    assert.ok(offer.endsWith("cake"));
  });
});

describe("applyPrefill", () => {
  const prefill = prefillFromWebsite(PASTREET);

  it("fills every empty field it has a value for", () => {
    const after = applyPrefill(EMPTY, prefill);
    assert.equal(after.offer, PASTREET.description);
    assert.deepEqual(after.location, { city: "Harare", region: "", country: "Zimbabwe", serviceArea: "" });
    assert.deepEqual(filledLabels(EMPTY, after), ["what you offer", "town", "country"]);
  });

  it("never replaces what the user entered", () => {
    const typed = { ...EMPTY, offer: "My own words", location: { ...EMPTY.location, city: "Bulawayo" } };
    const after = applyPrefill(typed, prefill);
    assert.equal(after.offer, "My own words");
    assert.equal(after.location.city, "Bulawayo");
    assert.equal(after.location.country, "Zimbabwe");
    assert.deepEqual(filledLabels(typed, after), ["country"]);
  });

  it("never fills the name, even if a prefill includes one", () => {
    assert.equal(applyPrefill(EMPTY, { name: "Pastreet" }).name, "");
  });

  it("changes nothing without website data", () => {
    assert.deepEqual(applyPrefill(EMPTY, prefillFromWebsite(null)), EMPTY);
    assert.equal(applyPrefill(EMPTY, null), EMPTY);
  });
});

describe("nameSuggestion", () => {
  it("suggests the website's name when it differs from the one entered", () => {
    assert.equal(nameSuggestion("Onboarding Tester's Workspace", "Pastreet"), "Pastreet");
    assert.equal(nameSuggestion("", " Pastreet "), "Pastreet");
  });

  it("suggests nothing when the names match, ignoring case and spacing", () => {
    assert.equal(nameSuggestion("pastreet", "Pastreet"), null);
    assert.equal(nameSuggestion("  Rosie's   Bakery ", "Rosie's Bakery"), null);
  });

  it("suggests nothing when the website gave no name", () => {
    assert.equal(nameSuggestion("Pastreet", null), null);
    assert.equal(nameSuggestion("Pastreet", "   "), null);
  });
});

describe("isWebsiteAsleep", () => {
  it("is true when the server or the browser stopped waiting", () => {
    assert.equal(isWebsiteAsleep({ response: { data: { code: "TIMEOUT" } } }), true);
    assert.equal(isWebsiteAsleep(Object.assign(new Error("timeout"), { code: "ECONNABORTED" })), true);
  });

  it("is false for failures that trying again won't fix", () => {
    assert.equal(isWebsiteAsleep({ response: { data: { code: "HTTP_ERROR" } } }), false);
    assert.equal(isWebsiteAsleep({ response: { data: { code: "INVALID_URL" } } }), false);
    assert.equal(isWebsiteAsleep(new Error("Network Error")), false);
  });
});

describe("websiteReadError", () => {
  it("explains each failure in plain words", () => {
    assert.equal(websiteReadError({ response: { data: { code: "TIMEOUT" } } }), "it took too long to respond");
    assert.equal(websiteReadError({ response: { data: { code: "NETWORK" } } }), "we couldn't reach it");
  });

  it("says the site was too slow when the browser stops waiting", () => {
    const err = Object.assign(new Error("timeout of 25000ms exceeded"), { code: "ECONNABORTED" });
    assert.equal(websiteReadError(err), "it took too long to respond");
  });

  it("falls back for unknown failures and no response at all", () => {
    assert.equal(websiteReadError({ response: { data: { code: "SOMETHING_NEW" } } }), "we couldn't reach it");
    assert.equal(websiteReadError(new Error("Network Error")), "we couldn't reach it");
  });
});
