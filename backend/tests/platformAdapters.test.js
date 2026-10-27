const BaseAdapter = require("../src/services/publishers/BaseAdapter");
const MetaAdapter = require("../src/services/publishers/MetaAdapter");
const TwitterAdapter = require("../src/services/publishers/TwitterAdapter");
const LinkedInAdapter = require("../src/services/publishers/LinkedInAdapter");
const GbpAdapter = require("../src/services/publishers/GbpAdapter");
const { adapterRegistry, getAdapter, registerAdapter } = require("../src/services/publishers/adapterRegistry");

describe("Platform Adapter Architecture Tests (#10 & #13)", () => {
  beforeEach(() => {
    adapterRegistry.resetDefaults();
  });

  afterAll(() => {
    adapterRegistry.resetDefaults();
  });

  describe("BaseAdapter & Adapter Shape", () => {
    it("throws when instantiated without platform", () => {
      expect(() => new BaseAdapter()).toThrow("BaseAdapter requires a platform identifier");
    });

    it("verifies all adapters inherit from BaseAdapter and implement identical shape", () => {
      const adapters = [
        new MetaAdapter("facebook"),
        new MetaAdapter("instagram"),
        new TwitterAdapter(),
        new LinkedInAdapter(),
        new GbpAdapter(),
      ];

      for (const adapter of adapters) {
        expect(adapter).toBeInstanceOf(BaseAdapter);
        expect(typeof adapter.publish).toBe("function");
        expect(typeof adapter.getMetrics).toBe("function");
        expect(typeof adapter.validateCredentials).toBe("function");
      }
    });
  });

  describe("Adapter Registry & Swapping / Mocking Support", () => {
    it("resolves default adapters for supported platforms", () => {
      expect(getAdapter("facebook")).toBeInstanceOf(MetaAdapter);
      expect(getAdapter("instagram")).toBeInstanceOf(MetaAdapter);
      expect(getAdapter("twitter")).toBeInstanceOf(TwitterAdapter);
      expect(getAdapter("linkedin")).toBeInstanceOf(LinkedInAdapter);
      expect(getAdapter("gbp")).toBeInstanceOf(GbpAdapter);
      expect(getAdapter("google_business")).toBeInstanceOf(GbpAdapter);
    });

    it("allows registering and swapping mock adapters for testing", async () => {
      class MockCustomAdapter extends BaseAdapter {
        constructor() {
          super("custom_platform");
        }
        async publish({ content }) {
          return {
            platform: "custom_platform",
            externalId: "mock_custom_123",
            publishedAt: new Date().toISOString(),
            content,
          };
        }
        async getMetrics() {
          return { reach: 100, likes: 20, comments: 5, shares: 2, clicks: 10 };
        }
      }

      registerAdapter("custom_platform", new MockCustomAdapter());
      const customAdapter = getAdapter("custom_platform");
      expect(customAdapter).toBeInstanceOf(MockCustomAdapter);

      const pubResult = await customAdapter.publish({ content: "Hello custom" });
      expect(pubResult.externalId).toBe("mock_custom_123");
      expect(pubResult.content).toBe("Hello custom");

      const metrics = await customAdapter.getMetrics();
      expect(metrics.reach).toBe(100);
      expect(metrics.likes).toBe(20);
    });

    it("throws on unsupported platforms", () => {
      expect(() => getAdapter("myspace")).toThrow(/Unsupported platform adapter: myspace/);
    });
  });

  describe("MetaAdapter (Facebook & Instagram)", () => {
    const adapter = new MetaAdapter("facebook");

    it("publishes to Facebook in sandbox simulator mode", async () => {
      const res = await adapter.publish({
        postId: "post_test_fb",
        content: "Exciting Facebook update!",
        platform: "facebook",
        account: { isMock: true },
      });

      expect(res.platform).toBe("facebook");
      expect(res.simulated).toBe(true);
      expect(res.externalId).toMatch(/^facebook_post_/);
    });

    it("publishes to Instagram in sandbox simulator mode", async () => {
      const res = await adapter.publish({
        postId: "post_test_ig",
        content: "Visual storytelling on Instagram",
        platform: "instagram",
        mediaUrls: ["https://example.com/photo.jpg"],
        account: { isMock: true },
      });

      expect(res.platform).toBe("instagram");
      expect(res.simulated).toBe(true);
      expect(res.externalId).toMatch(/^instagram_post_/);
    });

    it("collects simulated metrics for Facebook and Instagram", async () => {
      const fbMetrics = await adapter.getMetrics({
        externalPostId: "fb_123",
        platform: "facebook",
      });
      expect(fbMetrics.reach).toBeGreaterThan(0);
      expect(fbMetrics.likes).toBeGreaterThan(0);

      const igMetrics = await adapter.getMetrics({
        externalPostId: "ig_123",
        platform: "instagram",
      });
      expect(igMetrics.reach).toBeGreaterThan(0);
      expect(igMetrics.likes).toBeGreaterThan(0);
    });
  });

  describe("TwitterAdapter", () => {
    const adapter = new TwitterAdapter();

    it("publishes in sandbox mode and returns status url", async () => {
      const res = await adapter.publish({
        postId: "post_test_tw",
        content: "Announcing our new feature! #buildinpublic",
        account: { isMock: true },
      });

      expect(res.platform).toBe("twitter");
      expect(res.simulated).toBe(true);
      expect(res.externalId).toMatch(/^tweet_/);
      expect(res.url).toContain("https://twitter.com/i/status/");
    });

    it("truncates tweet content exceeding 280 characters", () => {
      const longText = "A".repeat(300);
      const formatted = adapter.formatTweetText(longText, ["saas"]);
      expect(formatted.length).toBeLessThanOrEqual(280);
      expect(formatted.endsWith("...")).toBe(true);
    });

    it("collects simulated Twitter metrics", async () => {
      const metrics = await adapter.getMetrics({
        externalPostId: "tweet_123",
      });
      expect(metrics.reach).toBeGreaterThan(0);
      expect(metrics.shares).toBeGreaterThanOrEqual(0); // retweets
    });
  });

  describe("LinkedInAdapter", () => {
    const adapter = new LinkedInAdapter();

    it("publishes in sandbox mode and returns update url", async () => {
      const res = await adapter.publish({
        postId: "post_test_li",
        content: "Professional insights on scaling team operations.",
        hashtags: ["leadership", "innovation"],
        account: { isMock: true },
      });

      expect(res.platform).toBe("linkedin");
      expect(res.simulated).toBe(true);
      expect(res.externalId).toMatch(/^urn:li:share:/);
      expect(res.url).toContain("https://www.linkedin.com/feed/update/");
    });

    it("collects simulated LinkedIn metrics", async () => {
      const metrics = await adapter.getMetrics({
        externalPostId: "urn:li:share:123",
      });
      expect(metrics.reach).toBeGreaterThan(0);
      expect(metrics.clicks).toBeGreaterThan(0);
    });
  });

  describe("GbpAdapter (Google Business Profile Local Posts #13)", () => {
    const adapter = new GbpAdapter();

    it("builds correct GBP Local Post payload with Call-To-Action and topicType", async () => {
      const payload = await adapter.buildLocalPostPayload({
        content: "Special weekend bakery tasting event! Stop by our Downtown location.",
        mediaUrls: ["https://example.com/pastry.jpg"],
        options: {
          topicType: "EVENT",
          callToAction: { actionType: "LEARN_MORE", url: "https://rosiesbakery.co.uk/event" },
          event: {
            title: "Weekend Tasting",
            schedule: { startDate: { year: 2026, month: 11, day: 10 } },
          },
        },
      });

      expect(payload.topicType).toBe("EVENT");
      expect(payload.callToAction.actionType).toBe("LEARN_MORE");
      expect(payload.callToAction.url).toBe("https://rosiesbakery.co.uk/event");
      expect(payload.media[0].sourceUrl).toBe("https://example.com/pastry.jpg");
    });

    it("publishes GBP Local Post in sandbox simulator mode (#13)", async () => {
      const res = await adapter.publish({
        postId: "post_test_gbp",
        content: "Fresh artisan sourdough every morning! Order ahead for pickup.",
        mediaUrls: ["https://example.com/sourdough.jpg"],
        options: {
          topicType: "STANDARD",
          callToAction: { actionType: "ORDER", url: "https://rosiesbakery.co.uk/order" },
        },
        account: { isMock: true },
      });

      expect(res.platform).toBe("gbp");
      expect(res.simulated).toBe(true);
      expect(res.externalId).toMatch(/^gbp_post_/);
      expect(res.url).toContain("https://business.google.com/posts/l/");
      expect(res.callToAction.actionType).toBe("ORDER");
    });

    it("collects simulated GBP metrics (local views, search actions/calls, clicks)", async () => {
      const metrics = await adapter.getMetrics({
        externalPostId: "gbp_post_123",
      });
      expect(metrics.reach).toBeGreaterThan(0); // local search views
      expect(metrics.clicks).toBeGreaterThan(0); // website/direction clicks
      expect(metrics.shares).toBeGreaterThanOrEqual(0); // call actions
    });
  });
});
