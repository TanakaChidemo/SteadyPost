const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test_refresh_secret";

jest.mock("../src/services/website/fetchPage", () => {
  const actual = jest.requireActual("../src/services/website/fetchPage");
  return { ...actual, fetchPage: jest.fn() };
});

const { fetchPage, WebsiteFetchError } = require("../src/services/website/fetchPage");
const app = require("../src/app");

const token = jwt.sign({ sub: "user-1", email: "owner@example.com" }, process.env.JWT_ACCESS_SECRET, {
  algorithm: "HS256",
});
const post = (body) =>
  request(app).post("/api/v1/website/preview").set("Authorization", `Bearer ${token}`).send(body);

describe("POST /api/v1/website/preview", () => {
  afterEach(() => fetchPage.mockReset());

  it("requires auth", async () => {
    const res = await request(app).post("/api/v1/website/preview").send({ url: "rosies.example" });
    expect(res.status).toBe(401);
  });

  it("rejects a missing url", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("returns the extracted fields without saving anything", async () => {
    fetchPage.mockResolvedValue({
      url: "https://rosies.example/",
      html: `<script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Bakery","name":"Rosie's Bakery"}</script>`,
    });

    const res = await post({ url: "rosies.example" });

    expect(res.status).toBe(200);
    expect(fetchPage).toHaveBeenCalledWith("rosies.example");
    expect(res.body).toMatchObject({
      url: "https://rosies.example/",
      found: true,
      fields: { name: "Rosie's Bakery", address: null },
      sources: { name: "json-ld" },
    });
  });

  it("returns found: false for a page with no markup", async () => {
    fetchPage.mockResolvedValue({ url: "https://plain.example/", html: "<p>hello</p>" });
    const res = await post({ url: "plain.example" });
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
  });

  it.each([
    ["INVALID_URL", 422],
    ["BLOCKED_ADDRESS", 422],
    ["NETWORK", 502],
    ["HTTP_ERROR", 502],
    ["NOT_HTML", 502],
    ["TOO_LARGE", 502],
    ["TOO_MANY_REDIRECTS", 502],
    ["TIMEOUT", 504],
  ])("maps %s to HTTP %i", async (code, status) => {
    fetchPage.mockRejectedValue(new WebsiteFetchError(code, `failed: ${code}`));
    const res = await post({ url: "rosies.example" });
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: `failed: ${code}`, code });
  });
});
