const {
  PLATFORM_SPECS,
  extractKeywords,
  buildLocalChannelVariant,
  adaptIdeaToChannels,
} = require("../src/services/contentAdaptation.service");

describe("Content Adaptation Service (#05)", () => {
  const sampleIdea =
    "We analyzed 10,000 marketing campaigns and found that posting consistent platform-native formats increased audience engagement by 3.4x.";

  beforeEach(() => {
    jest.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ error: "AI service mock fallback" }),
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Platform Specifications", () => {
    it("defines valid platform specs with maxChars and guidelines for core channels", () => {
      expect(PLATFORM_SPECS.twitter).toBeDefined();
      expect(PLATFORM_SPECS.twitter.maxChars).toBe(280);
      expect(PLATFORM_SPECS.twitter.maxHashtags).toBe(2);

      expect(PLATFORM_SPECS.linkedin).toBeDefined();
      expect(PLATFORM_SPECS.linkedin.maxChars).toBe(3000);

      expect(PLATFORM_SPECS.instagram).toBeDefined();
      expect(PLATFORM_SPECS.instagram.maxChars).toBe(2200);

      expect(PLATFORM_SPECS.facebook).toBeDefined();
      expect(PLATFORM_SPECS.facebook.maxChars).toBe(5000);
    });
  });

  describe("extractKeywords", () => {
    it("extracts clean hashtags from input text", () => {
      const tags = extractKeywords(sampleIdea, 4);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.length).toBeLessThanOrEqual(4);
      tags.forEach((tag) => expect(tag.startsWith("#")).toBe(true));
    });

    it("returns empty array on empty string without injecting buzzwords", () => {
      const tags = extractKeywords("", 2);
      expect(tags).toEqual([]);
    });
  });

  describe("buildLocalChannelVariant", () => {
    it("builds a Twitter variant adhering to the 280 character limit and template label", () => {
      const variant = buildLocalChannelVariant({
        channel: "twitter",
        idea: sampleIdea,
        tone: "authoritative",
      });

      expect(variant.channel).toBe("twitter");
      expect(variant.charCount).toBeLessThanOrEqual(280);
      expect(variant.content.body.length).toBeLessThanOrEqual(280);
      expect(variant.content.title).toContain("Tweet:");
      expect(variant.provider).toBe("template");
      expect(variant.model).toBe("template-fallback");
    });

    it("builds a LinkedIn variant with professional thought-leadership formatting", () => {
      const variant = buildLocalChannelVariant({
        channel: "linkedin",
        idea: sampleIdea,
        tone: "professional",
      });

      expect(variant.channel).toBe("linkedin");
      expect(variant.content.body).toContain(sampleIdea.slice(0, 30));
      expect(variant.content.body).toContain("Looking forward to hearing your insights");
      expect(variant.provider).toBe("template");
    });

    it("builds an Instagram variant with call-to-action", () => {
      const variant = buildLocalChannelVariant({
        channel: "instagram",
        idea: sampleIdea,
        tone: "inspirational",
      });

      expect(variant.channel).toBe("instagram");
      expect(variant.content.body).toContain(sampleIdea.slice(0, 30));
      expect(variant.content.body).toContain("Save this for later");
      expect(variant.provider).toBe("template");
    });

    it("builds a Facebook variant focused on community and discussion", () => {
      const variant = buildLocalChannelVariant({
        channel: "facebook",
        idea: sampleIdea,
        tone: "casual",
      });

      expect(variant.channel).toBe("facebook");
      expect(variant.content.body).toContain(sampleIdea.slice(0, 30));
      expect(variant.content.body).toContain("Join the conversation below");
      expect(variant.provider).toBe("template");
    });
  });

  describe("adaptIdeaToChannels", () => {
    it("adapts a single idea into all requested channel variants simultaneously", async () => {
      const result = await adaptIdeaToChannels({
        idea: sampleIdea,
        channels: ["twitter", "linkedin", "instagram", "facebook"],
        tone: "inspirational",
      });

      expect(result.idea).toBe(sampleIdea);
      expect(result.tone).toBe("inspirational");
      expect(result.variants.length).toBe(4);

      const channels = result.variants.map((v) => v.channel);
      expect(channels).toEqual(["twitter", "linkedin", "instagram", "facebook"]);

      const twitterVariant = result.variants.find((v) => v.channel === "twitter");
      expect(twitterVariant.charCount).toBeLessThanOrEqual(280);

      const linkedinVariant = result.variants.find((v) => v.channel === "linkedin");
      expect(linkedinVariant.content.body).toContain(sampleIdea.slice(0, 30));
    });

    it("repurposes a source post into platform-native variants", async () => {
      const sourcePost = {
        id: "post_origin_123",
        channel: "twitter",
        content: {
          title: "Initial Launch Tweet",
          body: "We just launched our new automated reporting engine!",
          mediaUrls: ["https://example.com/screenshot.png"],
        },
      };

      const result = await adaptIdeaToChannels({
        idea: sourcePost.content.body,
        channels: ["linkedin", "facebook"],
        sourcePost,
        tone: "professional",
      });

      expect(result.sourcePostId).toBe("post_origin_123");
      expect(result.variants.length).toBe(2);
      expect(result.variants[0].content.mediaUrls).toEqual(["https://example.com/screenshot.png"]);
    });
  });
});
