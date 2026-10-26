const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");
const postMetricsModel = require("../src/models/postMetrics.model");
const businessProfileModel = require("../src/models/businessProfile.model");

jest.setTimeout(30000);

describe("Omnichannel Post Generation & Repurposing (#05)", () => {
  let isDbAvailable = false;
  let owner, workspace, ownerToken;

  beforeAll(async () => {
    try {
      await setupTestDB();
      isDbAvailable = true;

      owner = await userModel.create({
        email: `gen_owner_${Date.now()}@example.com`,
        name: "Generation Owner",
      });
      workspace = await workspaceModel.create({
        name: "Omnichannel Growth Venture",
        ownerId: owner.id,
      });
      await userModel.setActiveWorkspace(owner.id, workspace.id);
      await membershipModel.create({
        workspaceId: workspace.id,
        userId: owner.id,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      });
      await businessProfileModel.upsert(workspace.id, {
        businessType: "Marketing SaaS",
        offer: "AI Social Media Publisher",
        audience: "Growth Marketers and Agencies",
        tone: ["authoritative", "inspirational"],
      });

      ownerToken = createToken({ ...owner, activeWorkspaceId: workspace.id });
    } catch (err) {
      // MongoDB not running locally (e.g. non-docker Windows dev environment)
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
      await membershipModel.deleteOne({ workspaceId: workspace.id });
      await postModel.deleteOne({ workspaceId: workspace.id });
      await businessProfileModel.BusinessProfile.deleteOne({ workspaceId: workspace.id });
    }
    if (isDbAvailable) {
      await teardownTestDB();
    }
  });

  it("generates platform-native variants across Twitter, LinkedIn, Instagram, and Facebook", async () => {
    if (!isDbAvailable) {
      return; // Runs in CI with Mongo
    }

    const res = await request(app)
      .post("/api/v1/posts/generate-variants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        idea: "Launching automated omnichannel publishing across 4 networks simultaneously.",
        channels: ["twitter", "linkedin", "instagram", "facebook"],
        tone: "authoritative",
      });

    expect(res.status).toBe(200);
    expect(res.body.idea).toBeDefined();
    expect(res.body.variants).toBeDefined();
    expect(res.body.variants.length).toBe(4);

    const twitterVariant = res.body.variants.find((v) => v.channel === "twitter");
    expect(twitterVariant).toBeDefined();
    expect(twitterVariant.charCount).toBeLessThanOrEqual(280);
    expect(twitterVariant.content.hashtags.length).toBeLessThanOrEqual(2);

    const linkedinVariant = res.body.variants.find((v) => v.channel === "linkedin");
    expect(linkedinVariant).toBeDefined();
    expect(linkedinVariant.content.body).toContain("Insight:");

    const instagramVariant = res.body.variants.find((v) => v.channel === "instagram");
    expect(instagramVariant).toBeDefined();
    expect(instagramVariant.content.body).toContain("✨");

    const facebookVariant = res.body.variants.find((v) => v.channel === "facebook");
    expect(facebookVariant).toBeDefined();
    expect(facebookVariant.content.body).toContain("community");
  });

  it("can generate variants and automatically persist them as draft posts", async () => {
    if (!isDbAvailable) return;

    const res = await request(app)
      .post("/api/v1/posts/generate-variants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        idea: "Special feature drop: Omnichannel auto-adapt is now live for all teams.",
        channels: ["twitter", "instagram"],
        tone: "inspirational",
        saveAsDrafts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.savedDrafts).toBeDefined();
    expect(res.body.savedDrafts.length).toBe(2);

    const drafts = res.body.savedDrafts;
    expect(drafts[0].status).toBe("draft");
    expect(drafts[0].workspaceId).toBe(workspace.id);
    expect(drafts[0].aiMetadata.idea).toContain("Special feature drop");
  });

  it("reads top-performing posts even with zero metrics (read path for #19)", async () => {
    if (!isDbAvailable) return;

    // Create a sample post
    const samplePost = await postModel.create({
      workspaceId: workspace.id,
      authorId: owner.id,
      channel: "twitter",
      content: {
        title: "Top post teaser",
        body: "Sample post body without metrics yet.",
      },
      status: "published",
      publishedAt: new Date(),
    });

    const res = await request(app)
      .get("/api/v1/posts/top-performing")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const found = res.body.items.find((item) => item.id === samplePost.id);
    expect(found).toBeDefined();
    expect(found.metrics).toBeDefined();
    expect(found.metrics.reach).toBe(0);
    expect(found.metrics.engagementScore).toBe(0);
    expect(found.metrics.hasMetrics).toBe(false);
  });

  it("ranks top posts by engagement score when PostMetrics are recorded", async () => {
    if (!isDbAvailable) return;

    const post1 = await postModel.create({
      workspaceId: workspace.id,
      authorId: owner.id,
      channel: "twitter",
      content: { title: "Low Engagement", body: "Post 1" },
      status: "published",
    });

    const post2 = await postModel.create({
      workspaceId: workspace.id,
      authorId: owner.id,
      channel: "linkedin",
      content: { title: "High Engagement", body: "Post 2" },
      status: "published",
    });

    await postMetricsModel.create({
      postId: post1.id,
      likes: 5,
      comments: 1,
      shares: 0,
      clicks: 2,
      reach: 100,
    });

    await postMetricsModel.create({
      postId: post2.id,
      likes: 120,
      comments: 45,
      shares: 30,
      clicks: 80,
      reach: 2500,
    });

    const res = await request(app)
      .get("/api/v1/posts/top-performing")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(res.status).toBe(200);
    expect(res.body.hasMetrics).toBe(true);
    expect(res.body.items[0].id).toBe(post2.id);
    expect(res.body.items[0].metrics.likes).toBe(120);
    expect(res.body.items[0].metrics.engagementScore).toBeGreaterThan(res.body.items[1].metrics.engagementScore);
  });

  it("repurposes an existing top post into target platform variants via /:id/repurpose", async () => {
    if (!isDbAvailable) return;

    const originalPost = await postModel.create({
      workspaceId: workspace.id,
      authorId: owner.id,
      channel: "twitter",
      content: {
        title: "Original Viral Tweet",
        body: "Consistency beats talent. Show up every day and build systems.",
        hashtags: ["#Building", "#Mindset"],
      },
      status: "published",
    });

    const res = await request(app)
      .post(`/api/v1/posts/${originalPost.id}/repurpose`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        targetChannels: ["linkedin", "facebook"],
        tone: "inspirational",
        saveAsDrafts: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.sourcePost).toBeDefined();
    expect(res.body.sourcePost.id).toBe(originalPost.id);
    expect(res.body.variants.length).toBe(2);
    expect(res.body.savedDrafts.length).toBe(2);

    const savedLinkedin = res.body.savedDrafts.find((d) => d.channel === "linkedin");
    expect(savedLinkedin).toBeDefined();
    expect(savedLinkedin.aiMetadata.repurposed).toBe(true);
    expect(savedLinkedin.aiMetadata.sourcePostId).toBe(originalPost.id);
  });

  it("supports batch creation of draft posts via /batch-create", async () => {
    if (!isDbAvailable) return;

    const res = await request(app)
      .post("/api/v1/posts/batch-create")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        posts: [
          {
            title: "Batch Tweet",
            body: "Tweet content from batch",
            channel: "twitter",
            hashtags: ["#Batch"],
          },
          {
            title: "Batch LinkedIn",
            body: "LinkedIn content from batch",
            channel: "linkedin",
            hashtags: ["#Leadership"],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items[0].status).toBe("draft");
    expect(res.body.items[1].channel).toBe("linkedin");
  });
});
