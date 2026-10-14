const fs = require("fs");
const path = require("path");
const { extractProfile } = require("../src/services/website/extractProfile");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures/website", name), "utf8");

describe("extractProfile", () => {
  it("reads a full JSON-LD business from an @graph, ignoring broken blocks", () => {
    const result = extractProfile(fixture("full-jsonld.html"), "https://rosies.example/home");

    expect(result.found).toBe(true);
    expect(result.fields).toEqual({
      name: "Rosie's Bakery",
      address: {
        streetAddress: "12 Market Street",
        locality: "Leeds",
        region: "West Yorkshire",
        postalCode: "LS1 6DT",
        country: "GB",
        formatted: "12 Market Street, Leeds, West Yorkshire, LS1 6DT, GB",
      },
      hours: [
        { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "07:30", closes: "17:00" },
        { days: ["Saturday"], opens: "08:00", closes: "14:00" },
      ],
      services: ["Celebration cakes", "Sourdough loaves", "Wedding cakes"],
      logo: "https://rosies.example/img/logo.png",
      contentFeedUrl: "https://rosies.example/blog/feed.xml",
    });
    expect(result.sources).toEqual({
      name: "json-ld",
      address: "json-ld",
      hours: "json-ld",
      services: "json-ld",
      logo: "json-ld",
      contentFeedUrl: "html",
    });
  });

  it("reads microdata, keeping nested items' properties out of the business", () => {
    const result = extractProfile(fixture("microdata.html"), "https://northside.example/");

    expect(result.found).toBe(true);
    expect(result.fields.name).toBe("Northside Plumbing");
    expect(result.fields.address).toEqual({
      streetAddress: "4 Canal Road",
      locality: "Manchester",
      region: null,
      postalCode: "M1 2AB",
      country: "GB",
      formatted: "4 Canal Road, Manchester, M1 2AB, GB",
    });
    expect(result.fields.hours).toEqual([
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "18:00" },
      { days: ["Saturday"], opens: "09:00", closes: "12:00" },
    ]);
    expect(result.fields.services).toEqual(["Boiler repair", "Emergency call-outs"]);
    expect(result.fields.logo).toBe("https://cdn.northside.example/logo.svg");
    expect(result.sources.name).toBe("microdata");
  });

  it("falls back to Open Graph when there is no schema.org markup", () => {
    const result = extractProfile(fixture("og-only.html"), "https://kofis.example/");

    expect(result.found).toBe(true);
    expect(result.fields).toMatchObject({
      name: "Kofi's Barbers",
      address: null,
      hours: null,
      services: null,
      logo: "https://kofis.example/share.png",
      contentFeedUrl: "https://kofis.example/news.atom",
    });
    expect(result.sources).toMatchObject({ name: "open-graph", logo: "open-graph" });
  });

  it("reports nothing found for a page with no usable markup", () => {
    const result = extractProfile(fixture("none.html"), "https://plain.example/");

    expect(result.found).toBe(false);
    expect(result.fields).toEqual({
      name: null,
      address: null,
      hours: null,
      services: null,
      logo: null,
      contentFeedUrl: null,
    });
    expect(result.sources).toEqual({});
  });

  it("keeps opening-hours text it can't parse as raw", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"LocalBusiness","name":"X",
       "openingHours":["Mo,We,Fr 8:00-12:00, Su 10:00-11:00", "By appointment"]}
    </script>`;
    const { fields } = extractProfile(html, "https://x.example/");

    expect(fields.hours).toEqual([
      { days: ["Monday", "Wednesday", "Friday"], opens: "08:00", closes: "12:00" },
      { days: ["Sunday"], opens: "10:00", closes: "11:00" },
      { raw: "By appointment" },
    ]);
  });

  it("accepts a LocalBusiness subtype it doesn't list, even with only a name", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"HairSalon","name":"Fade Factory"}
    </script>`;
    expect(extractProfile(html, "https://fade.example/").fields.name).toBe("Fade Factory");
  });

  it("doesn't mistake products, pages or reviews for the business", () => {
    const html = `<script type="application/ld+json">
      [{"@context":"https://schema.org","@type":"WebSite","name":"Shop site"},
       {"@context":"https://schema.org","@type":"Product","name":"Blue mug","image":"/mug.png"},
       {"@context":"https://schema.org","@type":"Review","name":"Great mug"}]
    </script>`;
    const result = extractProfile(html, "https://shop.example/");
    expect(result.found).toBe(false);
    expect(result.fields.name).toBeNull();
    expect(result.fields.logo).toBeNull();
  });

  it("prefers the explicit business over another named node", () => {
    const html = `<script type="application/ld+json">
      [{"@context":"https://schema.org","@type":"Place","name":"Market Hall"},
       {"@context":"https://schema.org","@type":"LocalBusiness","name":"Stall 4 Coffee"}]
    </script>`;
    expect(extractProfile(html, "https://stall4.example/").fields.name).toBe("Stall 4 Coffee");
  });

  it("ignores non-http logo URLs", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"Y","logo":"javascript:alert(1)"}
    </script>`;
    expect(extractProfile(html, "https://y.example/").fields.logo).toBeNull();
  });
});
