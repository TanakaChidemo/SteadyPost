const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");
const zlib = require("zlib");

const DEFAULTS = {
  timeoutMs: 8000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 5,
};

const USER_AGENT = "SteadyPostBot/0.1 (+website connection; one-time profile prefill)";
const ALLOWED_PORTS = new Set(["", "80", "443"]);

class WebsiteFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WebsiteFetchError";
    this.code = code;
  }
}

// The URL comes from the user, so the server must never be tricked into
// calling itself, the cloud metadata endpoint or anything else on a private
// network. Checked against the resolved IP at connect time (see guardedLookup),
// so a hostname that resolves to a private address is caught too.
const blockedAddresses = new net.BlockList();
[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(([addr, prefix]) => blockedAddresses.addSubnet(addr, prefix, "ipv4"));
[
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
].forEach(([addr, prefix]) => blockedAddresses.addSubnet(addr, prefix, "ipv6"));

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 0) return false;

  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — judge the embedded IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);

  return !blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

function normaliseUrl(input, allowedPorts = ALLOWED_PORTS) {
  const raw = String(input || "").trim();
  if (!raw) throw new WebsiteFetchError("INVALID_URL", "A website URL is required");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new WebsiteFetchError("INVALID_URL", "That doesn't look like a valid website URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebsiteFetchError("INVALID_URL", "Only http and https websites are supported");
  }
  if (url.username || url.password) {
    throw new WebsiteFetchError("INVALID_URL", "URLs with a username or password aren't supported");
  }
  if (!allowedPorts.has(url.port)) {
    throw new WebsiteFetchError("INVALID_URL", "Only websites on the standard ports (80/443) are supported");
  }
  url.hash = "";
  return url;
}

function createFetcher({
  isAddressAllowed = isPublicAddress,
  allowedPorts = ALLOWED_PORTS,
  ...overrides
} = {}) {
  const options = { ...DEFAULTS, ...overrides };

  function guardedLookup(hostname, lookupOptions, callback) {
    dns.lookup(hostname, { ...lookupOptions, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const blocked = addresses.find((a) => !isAddressAllowed(a.address));
      if (blocked) {
        return callback(
          new WebsiteFetchError("BLOCKED_ADDRESS", "That website points to a private or reserved address")
        );
      }
      if (lookupOptions.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  }

  function requestOnce(url, deadline) {
    return new Promise((resolve, reject) => {
      // Node skips the lookup hook for IP-literal hosts, so check those here.
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (net.isIP(host) && !isAddressAllowed(host)) {
        return reject(
          new WebsiteFetchError("BLOCKED_ADDRESS", "That website points to a private or reserved address")
        );
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return reject(new WebsiteFetchError("TIMEOUT", "The website took too long to respond"));
      }

      const client = url.protocol === "https:" ? https : http;
      const req = client.get(
        url,
        {
          lookup: guardedLookup,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "Accept-Encoding": "gzip, deflate, br",
          },
          timeout: remaining,
        },
        (res) => resolve({ res, req })
      );
      req.on("timeout", () => req.destroy(new WebsiteFetchError("TIMEOUT", "The website took too long to respond")));
      req.on("error", (err) =>
        reject(
          err instanceof WebsiteFetchError
            ? err
            : new WebsiteFetchError("NETWORK", `Couldn't reach the website (${err.code || err.message})`)
        )
      );
    });
  }

  function readBody(res, req, deadline) {
    const encoding = String(res.headers["content-encoding"] || "").toLowerCase();
    let stream = res;
    if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
    else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
    else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());

    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      const timer = setTimeout(() => {
        req.destroy();
        reject(new WebsiteFetchError("TIMEOUT", "The website took too long to respond"));
      }, Math.max(deadline - Date.now(), 0));

      stream.on("data", (chunk) => {
        total += chunk.length;
        if (total > options.maxBytes) {
          clearTimeout(timer);
          req.destroy();
          reject(new WebsiteFetchError("TOO_LARGE", "The website's page is too large to read"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      stream.on("error", (err) => {
        clearTimeout(timer);
        reject(new WebsiteFetchError("NETWORK", `Couldn't read the website's response (${err.message})`));
      });
    });
  }

  function decode(buffer, contentType) {
    const charset = /charset=["']?([\w-]+)/i.exec(contentType || "");
    try {
      return new TextDecoder(charset ? charset[1] : "utf-8").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }

  /**
   * Fetch a page from a user-supplied URL and return its HTML. Follows up to
   * maxRedirects redirects, re-checking each hop. Throws WebsiteFetchError.
   */
  async function fetchPage(input) {
    let url = normaliseUrl(input, allowedPorts);
    const deadline = Date.now() + options.timeoutMs;

    for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
      const { res, req } = await requestOnce(url, deadline);

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        url = normaliseUrl(new URL(res.headers.location, url).toString(), allowedPorts);
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        throw new WebsiteFetchError("HTTP_ERROR", `The website responded with HTTP ${res.statusCode}`);
      }

      const contentType = String(res.headers["content-type"] || "");
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        res.resume();
        throw new WebsiteFetchError("NOT_HTML", "That URL isn't a web page");
      }

      const body = await readBody(res, req, deadline);
      return { url: url.toString(), html: decode(body, contentType) };
    }

    throw new WebsiteFetchError("TOO_MANY_REDIRECTS", "The website redirected too many times");
  }

  return fetchPage;
}

module.exports = {
  createFetcher,
  fetchPage: createFetcher(),
  isPublicAddress,
  normaliseUrl,
  WebsiteFetchError,
};
