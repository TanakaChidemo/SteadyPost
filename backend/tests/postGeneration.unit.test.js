const contentAdaptationService = require("../src/services/contentAdaptation.service");

describe("Post Generation & Adaptation Unit Tests (#05)", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ error: "Mock AI unavailable" }),
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("adapts idea with specific tone across multiple platforms", async () => {
    const idea = "SteadyPost simplifies social publishing for modern businesses.";
    const result = await contentAdaptationService.adaptIdeaToChannels({
      idea,
      channels: ["twitter", "linkedin", "instagram", "facebook"],
      tone: "professional",
      businessProfile: {
        businessType: "Software",
        audience: "Marketers",
      },
    });

    expect(result.variants.length).toBe(4);

    const twitter = result.variants.find((v) => v.channel === "twitter");
    expect(twitter.charCount).toBeLessThanOrEqual(280);
    expect(twitter.content.body).toContain("SteadyPost simplifies");

    const linkedin = result.variants.find((v) => v.channel === "linkedin");
    expect(linkedin.content.body).toContain("SteadyPost simplifies");
    expect(linkedin.provider).toBe("template");

    const instagram = result.variants.find((v) => v.channel === "instagram");
    expect(instagram.content.body).toContain("SteadyPost simplifies");

    const facebook = result.variants.find((v) => v.channel === "facebook");
    expect(facebook.content.body).toContain("SteadyPost simplifies");
  });

  it("filters out invalid channels and removes duplicates", async () => {
    const result = await contentAdaptationService.adaptIdeaToChannels({
      idea: "Test idea",
      channels: ["tiktok", "myspace", "facebook", "facebook", "instagram"],
      tone: "casual",
    });

    // Only allowed channels are retained and deduplicated
    expect(result.variants.length).toBe(2);
    const channels = result.variants.map((v) => v.channel);
    expect(channels).toEqual(["facebook", "instagram"]);
  });

  it("rejects when only unknown channels are given", async () => {
    await expect(
      contentAdaptationService.adaptIdeaToChannels({
        idea: "Test idea",
        channels: ["unknown_channel"],
        tone: "casual",
      })
    ).rejects.toThrow("None of the requested channels are supported");
  });

  it("preserves media URLs and links when repurposing a post", async () => {
    const sourcePost = {
      id: "post_source_999",
      channel: "instagram",
      content: {
        title: "Original Post",
        body: "Here is our announcement with media attached.",
        mediaUrls: ["https://cdn.example.com/image1.jpg", "https://cdn.example.com/image2.jpg"],
        hashtags: ["#ProductLaunch"],
      },
    };

    const result = await contentAdaptationService.adaptIdeaToChannels({
      idea: sourcePost.content.body,
      channels: ["twitter", "linkedin"],
      sourcePost,
      tone: "professional",
    });

    expect(result.sourcePostId).toBe("post_source_999");
    expect(result.variants.length).toBe(2);
    result.variants.forEach((v) => {
      expect(v.content.mediaUrls).toEqual(sourcePost.content.mediaUrls);
    });
  });
});
