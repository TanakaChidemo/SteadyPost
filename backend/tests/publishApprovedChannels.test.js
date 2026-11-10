const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const postModel = require("../src/models/post.model");
const contentDraftModel = require("../src/models/contentDraft.model");

const { closeQueues } = require("../src/queue");

jest.setTimeout(30000);

describe("Omnichannel Approved Post Publishing & Handoff Tests (#10 & F27)", () => {
  let user, workspace, token;
  let fbAccount, igAccount, twAccount, gbpAccount;

  beforeAll(async () => {
    await setupTestDB();

    user = await userModel.create({
      email: `multi_pub_${Date.now()}@example.com`,
      name: "Omnichannel User",
    });
    workspace = await workspaceModel.create({
      name: "Omnichannel Venture",
      ownerId: user.id,
    });
    await userModel.setActiveWorkspace(user.id, workspace.id);
    await membershipModel.create({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    token = createToken({ ...user, activeWorkspaceId: workspace.id });

    // Connected channels for workspace
    fbAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "facebook",
      externalAccountId: "fb_page_100",
      displayName: "Brand Facebook Page",
    });

    igAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "instagram",
      externalAccountId: "ig_user_200",
      displayName: "@brand_official",
    });

    twAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "twitter",
      externalAccountId: "tw_user_300",
      displayName: "@brand_updates",
    });

    gbpAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "gbp",
      externalAccountId: "accounts/111/locations/222",
      displayName: "Brand Downtown Storefront",
    });
  });

  afterAll(async () => {
    await closeQueues();
    if (workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
      await membershipModel.deleteOne({ workspaceId: workspace.id });
      await postModel.deleteOne({ workspaceId: workspace.id });
      await socialAccountModel.deleteOne({ workspaceId: workspace.id });
    }
    await teardownTestDB();
  });

  describe("Publishing Approved Posts Across 2 or 3 Connected Channels", () => {
    it("publishes 3 approved posts to Facebook, Instagram, and Twitter immediately", async () => {
      // Create 3 posts in approved status
      const postFb = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "facebook",
        socialAccountId: fbAccount.id,
        content: { title: "Omnichannel Launch FB", body: "We are live on Facebook!" },
        status: "approved",
      });

      const postIg = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "instagram",
        socialAccountId: igAccount.id,
        content: { title: "Omnichannel Launch IG", body: "Check our new product!" },
        status: "approved",
      });

      const postTw = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "twitter",
        socialAccountId: twAccount.id,
        content: { title: "Omnichannel Launch TW", body: "Big news today! #launch" },
        status: "approved",
      });

      const res = await request(app)
        .post("/api/v1/posts/publish-approved")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          postIds: [postFb.id, postIg.id, postTw.id],
        });

      expect(res.status).toBe(202);
      expect(res.body.queuedCount).toBe(3);
      expect(res.body.items.length).toBe(3);

      const queuedChannels = res.body.items.map((i) => i.channel);
      expect(queuedChannels).toContain("facebook");
      expect(queuedChannels).toContain("instagram");
      expect(queuedChannels).toContain("twitter");

      for (const item of res.body.items) {
        expect(item.status).toBe("publishing");
      }
    });

    it("queues approved posts with scheduledAt times via job queue with delays", async () => {
      const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      const scheduledPost1 = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "facebook",
        socialAccountId: fbAccount.id,
        content: { title: "Scheduled Post 1", body: "Scheduled for later" },
        status: "approved",
        scheduledAt: futureTime,
      });

      const scheduledPost2 = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "gbp",
        socialAccountId: gbpAccount.id,
        content: { title: "Scheduled GBP Local Post (#13)", body: "Weekend special offer!" },
        status: "approved",
        scheduledAt: futureTime,
      });

      const res = await request(app)
        .post("/api/v1/posts/publish-approved")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          postIds: [scheduledPost1.id, scheduledPost2.id],
        });

      expect(res.status).toBe(202);
      expect(res.body.queuedCount).toBe(2);

      for (const item of res.body.items) {
        expect(item.status).toBe("scheduled");
        expect(item.delay).toBeGreaterThan(0);
      }
    });

    it("automatically enqueues scheduled job when post is approved with a scheduledAt date", async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000);

      const pendingPost = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "twitter",
        socialAccountId: twAccount.id,
        content: { title: "Pending Tweet", body: "Scheduled tweet text" },
        status: "pending_approval",
        scheduledAt: futureDate,
      });

      const approveRes = await request(app)
        .post(`/api/v1/posts/${pendingPost.id}/approve`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ comment: "Approved for scheduled time" });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe("scheduled");
    });

    it("publishes or schedules a single draft to 3 connected channels simultaneously via /publish/now", async () => {
      const draft = await contentDraftModel.create({
        workspaceId: workspace.id,
        ownerId: user.id,
        title: "3-Channel Release",
        body: "Live across Facebook, Instagram, and Google Business Profile!",
        platforms: ["facebook", "instagram", "gbp"],
      });

      const futureIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const res = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          contentDraftId: draft._id,
          socialAccountIds: [fbAccount.id, igAccount.id, gbpAccount.id],
          scheduledAt: futureIso,
          options: {
            topicType: "OFFER",
            callToAction: { actionType: "ORDER", url: "https://example.com/order" },
          },
        });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe("scheduled");
      expect(res.body.delay).toBeGreaterThan(0);
      expect(res.body.items).toHaveLength(3);

      const pairs = res.body.items.map((item) => ({
        platform: item.platform,
        socialAccountId: item.socialAccountId,
        status: item.status,
      }));
      expect(pairs).toEqual(
        expect.arrayContaining([
          { platform: "facebook", socialAccountId: fbAccount.id, status: "scheduled" },
          { platform: "instagram", socialAccountId: igAccount.id, status: "scheduled" },
          { platform: "gbp", socialAccountId: gbpAccount.id, status: "scheduled" },
        ])
      );

      // Polling status endpoint works for workspace owner and returns scheduledAt
      const statusRes = await request(app)
        .get(`/api/v1/publish/status/${res.body.items[0].postId}`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe("scheduled");
      expect(statusRes.body.scheduledAt).toBeTruthy();
    });

    it("allows workspace owner to publish a workspace draft authored by an editor and isolates foreign workspaces", async () => {
      const editorUser = await userModel.create({
        email: `editor_pub_${Date.now()}@example.com`,
        name: "Workspace Editor",
      });
      await membershipModel.create({
        workspaceId: workspace.id,
        userId: editorUser.id,
        role: "editor",
        status: "active",
        joinedAt: new Date(),
      });
      const editorToken = createToken({ ...editorUser, activeWorkspaceId: workspace.id });

      const outsiderUser = await userModel.create({
        email: `outsider_pub_${Date.now()}@example.com`,
        name: "Outsider Owner",
      });
      const outsiderWs = await workspaceModel.create({
        name: "Outsider Venture",
        ownerId: outsiderUser.id,
      });
      await membershipModel.create({
        workspaceId: outsiderWs.id,
        userId: outsiderUser.id,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      });
      const outsiderToken = createToken({ ...outsiderUser, activeWorkspaceId: outsiderWs.id });

      const createDraftRes = await request(app)
        .post("/api/v1/content")
        .set("Authorization", `Bearer ${editorToken}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Editor Draft",
          body: "Written by editor, published by workspace owner.",
          platforms: ["facebook"],
        });
      expect(createDraftRes.status).toBe(201);
      expect(createDraftRes.body.workspaceId).toBe(workspace.id);

      // Editor cannot publish directly (owner-only RBAC preserved)
      const editorPubRes = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${editorToken}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ contentDraftId: createDraftRes.body._id, socialAccountIds: [fbAccount.id] });
      expect(editorPubRes.status).toBe(403);

      // Cross-tenant outsider cannot publish this draft
      const outsiderPubRes = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${outsiderToken}`)
        .set("X-Workspace-Id", outsiderWs.id)
        .send({ contentDraftId: createDraftRes.body._id });
      expect(outsiderPubRes.status).toBe(404);

      // Workspace owner CAN publish the editor's draft to the workspace account
      const ownerPubRes = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ contentDraftId: createDraftRes.body._id, socialAccountIds: [fbAccount.id] });
      expect(ownerPubRes.status).toBe(202);
      expect(ownerPubRes.body.socialAccountId).toBe(fbAccount.id);

      await workspaceModel.deleteOne({ _id: outsiderWs.id });
      await membershipModel.deleteOne({ workspaceId: outsiderWs.id });
    });

    it("supports scheduledAt and account ownership validation on POST /posts/:id/publish-now", async () => {
      const draftPost = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "gbp",
        content: { title: "Single Post Schedule", body: "Scheduled Local Post" },
        status: "approved",
      });

      const futureIso = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const res = await request(app)
        .post(`/api/v1/posts/${draftPost.id}/publish-now`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          scheduledAt: futureIso,
          socialAccountId: gbpAccount.id,
          options: { topicType: "EVENT" },
        });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe("scheduled");
      expect(res.body.delay).toBeGreaterThan(0);

      const persisted = await postModel.findById(draftPost.id);
      expect(persisted.status).toBe("scheduled");
      expect(persisted.socialAccountId).toBe(gbpAccount.id);
    });
  });

  describe("Connect Step Setup Walkthrough Handoff (#08, F27)", () => {
    it("returns setup_walkthrough handoff payload when no Meta pages are found", async () => {
      // Mock global fetch to return empty /me/accounts and /me/businesses
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes("/me/accounts") || url.includes("/me/businesses")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [] }),
          });
        }
        return originalFetch(url);
      });

      try {
        const res = await request(app)
          .post("/api/v1/auth/oauth/meta/pages")
          .set("Authorization", `Bearer ${token}`)
          .send({ accessToken: "test_user_token_with_no_pages" });

        expect(res.status).toBe(200);
        expect(res.body.pages).toEqual([]);
        expect(res.body.handoff).toBe("setup_walkthrough");
        expect(res.body.walkthrough).toBeDefined();
        expect(res.body.walkthrough.feature).toBe("F27");
        expect(res.body.walkthrough.specNumber).toBe("#08");
        expect(res.body.walkthrough.checklist.length).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

