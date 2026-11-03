const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const businessProfileModel = require("../src/models/businessProfile.model");
const postModel = require("../src/models/post.model");
const { checkBannedClaims } = require("../src/services/guardrails/bannedClaimsChecker");
const { checkDisclosures } = require("../src/services/guardrails/disclosuresChecker");
const { checkTone } = require("../src/services/guardrails/toneMatcher");
const { checkImageGuardrails } = require("../src/services/guardrails/imageGuardrails");
const guardrailsService = require("../src/services/guardrails/guardrailsService");

describe("F09 Brand Voice and Guardrails Suite", () => {
  let wsA, wsB, ownerA, editorA, ownerB;
  const userIds = [];
  const workspaceIds = [];

  const auth = (who) => ({ Authorization: `Bearer ${who.token}` });

  beforeAll(async () => {
    await setupTestDB();

    // Setup Workspace A
    const uA = await userModel.create({ email: `guardrail_a_${Date.now()}@test.com`, name: "Owner A" });
    userIds.push(uA.id);
    wsA = await workspaceModel.create({ name: "Alpha Marketing", ownerId: uA.id });
    workspaceIds.push(wsA.id);
    await userModel.setActiveWorkspace(uA.id, wsA.id);
    await membershipModel.create({ workspaceId: wsA.id, userId: uA.id, role: "owner", status: "active" });
    ownerA = { user: uA, token: createToken({ ...uA, activeWorkspaceId: wsA.id }) };

    // Editor in Workspace A
    const edA = await userModel.create({ email: `guardrail_ed_${Date.now()}@test.com`, name: "Editor A" });
    userIds.push(edA.id);
    await userModel.setActiveWorkspace(edA.id, wsA.id);
    await membershipModel.create({ workspaceId: wsA.id, userId: edA.id, role: "editor", status: "active" });
    editorA = { user: edA, token: createToken({ ...edA, activeWorkspaceId: wsA.id }) };

    await businessProfileModel.create({
      workspaceId: wsA.id,
      businessType: "B2B SaaS Consulting",
      tone: ["professional", "authoritative"],
      guardrails: {
        bannedClaims: ["cheapest in the market", "miracle growth guarantee"],
        bannedKeywords: ["CompetitorX"],
        requiredDisclosures: ["#partner", "Past performance does not guarantee future results"],
        toneStrictness: "strict",
      },
      onboardingCompletedAt: new Date(),
    });

    // Setup Workspace B (Isolation testing)
    const uB = await userModel.create({ email: `guardrail_b_${Date.now()}@test.com`, name: "Owner B" });
    userIds.push(uB.id);
    wsB = await workspaceModel.create({ name: "Beta Bakery", ownerId: uB.id });
    workspaceIds.push(wsB.id);
    await userModel.setActiveWorkspace(uB.id, wsB.id);
    await membershipModel.create({ workspaceId: wsB.id, userId: uB.id, role: "owner", status: "active" });
    ownerB = { user: uB, token: createToken({ ...uB, activeWorkspaceId: wsB.id }) };

    await businessProfileModel.create({
      workspaceId: wsB.id,
      businessType: "Artisan Bakery",
      tone: ["playful", "casual"],
      guardrails: {
        bannedClaims: ["zero calories"],
        bannedKeywords: ["StoreY"],
        requiredDisclosures: ["Contains gluten"],
      },
      onboardingCompletedAt: new Date(),
    });
  });

  afterAll(async () => {
    await postModel.Post.deleteMany({ workspaceId: { $in: workspaceIds } });
    await businessProfileModel.BusinessProfile.deleteMany({ workspaceId: { $in: workspaceIds } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: workspaceIds } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: workspaceIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  describe("1. Banned Claims & Disallowed Keywords", () => {
    it("flags baseline prohibited medical and financial claims", () => {
      const res = checkBannedClaims({ text: "Our herbal tea provides a miracle cure for diabetes!" });
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.type === "baseline_policy")).toBe(true);

      const resFin = checkBannedClaims({ text: "Join our program for guaranteed 100% return in 30 days!" });
      expect(resFin.passed).toBe(false);
      expect(resFin.violations.some((v) => v.type === "baseline_policy")).toBe(true);
    });

    it("flags workspace-configured banned claims", () => {
      const res = checkBannedClaims({
        text: "We are proudly the cheapest in the market today.",
        workspaceBannedClaims: ["cheapest in the market"],
      });
      expect(res.passed).toBe(false);
      expect(res.violations[0].type).toBe("banned_claim");
      expect(res.violations[0].phrase).toBe("cheapest in the market");
    });

    it("flags workspace-configured restricted competitor keywords", () => {
      const res = checkBannedClaims({
        text: "Why choose CompetitorX when you can use our solution?",
        workspaceBannedKeywords: ["CompetitorX"],
      });
      expect(res.passed).toBe(false);
      expect(res.violations[0].type).toBe("banned_keyword");
    });
  });

  describe("2. Required Disclosures Check", () => {
    it("detects sponsored/affiliate content without disclosure and flags it", () => {
      const text = "Excited to share this link: amzn.to/3xyz with 20% commission earned!";
      const res = checkDisclosures({ text });
      expect(res.passed).toBe(false);
      expect(res.missing.length).toBeGreaterThan(0);
      expect(res.missing[0].disclosure).toContain("#ad");
    });

    it("passes when #ad is included for commercial content", () => {
      const text = "Excited to share this link: amzn.to/3xyz with discount! #ad";
      const res = checkDisclosures({ text });
      expect(res.passed).toBe(true);
    });

    it("enforces workspace-level mandatory disclosures", () => {
      const text = "Our consulting framework increases B2B pipeline growth.";
      const res = checkDisclosures({
        text,
        workspaceRequiredDisclosures: ["Past performance does not guarantee future results"],
      });
      expect(res.passed).toBe(false);
      expect(res.missing.some((m) => m.disclosure.includes("Past performance"))).toBe(true);

      const textWithDisc = `${text} Past performance does not guarantee future results.`;
      const resWithDisc = checkDisclosures({
        text: textWithDisc,
        workspaceRequiredDisclosures: ["Past performance does not guarantee future results"],
      });
      expect(resWithDisc.passed).toBe(true);
    });
  });

  describe("3. Tone Matching & Brand Alignment", () => {
    it("flags hostile or aggressive language regardless of target tone", async () => {
      const res = await checkTone({ content: "Shut up you idiots and buy this product!", targetTones: ["professional"] });
      expect(res.passed).toBe(false);
      expect(res.score).toBeLessThan(0.5);
      expect(res.critique).toBeTruthy();
    });

    it("evaluates professional/authoritative tone positively for structured business copy", async () => {
      const res = await checkTone({
        content: "Our data-driven analysis and quarterly performance framework optimize organizational efficiency.",
        targetTones: ["professional", "authoritative"],
      });
      expect(res.passed).toBe(true);
      expect(res.score).toBeGreaterThanOrEqual(0.70);
    });
  });

  describe("4. Image Guardrails (#09 prerequisite)", () => {
    it("rejects adult/explicit and graphic violence visual prompts", () => {
      const resExplicit = checkImageGuardrails({ prompt: "A nude model posing in front of sunset" });
      expect(resExplicit.passed).toBe(false);
      expect(resExplicit.violations.some((v) => v.type === "restricted_image_content")).toBe(true);

      const resGore = checkImageGuardrails({ prompt: "Bloody violence and decapitated bodies in battle" });
      expect(resGore.passed).toBe(false);
    });

    it("normalizes non-standard aspect ratios with warning", () => {
      const res = checkImageGuardrails({ prompt: "Modern tech office", aspectRatio: "99:1" });
      expect(res.passed).toBe(true);
      expect(res.aspectRatio).toBe("1:1");
      expect(res.warnings.length).toBeGreaterThan(0);
    });

    it("flags workspace banned keywords in image prompt", () => {
      const res = checkImageGuardrails({
        prompt: "A comparison between our product and CompetitorX logo",
        workspaceBannedKeywords: ["CompetitorX"],
      });
      expect(res.passed).toBe(false);
      expect(res.violations.some((v) => v.type === "workspace_brand_violation")).toBe(true);
    });
  });

  describe("5. Human-in-the-Loop & Mandatory Approval Principle", () => {
    it("always returns approvalMandatory: true in audit result", async () => {
      const audit = await guardrailsService.auditDraft({
        content: "A completely compliant post for business growth.",
        channel: "linkedin",
        workspaceId: wsA.id,
      });
      expect(audit.approvalMandatory).toBe(true);
    });

    it("attaches guardrail audit report to aiMetadata on post create and maintains approval workflow", async () => {
      const postPayload = {
        title: "Q4 Strategy Overview",
        body: "We optimize B2B sales workflows. Past performance does not guarantee future results. #partner",
        channel: "linkedin",
      };

      const res = await request(app)
        .post("/api/v1/posts")
        .set(auth(editorA))
        .send(postPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("draft");
      expect(res.body.aiMetadata?.guardrails).toBeDefined();
      expect(res.body.aiMetadata.guardrails.approvalMandatory).toBe(true);

      const postId = res.body.id;

      // Editor submits approval
      const subRes = await request(app)
        .post(`/api/v1/posts/${postId}/submit-approval`)
        .set(auth(editorA));
      expect(subRes.status).toBe(200);
      expect(subRes.body.status).toBe("pending_approval");

      // Editor CANNOT approve (approval stays strictly with Owner)
      const nonOwnerApprove = await request(app)
        .post(`/api/v1/posts/${postId}/approve`)
        .set(auth(editorA));
      expect(nonOwnerApprove.status).toBe(403);

      // Owner approves
      const ownerApprove = await request(app)
        .post(`/api/v1/posts/${postId}/approve`)
        .set(auth(ownerA));
      expect(ownerApprove.status).toBe(200);
      expect(ownerApprove.body.status).toBe("approved");
    });
  });

  describe("6. Workspace Isolation", () => {
    it("ensures Workspace A banned claims do NOT restrict Workspace B", async () => {
      // "cheapest in the market" is banned in Workspace A, but NOT in Workspace B
      const checkA = await request(app)
        .post("/api/v1/guardrails/check-draft")
        .set(auth(ownerA))
        .send({
          content: "We are the cheapest in the market for our clients.",
          channel: "linkedin",
        });
      expect(checkA.status).toBe(200);
      expect(checkA.body.bannedClaims.passed).toBe(false);

      const checkB = await request(app)
        .post("/api/v1/guardrails/check-draft")
        .set(auth(ownerB))
        .send({
          content: "We are the cheapest in the market for delicious bread.",
          channel: "linkedin",
        });
      expect(checkB.status).toBe(200);
      expect(checkB.body.bannedClaims.passed).toBe(true);
    });
  });

  describe("7. Guardrails API Endpoints", () => {
    it("POST /api/v1/guardrails/check-draft returns complete audit report", async () => {
      const res = await request(app)
        .post("/api/v1/guardrails/check-draft")
        .set(auth(ownerA))
        .send({
          content: "Short post",
          channel: "twitter",
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("score");
      expect(res.body).toHaveProperty("bannedClaims");
      expect(res.body).toHaveProperty("disclosures");
      expect(res.body).toHaveProperty("tone");
      expect(res.body).toHaveProperty("approvalMandatory", true);
    });

    it("POST /api/v1/guardrails/check-trend screens sensitive topics", async () => {
      const res = await request(app)
        .post("/api/v1/guardrails/check-trend")
        .set(auth(ownerA))
        .send({
          topic: "Deadly earthquake kills hundreds",
          snippet: "Rescue efforts underway",
        });
      expect(res.status).toBe(200);
      expect(res.body.isSensitive).toBe(true);
      expect(res.body.passed).toBe(false);
    });

    it("POST /api/v1/guardrails/check-image screens visual prompts", async () => {
      const res = await request(app)
        .post("/api/v1/guardrails/check-image")
        .set(auth(ownerA))
        .send({
          prompt: "Professional modern office interior",
          aspectRatio: "1:1",
        });
      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
      expect(res.body.safePrompt).toBe("Professional modern office interior");
    });
  });
});
