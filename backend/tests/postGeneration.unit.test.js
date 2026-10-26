const contentAdaptationService = require("../src/services/contentAdaptation.service");

describe("Post Generation & Adaptation Unit Tests (#05)", () => {
  it("adapts idea with specific tone across multiple platforms", async () => {
    const idea = "SteadyPost simplifies social publishing for modern businesses.";
    const result = await contentAdaptationService.adaptIdeaToChannels({
      idea,
      channels: ["twitter", "linkedin", "instagram", "facebook"],
      tone: "authoritative",
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
    expect(linkedin.content.body).toContain("Marketers");
    expect(linkedin.content.hashtags).toContain("#Leadership");

    const instagram = result.variants.find((v) => v.channel === "instagram");
    expect(instagram.content.body).toContain("✨");

    const facebook = result.variants.find((v) => v.channel === "facebook");
    expect(facebook.content.body).toContain("Software");
  });

  it("handles empty / custom channel gracefully", async () => {
    const result = await contentAdaptationService.adaptIdeaToChannels({
      idea: "Test idea",
      channels: ["custom_channel"],
      tone: "casual",
    });

    expect(result.variants.length).toBe(1);
    expect(result.variants[0].channel).toBe("custom_channel");
    expect(result.variants[0].content.body).toContain("Test idea");
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
