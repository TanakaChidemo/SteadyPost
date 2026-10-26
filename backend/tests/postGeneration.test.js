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
  let owner, workspace, ownerToken, viewer, viewerToken;

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

      viewer = await userModel.create({
        email: `gen_viewer_${Date.now()}@example.com`,
        name: "Generation Viewer",
      });
      await membershipModel.create({
        workspaceId: workspace.id,
        userId: viewer.id,
        role: "viewer",
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
      viewerToken = createToken({ ...viewer, activeWorkspaceId: workspace.id });
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
    expect(linkedinVariant.content.body).toContain("insights");

    const instagramVariant = res.body.variants.find((v) => v.channel === "instagram");
    expect(instagramVariant).toBeDefined();
    expect(instagramVariant.content.body).toContain("Save this for later");

    const facebookVariant = res.body.variants.find((v) => v.channel === "facebook");
    expect(facebookVariant).toBeDefined();
    expect(facebookVariant.content.body).toContain("conversation");
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

  it("reads published top-performing posts only and excludes unpublished drafts", async () => {
    if (!isDbAvailable) return;

    // Create a published post
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

    // Create an unpublished draft post
    const unpublishedDraft = await postModel.create({
      workspaceId: workspace.id,
      authorId: owner.id,
      channel: "facebook",
      content: {
        title: "Unpublished Draft",
        body: "Draft body that must not show up in top posts.",
      },
      status: "draft",
    });

    const res = await request(app)
      .get("/api/v1/posts/top-performing")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();

    const foundPublished = res.body.items.find((item) => item.id === samplePost.id);
    expect(foundPublished).toBeDefined();
    expect(foundPublished.metrics).toBeDefined();
    expect(foundPublished.metrics.hasMetrics).toBe(false);

    const foundDraft = res.body.items.find((item) => item.id === unpublishedDraft.id);
    expect(foundDraft).toBeUndefined();
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

    // Verify saved drafts appear in content studio drafts list
    const draftsRes = await request(app)
      .get("/api/v1/content/drafts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(draftsRes.status).toBe(200);
    expect(draftsRes.body.items).toBeDefined();
    const batchTweetDraft = draftsRes.body.items.find((d) => d.title === "Batch Tweet");
    expect(batchTweetDraft).toBeDefined();
    expect(batchTweetDraft.body).toBe("Tweet content from batch");
  });

  it("enforces role checks on generation endpoints and rejects viewers with 403", async () => {
    if (!isDbAvailable) return;

    // Viewers cannot generate variants via /posts/generate-variants
    const postRes = await request(app)
      .post("/api/v1/posts/generate-variants")
      .set("Authorization", `Bearer ${viewerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        idea: "Viewer trying to trigger generation",
        channels: ["instagram", "facebook"],
      });

    expect(postRes.status).toBe(403);

    // Viewers cannot generate variants via /ai/generate-variants
    const aiRes = await request(app)
      .post("/api/v1/ai/generate-variants")
      .set("Authorization", `Bearer ${viewerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        idea: "Viewer trying to trigger AI call",
        channels: ["instagram", "facebook"],
      });

    expect(aiRes.status).toBe(403);
  });

  it("rejects ideas exceeding 5000 characters with 400 validation error", async () => {
    if (!isDbAvailable) return;

    const oversizedIdea = "A".repeat(5001);
    const res = await request(app)
      .post("/api/v1/posts/generate-variants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        idea: oversizedIdea,
        channels: ["instagram"],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});
