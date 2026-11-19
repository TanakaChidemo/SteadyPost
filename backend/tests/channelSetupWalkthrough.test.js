const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const channelSetupProgressModel = require("../src/models/channelSetupProgress.model");
const walkthroughData = require("../src/data/channelWalkthroughs.json");

jest.setTimeout(60000);

describe("F27 (#08): Platform Page & Account Setup Walkthrough", () => {
  let ownerUser;
  let editorUser;
  let outsiderUser;
  let workspaceA;
  let workspaceB;
  let ownerToken;
  let editorToken;
  let outsiderToken;

  beforeAll(async () => {
    await setupTestDB();

    ownerUser = await userModel.create({
      email: `f27_owner_${Date.now()}@example.com`,
      name: "F27 Owner",
    });
    editorUser = await userModel.create({
      email: `f27_editor_${Date.now()}@example.com`,
      name: "F27 Editor",
    });
    outsiderUser = await userModel.create({
      email: `f27_outsider_${Date.now()}@example.com`,
      name: "F27 Outsider",
    });

    workspaceA = await workspaceModel.create({
      name: "Rosie's Bakery",
      ownerId: ownerUser.id,
    });
    workspaceB = await workspaceModel.create({
      name: "Other Venture",
      ownerId: outsiderUser.id,
    });

    await membershipModel.create({
      workspaceId: workspaceA.id,
      userId: ownerUser.id,
      role: "owner",
      status: "active",
    });
    await membershipModel.create({
      workspaceId: workspaceA.id,
      userId: editorUser.id,
      role: "editor",
      status: "active",
    });
    await membershipModel.create({
      workspaceId: workspaceB.id,
      userId: outsiderUser.id,
      role: "owner",
      status: "active",
    });

    await userModel.setActiveWorkspace(ownerUser.id, workspaceA.id);
    await userModel.setActiveWorkspace(editorUser.id, workspaceA.id);
    await userModel.setActiveWorkspace(outsiderUser.id, workspaceB.id);

    ownerToken = createToken({ ...ownerUser, activeWorkspaceId: workspaceA.id });
    editorToken = createToken({ ...editorUser, activeWorkspaceId: workspaceA.id });
    outsiderToken = createToken({ ...outsiderUser, activeWorkspaceId: workspaceB.id });
  });

  beforeEach(async () => {
    await channelSetupProgressModel.deleteByWorkspace(workspaceA.id);
    await channelSetupProgressModel.deleteByWorkspace(workspaceB.id);
    await socialAccountModel.SocialAccount.deleteMany({
      workspaceId: { $in: [workspaceA.id, workspaceB.id] },
    });
  });

  afterAll(async () => {
    const db = mongoose.connection;
    await channelSetupProgressModel.deleteByWorkspace(workspaceA.id);
    await channelSetupProgressModel.deleteByWorkspace(workspaceB.id);
    await socialAccountModel.SocialAccount.deleteMany({
      workspaceId: { $in: [workspaceA.id, workspaceB.id] },
    });
    await membershipModel.Membership.deleteMany({
      workspaceId: { $in: [workspaceA.id, workspaceB.id] },
    });
    await workspaceModel.Workspace.deleteMany({
      _id: { $in: [workspaceA.id, workspaceB.id] },
    });
    await db.collection("users").deleteMany({
      _id: { $in: [ownerUser.id, editorUser.id, outsiderUser.id] },
    });
    await teardownTestDB();
  });

  describe("1. Walkthrough Content Stored as Data", () => {
    it("serves data-driven guides with 3-7 steps, lastChecked dates, official links, and delegation notes", async () => {
      const res = await request(app)
        .get("/api/v1/channel-setup/guides")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("X-Workspace-Id", workspaceA.id);

      expect(res.status).toBe(200);
      expect(res.body.platforms).toBeDefined();

      for (const key of ["facebook", "instagram", "gbp", "linkedin", "twitter"]) {
        const guide = res.body.platforms[key];
        expect(guide).toBeDefined();
        expect(guide.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(guide.whyNeeded).toBeTruthy();
        expect(guide.delegation).toBeDefined();
        expect(guide.delegation.summary).toBeTruthy();
        expect(guide.delegation.howToDelegate).toBeTruthy();
        expect(guide.steps.length).toBeGreaterThanOrEqual(3);
        expect(guide.steps.length).toBeLessThanOrEqual(7);

        for (const step of guide.steps) {
          expect(step.title).toBeTruthy();
          expect(Array.isArray(step.instructions)).toBe(true);
          expect(step.instructions.length).toBeGreaterThan(0);
          expect(step.linkUrl).toMatch(/^https:\/\//);
        }
      }

      // Check required spec references on Instagram and GBP
      const igUrls = walkthroughData.platforms.instagram.references.map((r) => r.url);
      expect(igUrls).toContain("https://developers.facebook.com/documentation/instagram-platform/overview");
      expect(igUrls).toContain("https://developers.facebook.com/docs/instagram-platform/content-publishing");
      expect(walkthroughData.platforms.instagram.openDecisionNote).toMatch(/Instagram Login/i);

      const gbpUrls = walkthroughData.platforms.gbp.references.map((r) => r.url);
      expect(gbpUrls).toContain(
        "https://www.brightlocal.com/learn/google-business-profile/getting-started/verifying-google-business-profile/"
      );
    });
  });

  describe("2. Blocker Detection (Mocked Platform Responses)", () => {
    it("detects 'no_facebook_page' when Meta returns zero Pages and saves step 1 progress", async () => {
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
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({ accessToken: "mock_personal_fb_token" });

        expect(res.status).toBe(200);
        expect(res.body.pages).toEqual([]);
        expect(res.body.handoff).toBe("setup_walkthrough");
        expect(res.body.blockerReason).toBe("no_facebook_page");
        expect(res.body.walkthrough.platform).toBe("facebook");
        expect(res.body.walkthrough.stepNumber).toBe(1);

        const saved = await channelSetupProgressModel.findByWorkspaceAndPlatform(
          workspaceA.id,
          "facebook"
        );
        expect(saved).toBeTruthy();
        expect(saved.status).toBe("in_progress");
        expect(saved.blockerReason).toBe("no_facebook_page");
        expect(saved.currentStep).toBe(1);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("detects 'missing_page_permissions' when Meta Page lookup returns no access_token", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "page_no_token", name: "Restricted Bakery Page" }),
      });

      try {
        const res = await request(app)
          .post("/api/v1/auth/oauth/meta/connect")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({ accessToken: "mock_token", pageId: "page_no_token" });

        expect(res.status).toBe(422);
        expect(res.body.handoff).toBe("setup_walkthrough");
        expect(res.body.blockerReason).toBe("missing_page_permissions");
        expect(res.body.walkthrough.stepNumber).toBe(3);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("detects 'non_professional_ig' when Page has a personal connected_instagram_account but no instagram_business_account", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "page_personal_ig",
          name: "Rosie's Bakery Page",
          access_token: "page_live_token_123",
          connected_instagram_account: { id: "ig_personal_1", username: "rosie_personal" },
        }),
      });

      try {
        const res = await request(app)
          .post("/api/v1/auth/oauth/meta/connect")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({
            accessToken: "mock_token",
            pageId: "page_personal_ig",
            targetPlatform: "instagram",
          });

        expect(res.status).toBe(200);
        expect(res.body.connected).toEqual(["facebook"]);
        expect(res.body.instagramBlocker).toBe("non_professional_ig");
        expect(res.body.handoff).toBe("setup_walkthrough");
        expect(res.body.walkthrough.platform).toBe("instagram");
        expect(res.body.walkthrough.stepNumber).toBe(1);

        const igProgress = await channelSetupProgressModel.findByWorkspaceAndPlatform(
          workspaceA.id,
          "instagram"
        );
        expect(igProgress.status).toBe("in_progress");
        expect(igProgress.blockerReason).toBe("non_professional_ig");
        expect(igProgress.currentStep).toBe(1);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("detects 'unlinked_ig' when Facebook Page has no linked Instagram account at all", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "page_unlinked_ig",
          name: "Rosie's Bakery Page",
          access_token: "page_live_token_456",
        }),
      });

      try {
        const res = await request(app)
          .post("/api/v1/auth/oauth/meta/connect")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({
            accessToken: "mock_token",
            pageId: "page_unlinked_ig",
            targetPlatform: "instagram",
          });

        expect(res.status).toBe(200);
        expect(res.body.connected).toEqual(["facebook"]);
        expect(res.body.instagramBlocker).toBe("unlinked_ig");
        expect(res.body.walkthrough.platform).toBe("instagram");
        expect(res.body.walkthrough.stepNumber).toBe(2);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("detects 'no_gbp_listing' and 'unverified_gbp' via POST /channel-setup/check/gbp", async () => {
      const noListingRes = await request(app)
        .post("/api/v1/channel-setup/check/gbp")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("X-Workspace-Id", workspaceA.id)
        .send({ gbpLocations: [] });

      expect(noListingRes.status).toBe(200);
      expect(noListingRes.body.connected).toBe(false);
      expect(noListingRes.body.progress.blockerReason).toBe("no_gbp_listing");
      expect(noListingRes.body.walkthrough.stepNumber).toBe(1);

      const unverifiedRes = await request(app)
        .post("/api/v1/channel-setup/check/gbp")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("X-Workspace-Id", workspaceA.id)
        .send({ gbpLocations: [{ id: "loc_1", title: "Rosie's Bakery", verified: false }] });

      expect(unverifiedRes.status).toBe(200);
      expect(unverifiedRes.body.connected).toBe(false);
      expect(unverifiedRes.body.progress.blockerReason).toBe("unverified_gbp");
      expect(unverifiedRes.body.walkthrough.stepNumber).toBe(3);
    });
  });

  describe("3. Step Persistence, Waiting on Google State, and Full Tester Session", () => {
    it("persists step progress and 'waiting_on_platform' state so leaving and returning resumes at the saved step", async () => {
      // Owner reaches step 3 of GBP walkthrough and marks waiting on Google video review
      const saveRes = await request(app)
        .put("/api/v1/channel-setup/progress/gbp")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("X-Workspace-Id", workspaceA.id)
        .send({
          currentStep: 3,
          completedSteps: [1, 2],
          status: "waiting_on_platform",
          blockerReason: "unverified_gbp",
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.progress.currentStep).toBe(3);
      expect(saveRes.body.progress.status).toBe("waiting_on_platform");
      expect(saveRes.body.progress.completedSteps).toEqual([1, 2]);

      // Owner leaves and returns later — GET /progress restores exact step and status
      const loadRes = await request(app)
        .get("/api/v1/channel-setup/progress")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("X-Workspace-Id", workspaceA.id);

      expect(loadRes.status).toBe(200);
      const gbp = loadRes.body.items.find((i) => i.platform === "gbp");
      expect(gbp.currentStep).toBe(3);
      expect(gbp.status).toBe("waiting_on_platform");
      expect(gbp.blockerReason).toBe("unverified_gbp");
    });

    it("completes a full single-session journey from personal FB + personal IG to connected & publishable", async () => {
      const originalFetch = global.fetch;
      let stage = "personal_only";

      global.fetch = jest.fn().mockImplementation((url) => {
        if (stage === "personal_only") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [] }),
          });
        }
        if (stage === "page_created_ig_linked") {
          if (url.includes("/me/accounts")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: [{ id: "page_rosie", name: "Rosie's Bakery" }] }),
            });
          }
          if (url.includes("/me/businesses")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: [] }),
            });
          }
          if (url.includes("/page_rosie")) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({
                id: "page_rosie",
                name: "Rosie's Bakery",
                access_token: "rosie_page_token",
                instagram_business_account: { id: "ig_rosie_biz", username: "rosiesbakery" },
              }),
            });
          }
        }
        return originalFetch(url);
      });

      try {
        // 1. Attempt connect with only personal FB profile -> gets walkthrough at Step 1
        const attempt1 = await request(app)
          .post("/api/v1/auth/oauth/meta/pages")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({ accessToken: "user_token_1" });
        expect(attempt1.body.handoff).toBe("setup_walkthrough");
        expect(attempt1.body.blockerReason).toBe("no_facebook_page");

        // 2. Owner steps through walkthrough and creates Page + switches/links IG
        await request(app)
          .put("/api/v1/channel-setup/progress/facebook")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({ currentStep: 4, completedSteps: [1, 2, 3] });

        stage = "page_created_ig_linked";

        // 3. Re-check pages and connect Page -> both FB and IG become connected & done
        const pagesRes = await request(app)
          .post("/api/v1/auth/oauth/meta/pages")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({ accessToken: "user_token_2" });
        expect(pagesRes.body.pages).toHaveLength(1);

        const connectRes = await request(app)
          .post("/api/v1/auth/oauth/meta/connect")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id)
          .send({ accessToken: "user_token_2", pageId: "page_rosie" });
        expect(connectRes.status).toBe(200);
        expect(connectRes.body.connected).toEqual(["facebook", "instagram"]);

        const finalProgress = await request(app)
          .get("/api/v1/channel-setup/progress")
          .set("Authorization", `Bearer ${ownerToken}`)
          .set("X-Workspace-Id", workspaceA.id);

        const fb = finalProgress.body.items.find((i) => i.platform === "facebook");
        const ig = finalProgress.body.items.find((i) => i.platform === "instagram");
        expect(fb.status).toBe("done");
        expect(fb.blockerReason).toBeNull();
        expect(fb.isConnected).toBe(true);
        expect(ig.status).toBe("done");
        expect(ig.blockerReason).toBeNull();
        expect(ig.isConnected).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("4. Workspace Isolation & Role Delegation", () => {
    it("prevents another workspace from reading or modifying ChannelSetupProgress", async () => {
      await request(app)
        .put("/api/v1/channel-setup/progress/facebook")
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("X-Workspace-Id", workspaceA.id)
        .send({ currentStep: 3, status: "in_progress" });

      // Outsider attempting to read Workspace A via X-Workspace-Id gets 403
      const crossRead = await request(app)
        .get("/api/v1/channel-setup/progress")
        .set("Authorization", `Bearer ${outsiderToken}`)
        .set("X-Workspace-Id", workspaceA.id);
      expect(crossRead.status).toBe(403);

      // Outsider reading their own Workspace B sees untouched progress
      const ownRead = await request(app)
        .get("/api/v1/channel-setup/progress")
        .set("Authorization", `Bearer ${outsiderToken}`)
        .set("X-Workspace-Id", workspaceB.id);
      expect(ownRead.status).toBe(200);
      const fbB = ownRead.body.items.find((i) => i.platform === "facebook");
      expect(fbB.status).toBe("not_started");
      expect(fbB.currentStep).toBe(1);
    });

    it("allows Editors to view walkthrough guides and progress (with viewerRole='editor') while restricting mutations to Owner", async () => {
      const editorProgressRes = await request(app)
        .get("/api/v1/channel-setup/progress")
        .set("Authorization", `Bearer ${editorToken}`)
        .set("X-Workspace-Id", workspaceA.id);

      expect(editorProgressRes.status).toBe(200);
      expect(editorProgressRes.body.viewerRole).toBe("editor");

      const editorMutateRes = await request(app)
        .put("/api/v1/channel-setup/progress/facebook")
        .set("Authorization", `Bearer ${editorToken}`)
        .set("X-Workspace-Id", workspaceA.id)
        .send({ currentStep: 2 });

      expect(editorMutateRes.status).toBe(403);
      expect(editorMutateRes.body.code).toBe("FORBIDDEN");
    });
  });
});
