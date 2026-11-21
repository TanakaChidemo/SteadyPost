const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const postModel = require("../src/models/post.model");
const smartLinkModel = require("../src/models/smartLink.model");
const contentDraftModel = require("../src/models/contentDraft.model");
const GbpAdapter = require("../src/services/publishers/GbpAdapter");
const { closeQueues } = require("../src/queue");

jest.setTimeout(30000);

describe("GBP Local Posts Platform Adapter & Publishing Pipeline (#13)", () => {
  let user, workspace, token;
  let verifiedGbpAccount, unverifiedGbpAccount, pendingGbpAccount;
  const adapter = new GbpAdapter();

  beforeAll(async () => {
    await setupTestDB();

    user = await userModel.create({
      email: `gbp_user_${Date.now()}@example.com`,
      name: "GBP Test Owner",
    });
    workspace = await workspaceModel.create({
      name: "Rosies Bakery Downtown",
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

    // Verified GBP Account
    verifiedGbpAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "gbp",
      externalAccountId: "accounts/112233/locations/445566",
      displayName: "Rosies Bakery - Downtown Store",
      isVerified: true,
      verificationState: "VERIFIED",
    });

    // Unverified GBP Account
    unverifiedGbpAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "gbp",
      externalAccountId: "accounts/112233/locations/998877",
      displayName: "Rosies Bakery - Midtown (Unverified)",
      isVerified: false,
      verificationState: "UNVERIFIED",
    });

    // Pending Verification GBP Account (takes several business days)
    pendingGbpAccount = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: user.id,
      platform: "gbp",
      externalAccountId: "accounts/112233/locations/555444",
      displayName: "Rosies Bakery - Annex (Pending)",
      verificationState: "PENDING_VERIFICATION",
    });
    expect(pendingGbpAccount.isVerified).toBe(false);
  });

  afterAll(async () => {
    await closeQueues();
    await teardownTestDB();
  });

  describe("1. GbpAdapter Payload Construction (4 Post Types & 6 CTA Actions)", () => {
    it("builds STANDARD post with CTA button (BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP)", async () => {
      const ctaActions = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP"];

      for (const action of ctaActions) {
        const payload = await adapter.buildLocalPostPayload({
          content: `Test standard update for ${action}`,
          options: {
            topicType: "STANDARD",
            callToAction: {
              actionType: action,
              url: `https://rosiesbakery.co.uk/${action.toLowerCase()}`,
            },
          },
        });

        expect(payload.topicType).toBe("STANDARD");
        expect(payload.callToAction).toBeDefined();
        expect(payload.callToAction.actionType).toBe(action);
        expect(payload.callToAction.url).toBe(`https://rosiesbakery.co.uk/${action.toLowerCase()}`);
      }
    });

    it("builds CALL CTA button without requiring target URL", async () => {
      const payload = await adapter.buildLocalPostPayload({
        content: "Call us today to reserve a cake!",
        options: {
          topicType: "STANDARD",
          callToAction: {
            actionType: "CALL",
          },
        },
      });

      expect(payload.topicType).toBe("STANDARD");
      expect(payload.callToAction.actionType).toBe("CALL");
      expect(payload.callToAction.url).toBeUndefined();
    });

    it("builds EVENT post with title and start/end schedule", async () => {
      const payload = await adapter.buildLocalPostPayload({
        content: "Join our sourdough baking workshop this Saturday!",
        options: {
          topicType: "EVENT",
          event: {
            title: "Sourdough Masterclass",
            schedule: {
              startDate: { year: 2026, month: 11, day: 20 },
              startTime: { hours: 14, minutes: 0 },
              endDate: { year: 2026, month: 11, day: 20 },
              endTime: { hours: 17, minutes: 0 },
            },
          },
          callToAction: { actionType: "BOOK", url: "https://rosiesbakery.co.uk/classes" },
        },
      });

      expect(payload.topicType).toBe("EVENT");
      expect(payload.event).toBeDefined();
      expect(payload.event.title).toBe("Sourdough Masterclass");
      expect(payload.event.schedule.startDate).toEqual({ year: 2026, month: 11, day: 20 });
      expect(payload.callToAction.actionType).toBe("BOOK");
    });

    it("builds OFFER post with coupon code, terms, and redeem url", async () => {
      const payload = await adapter.buildLocalPostPayload({
        content: "Enjoy 20% off all artisanal loaves this weekend!",
        options: {
          topicType: "OFFER",
          offer: {
            couponCode: "BREAD20",
            redeemOnlineUrl: "https://rosiesbakery.co.uk/checkout",
            termsConditions: "Valid Saturday and Sunday only. Limit one per customer.",
          },
          callToAction: { actionType: "ORDER", url: "https://rosiesbakery.co.uk/order" },
        },
      });

      expect(payload.topicType).toBe("OFFER");
      expect(payload.offer).toBeDefined();
      expect(payload.offer.couponCode).toBe("BREAD20");
      expect(payload.offer.redeemOnlineUrl).toBe("https://rosiesbakery.co.uk/checkout");
      expect(payload.offer.termsConditions).toContain("Valid Saturday and Sunday");
    });

    it("builds ALERT post with alertType (COVID-19 / safety advisory)", async () => {
      const payload = await adapter.buildLocalPostPayload({
        content: "Store hours adjusted: curbside pickup now available.",
        options: {
          topicType: "ALERT",
          alertType: "COVID_19",
        },
      });

      expect(payload.topicType).toBe("ALERT");
      expect(payload.alertType).toBe("COVID_19");
    });
  });

  describe("2. Unverified Listing Guardrail & Setup Walkthrough Handoff (#08, F27)", () => {
    it("refuses to publish directly via GbpAdapter when account is unverified", async () => {
      await expect(
        adapter.publish({
          postId: "post_unverified_test",
          content: "Test post on unverified listing",
          account: {
            id: unverifiedGbpAccount.id,
            platform: "gbp",
            isVerified: false,
            verificationState: "UNVERIFIED",
          },
        })
      ).rejects.toThrow(/Google Business Profile listing is unverified/);
    });

    it("refuses to publish directly via GbpAdapter when account is PENDING_VERIFICATION", async () => {
      await expect(
        adapter.publish({
          postId: "post_pending_test",
          content: "Test post on pending listing",
          account: {
            id: pendingGbpAccount.id,
            platform: "gbp",
            isVerified: false,
            verificationState: "PENDING_VERIFICATION",
          },
        })
      ).rejects.toThrow(/Google Business Profile listing is unverified/);
    });

    it("allows creating a draft for an unverified or pending GBP account without blocking", async () => {
      const res = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Unverified Listing Test Draft",
          body: "Trying to draft to unverified location",
          channel: "gbp",
          socialAccountId: unverifiedGbpAccount.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("draft");

      const pendingRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Pending Listing Test Draft",
          body: "Trying to draft to pending location",
          channel: "gbp",
          socialAccountId: pendingGbpAccount.id,
        });

      expect(pendingRes.status).toBe(201);
      expect(pendingRes.body.status).toBe("draft");
    });

    it("returns 400 with walkthrough handoff when publishing now to an unverified GBP account", async () => {
      // First create a post without assigning unverified account
      const post = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "gbp",
        content: { title: "Draft Post", body: "Draft content" },
        status: "approved",
      });

      const res = await request(app)
        .post(`/api/v1/posts/${post.id}/publish-now`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          socialAccountId: unverifiedGbpAccount.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("GBP_LISTING_UNVERIFIED");
      expect(res.body.handoff).toBe("setup_walkthrough");
      expect(res.body.walkthroughStep).toBe(5);
    });

    it("returns 400 with walkthrough handoff when publishing now to a PENDING_VERIFICATION GBP account", async () => {
      const post = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "gbp",
        content: { title: "Draft Post", body: "Draft content" },
        status: "approved",
      });

      const res = await request(app)
        .post(`/api/v1/posts/${post.id}/publish-now`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          socialAccountId: pendingGbpAccount.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("GBP_LISTING_UNVERIFIED");
      expect(res.body.handoff).toBe("setup_walkthrough");
      expect(res.body.walkthroughStep).toBe(5);
    });

    it("returns 400 with walkthrough handoff when /publish/now targets an unverified GBP account", async () => {
      const draft = await contentDraftModel.create({
        ownerId: user.id,
        workspaceId: workspace.id,
        title: "Draft for GBP",
        body: "Testing unverified draft publish",
        platforms: ["gbp"],
      });

      const res = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          contentDraftId: draft._id || draft.id,
          socialAccountId: unverifiedGbpAccount.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("GBP_LISTING_UNVERIFIED");
      expect(res.body.handoff).toBe("setup_walkthrough");
      expect(res.body.walkthroughStep).toBe(5);
    });

    it("returns 400 with walkthrough handoff when /publish/now targets a pending GBP account", async () => {
      const draft = await contentDraftModel.create({
        ownerId: user.id,
        workspaceId: workspace.id,
        title: "Draft for Pending GBP",
        body: "Testing pending draft publish",
        platforms: ["gbp"],
      });

      const res = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          contentDraftId: draft._id || draft.id,
          socialAccountId: pendingGbpAccount.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("GBP_LISTING_UNVERIFIED");
      expect(res.body.handoff).toBe("setup_walkthrough");
      expect(res.body.walkthroughStep).toBe(5);
    });
  });

  describe("3. Access Risk & Posting Mode Architecture (Aggregator vs Direct vs Simulator)", () => {
    it("publishes successfully in Sandbox Simulator mode with verified account", async () => {
      const res = await adapter.publish({
        postId: "post_sim_1",
        content: "Hot pastries out of the oven! Order online today.",
        mediaUrls: ["https://example.com/pastry.jpg"],
        account: {
          id: verifiedGbpAccount.id,
          isVerified: true,
          verificationState: "VERIFIED",
          isMock: true,
        },
        options: {
          topicType: "STANDARD",
          callToAction: { actionType: "ORDER", url: "https://rosiesbakery.co.uk/order" },
        },
      });

      expect(res.platform).toBe("gbp");
      expect(res.provider).toBe("simulator");
      expect(res.simulated).toBe(true);
      expect(res.externalId).toMatch(/^gbp_post_/);
      expect(res.url).toContain("https://business.google.com/posts/l/");
      expect(res.callToAction.actionType).toBe("ORDER");
    });

    it("supports aggregator posting mode when GBP_POSTING_MODE=aggregator and API key is set", async () => {
      const originalMode = process.env.GBP_POSTING_MODE;
      const originalKey = process.env.GBP_AGGREGATOR_API_KEY;
      const originalFetch = global.fetch;

      process.env.GBP_POSTING_MODE = "aggregator";
      process.env.GBP_AGGREGATOR_API_KEY = "agg_api_key_secure_123";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "bundle_post_9999",
          url: "https://business.google.com/posts/l/bundle_post_9999",
          status: "published",
        }),
      });

      try {
        const res = await adapter.publish({
          postId: "post_agg_1",
          content: "Aggregator published post",
          account: {
            id: verifiedGbpAccount.id,
            isVerified: true,
            verificationState: "VERIFIED",
            accessToken: "should_not_leak_to_aggregator",
          },
          options: {
            topicType: "STANDARD",
            callToAction: { actionType: "LEARN_MORE", url: "https://example.com" },
          },
        });

        expect(res.platform).toBe("gbp");
        expect(res.provider).toBe("aggregator");
        expect(res.externalId).toBe("bundle_post_9999");
        expect(global.fetch).toHaveBeenCalled();
        const fetchHeaders = global.fetch.mock.calls[0][1].headers;
        expect(fetchHeaders.Authorization).toBe("Bearer agg_api_key_secure_123");
      } finally {
        process.env.GBP_POSTING_MODE = originalMode;
        process.env.GBP_AGGREGATOR_API_KEY = originalKey;
        global.fetch = originalFetch;
      }
    });

    it("fails with clear error when in aggregator mode but GBP_AGGREGATOR_API_KEY is not set", async () => {
      const originalMode = process.env.GBP_POSTING_MODE;
      const originalKey = process.env.GBP_AGGREGATOR_API_KEY;

      process.env.GBP_POSTING_MODE = "aggregator";
      delete process.env.GBP_AGGREGATOR_API_KEY;

      try {
        await expect(
          adapter.publish({
            postId: "post_agg_fail",
            content: "Aggregator without key",
            account: {
              id: verifiedGbpAccount.id,
              isVerified: true,
              verificationState: "VERIFIED",
              accessToken: "google_oauth_secret_token",
            },
            options: { topicType: "STANDARD" },
          })
        ).rejects.toThrow(/GBP aggregator posting is enabled, but GBP_AGGREGATOR_API_KEY is not configured/);
      } finally {
        process.env.GBP_POSTING_MODE = originalMode;
        if (originalKey) process.env.GBP_AGGREGATOR_API_KEY = originalKey;
      }
    });

    it("supports direct Google My Business API mode when GBP_POSTING_MODE=direct", async () => {
      const originalMode = process.env.GBP_POSTING_MODE;
      const originalFetch = global.fetch;

      process.env.GBP_POSTING_MODE = "direct";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "accounts/112233/locations/445566/localPosts/local_post_8888",
          searchUrl: "https://business.google.com/posts/l/local_post_8888",
          state: "LIVE",
        }),
      });

      try {
        const res = await adapter.publish({
          postId: "post_direct_1",
          content: "Direct Google My Business API post",
          account: {
            id: verifiedGbpAccount.id,
            isVerified: true,
            accessToken: "google_oauth_token",
            externalAccountId: "accounts/112233/locations/445566",
          },
          options: {
            topicType: "STANDARD",
          },
        });

        expect(res.platform).toBe("gbp");
        expect(res.provider).toBe("google_direct");
        expect(res.externalId).toBe("accounts/112233/locations/445566/localPosts/local_post_8888");
        expect(res.url).toBe("https://business.google.com/posts/l/local_post_8888");
      } finally {
        process.env.GBP_POSTING_MODE = originalMode;
        global.fetch = originalFetch;
      }
    });
  });

  describe("4. No Per-Post Insights & Smart-Link Tracking Integration (#12)", () => {
    it("collects metrics driven by smart-link clicks (#12) and notes Google deprecation", async () => {
      const post = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "gbp",
        content: { title: "Tracked GBP Post", body: "Check our smart link" },
        status: "published",
        externalPostId: "gbp_post_tracked_1",
      });

      // Create associated smart links for this post (#12)
      await smartLinkModel.create({
        workspaceId: workspace.id,
        postId: post.id,
        shortSlug: `sl_${Date.now()}_1`,
        destinationUrl: "https://rosiesbakery.co.uk/special",
        clickCount: 27,
      });

      await smartLinkModel.create({
        workspaceId: workspace.id,
        postId: post.id,
        shortSlug: `sl_${Date.now()}_2`,
        destinationUrl: "https://rosiesbakery.co.uk/menu",
        clickCount: 15,
      });

      const metrics = await adapter.getMetrics({
        externalPostId: "gbp_post_tracked_1",
        postId: post.id,
        account: { isMock: false, accessToken: "live_token" },
      });

      expect(metrics.clicks).toBe(42); // 27 + 15 smart-link clicks
      expect(metrics.note).toContain("Google deprecated per-post insights");
    });
  });

  describe("5. End-to-End GBP Local Post Publishing via API", () => {
    it("successfully creates and queues a GBP post with full options", async () => {
      const createRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Sourdough Saturday Offer",
          body: "20% off all artisan loaves this Saturday!",
          channel: "gbp",
          socialAccountId: verifiedGbpAccount.id,
          gbpOptions: {
            topicType: "OFFER",
            callToAction: {
              actionType: "ORDER",
              url: "https://rosiesbakery.co.uk/order",
            },
            offer: {
              couponCode: "SOURDOUGH20",
              termsConditions: "Valid this Saturday only",
            },
          },
        });

      expect(createRes.status).toBe(201);
      const post = createRes.body;
      const gbp = post.aiMetadata?.gbpOptions || post.gbpOptions;
      expect(gbp).toBeDefined();
      expect(gbp.topicType).toBe("OFFER");
      expect(gbp.offer.couponCode).toBe("SOURDOUGH20");

      // Now publish immediately
      const pubRes = await request(app)
        .post(`/api/v1/posts/${post.id}/publish-now`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id);

      expect(pubRes.status).toBe(202);
      expect(pubRes.body.status).toBe("publishing");

      // Allow background publish job to settle
      await new Promise((r) => setTimeout(r, 200));
    });

    it("saves an EVENT post with dates through /posts, updates it, and verifies adapter payload preserves dates", async () => {
      const createRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Winter Baking Masterclass",
          body: "Join us Dec 5-6 for our holiday pastry workshop!",
          channel: "gbp",
          socialAccountId: verifiedGbpAccount.id,
          gbpOptions: {
            topicType: "EVENT",
            callToAction: {
              actionType: "BOOK",
              url: "https://rosiesbakery.co.uk/tickets",
            },
            event: {
              title: "Winter Baking Masterclass",
              startDate: { year: 2026, month: 12, day: 5 },
              endDate: { year: 2026, month: 12, day: 6 },
            },
          },
        });

      expect(createRes.status).toBe(201);
      const createdPost = createRes.body;
      const initialGbp = createdPost.aiMetadata?.gbpOptions;
      expect(initialGbp).toBeDefined();
      expect(initialGbp.topicType).toBe("EVENT");
      expect(initialGbp.event.startDate).toEqual({ year: 2026, month: 12, day: 5 });
      expect(initialGbp.event.endDate).toEqual({ year: 2026, month: 12, day: 6 });

      // Update post through /posts/:id
      const updateRes = await request(app)
        .put(`/api/v1/posts/${createdPost.id}`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          body: "Updated: Join us Dec 5-6 for our holiday pastry workshop! 2 spots left.",
          gbpOptions: {
            topicType: "EVENT",
            callToAction: {
              actionType: "BOOK",
              url: "https://rosiesbakery.co.uk/tickets-vip",
            },
            event: {
              title: "Winter Baking Masterclass (VIP)",
              startDate: { year: 2026, month: 12, day: 5 },
              endDate: { year: 2026, month: 12, day: 6 },
            },
          },
        });

      expect(updateRes.status).toBe(200);
      const updatedPost = updateRes.body;
      const updatedGbp = updatedPost.aiMetadata?.gbpOptions;
      expect(updatedGbp.event.title).toBe("Winter Baking Masterclass (VIP)");
      expect(updatedGbp.callToAction.url).toBe("https://rosiesbakery.co.uk/tickets-vip");

      // Verify GbpAdapter buildLocalPostPayload using the stored options
      const payload = await adapter.buildLocalPostPayload({
        content: updatedPost.content.body,
        options: updatedGbp,
      });

      expect(payload.topicType).toBe("EVENT");
      expect(payload.event).toBeDefined();
      expect(payload.event.schedule.startDate).toEqual({ year: 2026, month: 12, day: 5 });
      expect(payload.event.schedule.endDate).toEqual({ year: 2026, month: 12, day: 6 });
      expect(payload.callToAction.actionType).toBe("BOOK");
      expect(payload.callToAction.url).toBe("https://rosiesbakery.co.uk/tickets-vip");
      // Must not inject empty offer or alertType
      expect(payload.offer).toBeUndefined();
      expect(payload.alertType).toBeUndefined();
    });

    it("ensures standard GBP and Instagram posts do not receive unintended offer or alert defaults", async () => {
      // 1. Instagram post through /posts
      const igRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Instagram Photo Post",
          body: "Croissants freshly glazed! #bakery",
          channel: "instagram",
        });

      expect(igRes.status).toBe(201);
      expect(igRes.body.gbpOptions).toBeUndefined();
      expect(igRes.body.aiMetadata?.gbpOptions).toBeUndefined();

      // 2. STANDARD GBP post through /posts
      const stdRes = await request(app)
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({
          title: "Standard Update",
          body: "Fresh batch of sourdough just arrived.",
          channel: "gbp",
          socialAccountId: verifiedGbpAccount.id,
          gbpOptions: {
            topicType: "STANDARD",
            callToAction: { actionType: "LEARN_MORE", url: "https://rosiesbakery.co.uk" },
          },
        });

      expect(stdRes.status).toBe(201);
      const stdPayload = await adapter.buildLocalPostPayload({
        content: stdRes.body.content.body,
        options: stdRes.body.aiMetadata?.gbpOptions,
      });

      expect(stdPayload.topicType).toBe("STANDARD");
      expect(stdPayload.event).toBeUndefined();
      expect(stdPayload.offer).toBeUndefined();
      expect(stdPayload.alertType).toBeUndefined();
    });
  });
});
