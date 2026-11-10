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

    it("matches banned phrases starting or ending with symbols (#1 rated, 50% off!, $0 down)", () => {
      const res = checkBannedClaims({
        text: "We are #1 rated in the city! Get 50% off! Sign up with $0 down today.",
        workspaceBannedClaims: ["#1 rated", "50% off!", "$0 down"],
      });
      expect(res.passed).toBe(false);
      expect(res.violations.map((v) => v.phrase)).toEqual(["#1 rated", "50% off!", "$0 down"]);
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

    it("does not satisfy a required 'Ad' disclosure via substrings inside 'read', 'already', or 'Adobe'", () => {
      const falsePositiveText = "If you read this already, our Adobe workflow is ready.";
      const resFalse = checkDisclosures({
        text: falsePositiveText,
        workspaceRequiredDisclosures: ["Ad"],
      });
      expect(resFalse.passed).toBe(false);
      expect(resFalse.missing.some((m) => m.disclosure === "Ad")).toBe(true);

      const validText = "Ad: Check out our new workflow.";
      const resValid = checkDisclosures({
        text: validText,
        workspaceRequiredDisclosures: ["Ad"],
      });
      expect(resValid.passed).toBe(true);
    });
  });

  describe("3. Tone Matching & Brand Alignment", () => {
    it("flags hostile or aggressive language regardless of target tone", async () => {
      const res = await checkTone({ content: "Shut up you idiots and buy this product!", targetTones: ["professional"] });
      expect(res.passed).toBe(false);
      expect(res.score).toBeLessThan(0.5);
      expect(res.critique).toBeTruthy();
    });

    it("ignores AI service fallback responses so local tone evaluation is preserved", async () => {
      const origFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          passed: true,
          score: 0.85,
          detectedTone: "professional",
          critique: null,
          suggestions: [],
          source: "fallback",
        }),
      });
      try {
        const res = await checkTone({
          content: "WAIT WHAT?! THIS IS SO CRAZY!! OMG!!",
          targetTones: ["authoritative", "professional"],
        });
        expect(res.passed).toBe(false);
        expect(res.score).toBeLessThan(0.7);
      } finally {
        global.fetch = origFetch;
      }
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

    it("evaluates hashtags for disclosures (#ad) and banned keywords", async () => {
      const auditWithHashtagAd = await guardrailsService.auditDraft({
        content: "Use promo code SAVE20 today! Past performance does not guarantee future results.",
        hashtags: ["ad", "partner"],
        mediaUrls: ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"],
        channel: "instagram",
        workspaceId: wsA.id,
      });
      expect(auditWithHashtagAd.disclosures.passed).toBe(true);
      expect(auditWithHashtagAd.warnings).toEqual([]);

      const auditWithBannedHashtag = await guardrailsService.auditDraft({
        content: "Past performance does not guarantee future results.",
        hashtags: ["partner", "CompetitorX"],
        channel: "instagram",
        workspaceId: wsA.id,
      });
      expect(auditWithBannedHashtag.bannedClaims.passed).toBe(false);
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

    it("PUT /api/v1/business-profile/profile preserves bannedKeywords and stores sensitivityLevel without sensitivitySensitivity", async () => {
      const updateRes = await request(app)
        .put("/api/v1/business-profile/profile")
        .set(auth(ownerA))
        .send({
          businessType: "B2B SaaS Consulting",
          guardrails: {
            bannedClaims: ["cheapest in the market", "miracle growth guarantee"],
            requiredDisclosures: ["#partner", "Past performance does not guarantee future results"],
            toneStrictness: "strict",
            sensitivityLevel: "conservative",
          },
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.guardrails.bannedKeywords).toEqual(["CompetitorX"]);
      expect(updateRes.body.guardrails.sensitivityLevel).toBe("conservative");
      expect(updateRes.body.guardrails.sensitivitySensitivity).toBeUndefined();
    });

    it("ignores client-supplied aiMetadata.guardrails and always audits on server in draft create, update, and batchCreate", async () => {
      // 1. POST /api/v1/content (create)
      const createRes = await request(app)
        .post("/api/v1/content")
        .set(auth(ownerA))
        .send({
          title: "Spoofed Draft",
          body: "This miracle cure works instantly!",
          platforms: ["instagram"],
          aiMetadata: {
            provider: "custom",
            guardrails: { passed: true, score: 100 },
          },
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.aiMetadata.provider).toBe("custom");
      expect(createRes.body.aiMetadata.guardrails.passed).toBe(false);
      expect(createRes.body.aiMetadata.guardrails.bannedClaims.passed).toBe(false);

      // 2. PUT /api/v1/content/:id (update attempting to spoof guardrails without changing body)
      const updateRes = await request(app)
        .put(`/api/v1/content/${createRes.body._id}`)
        .set(auth(ownerA))
        .send({
          aiMetadata: {
            guardrails: { passed: true, score: 100 },
          },
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.aiMetadata.guardrails.passed).toBe(false);

      // 3. POST /api/v1/posts/batch-create
      const batchRes = await request(app)
        .post("/api/v1/posts/batch-create")
        .set(auth(ownerA))
        .send({
          posts: [
            {
              title: "Spoofed Batch Draft",
              body: "This miracle cure works instantly!",
              channel: "instagram",
              aiMetadata: {
                guardrails: { passed: true, score: 100 },
              },
            },
          ],
        });
      expect(batchRes.status).toBe(201);
      expect(batchRes.body.items[0].aiMetadata.guardrails.passed).toBe(false);
      expect(batchRes.body.items[0].aiMetadata.guardrails.bannedClaims.passed).toBe(false);
    });

    it("POST /api/v1/ai/generate-caption audits each candidate individually", async () => {
      const origFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (String(url).includes("/generate/caption")) {
          return {
            ok: true,
            json: async () => ({
              platform: "linkedin",
              caption: "Clean strategy analysis for Q4 workflow. Past performance does not guarantee future results. #partner",
              model: "groq-test",
              candidates: [
                {
                  provider: "groq",
                  label: "Groq",
                  model: "groq-test",
                  caption: "Clean strategy analysis for Q4 workflow. Past performance does not guarantee future results. #partner",
                  status: "success",
                  error: null,
                },
                {
                  provider: "openrouter",
                  label: "OpenRouter",
                  model: "or-test",
                  caption: "Try our miracle cure for diabetes today!",
                  status: "success",
                  error: null,
                },
              ],
            }),
          };
        }
        throw new Error("unavailable");
      });

      try {
        const res = await request(app)
          .post("/api/v1/ai/generate-caption")
          .set(auth(ownerA))
          .send({ topic: "Q4 growth", platform: "linkedin", tone: "professional" });

        expect(res.status).toBe(200);
        expect(res.body.candidates).toHaveLength(2);
        expect(res.body.candidates[0].guardrails.passed).toBe(true);
        expect(res.body.candidates[1].guardrails.passed).toBe(false);
        expect(res.body.candidates[1].guardrails.bannedClaims.passed).toBe(false);
      } finally {
        global.fetch = origFetch;
      }
    });
  });
});
