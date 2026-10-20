const http = require("http");
const zlib = require("zlib");
const {
  createFetcher,
  fetchPage,
  isPublicAddress,
  normaliseUrl,
  WebsiteFetchError,
} = require("../src/services/website/fetchPage");

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("normaliseUrl", () => {
  it("adds https:// when the scheme is missing and drops the fragment", () => {
    expect(normaliseUrl("rosies.example/about#team").toString()).toBe("https://rosies.example/about");
  });

  it.each([
    ["", "INVALID_URL"],
    ["ftp://rosies.example", "INVALID_URL"],
    ["https://user:pass@rosies.example", "INVALID_URL"],
    ["https://rosies.example:8080", "INVALID_URL"],
    ["http://exa mple.com", "INVALID_URL"],
  ])("rejects %p", (input, code) => {
    expect(() => normaliseUrl(input)).toThrow(expect.objectContaining({ code }));
  });
});

describe("fetchPage against a local server", () => {
  let server;
  let base;
  const routes = {};

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const handler = routes[req.url];
      if (handler) return handler(req, res);
      res.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  // The real fetcher must refuse loopback; tests opt in to reach the local server.
  const localFetch = (opts = {}) =>
    createFetcher({
      isAddressAllowed: () => true,
      allowedPorts: new Set([String(server.address().port)]),
      ...opts,
    });

  routes["/page"] = (req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<html><head><title>Hi</title></head></html>");
  };
  routes["/gzip"] = (req, res) => {
    res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" });
    res.end(zlib.gzipSync("<p>compressed café</p>"));
  };
  routes["/redirect"] = (req, res) => res.writeHead(301, { Location: "/page" }).end();
  routes["/loop"] = (req, res) => res.writeHead(302, { Location: "/loop" }).end();
  routes["/json"] = (req, res) => res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  routes["/big"] = (req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("x".repeat(5000));
  };
  routes["/slow"] = (req, res) => {
    setTimeout(() => res.writeHead(200, { "Content-Type": "text/html" }).end("late"), 500);
  };
  routes["/error"] = (req, res) => res.writeHead(500).end();

  it("refuses loopback with the default (production) fetcher", async () => {
    // Port check runs first, so use a production-style fetcher that allows the port.
    const fetcher = createFetcher({ allowedPorts: new Set([String(server.address().port)]) });
    await expect(fetcher(`${base}/page`)).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
    await expect(fetchPage("http://127.0.0.1/")).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });

  it("refuses a hostname that resolves to loopback", async () => {
    const fetcher = createFetcher({ allowedPorts: new Set([String(server.address().port)]) });
    await expect(fetcher(`http://localhost:${server.address().port}/page`)).rejects.toMatchObject({
      code: "BLOCKED_ADDRESS",
    });
  });

  it("returns the HTML and final URL", async () => {
    const result = await localFetch()(`${base}/page`);
    expect(result).toEqual({ url: `${base}/page`, html: "<html><head><title>Hi</title></head></html>" });
  });

  it("follows redirects and reports where it ended up", async () => {
    const result = await localFetch()(`${base}/redirect`);
    expect(result.url).toBe(`${base}/page`);
  });

  it("decompresses gzip responses", async () => {
    expect((await localFetch()(`${base}/gzip`)).html).toBe("<p>compressed café</p>");
  });

  it.each([
    ["/loop", "TOO_MANY_REDIRECTS"],
    ["/json", "NOT_HTML"],
    ["/error", "HTTP_ERROR"],
    ["/missing", "HTTP_ERROR"],
  ])("fails %s with %s", async (route, code) => {
    await expect(localFetch()(`${base}${route}`)).rejects.toMatchObject({ code });
  });

  it("stops reading past the size limit", async () => {
    await expect(localFetch({ maxBytes: 1000 })(`${base}/big`)).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("times out slow sites", async () => {
    await expect(localFetch({ timeoutMs: 100 })(`${base}/slow`)).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("throws WebsiteFetchError instances", async () => {
    await expect(localFetch()(`${base}/error`)).rejects.toBeInstanceOf(WebsiteFetchError);
  });
});
