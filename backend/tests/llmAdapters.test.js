const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const BaseLlmAdapter = require("../src/services/llm/BaseLlmAdapter");
const AiServiceLlmAdapter = require("../src/services/llm/AiServiceLlmAdapter");
const {
  llmAdapterRegistry,
  getLlmAdapter,
  registerLlmAdapter,
} = require("../src/services/llm/llmAdapterRegistry");
const contentAdaptationService = require("../src/services/contentAdaptation.service");
const userModel = require("../src/models/user.model");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const { closeQueues } = require("../src/queue");

jest.setTimeout(30000);

describe("LLM Adapter Interface & Registry Swappability Tests (#10)", () => {
  let user;
  let workspace;
  let token;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    await setupTestDB();
    user = await userModel.create({
      email: `llm_adapter_${Date.now()}@example.com`,
      name: "LLM Adapter Tester",
    });
    workspace = await workspaceModel.create({
      name: "LLM Adapter Venture",
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
    llmAdapterRegistry.resetDefaults();
  });

  afterAll(async () => {
    await closeQueues();
    llmAdapterRegistry.resetDefaults();
    if (workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
      await membershipModel.deleteOne({ workspaceId: workspace.id });
    }
    await teardownTestDB();
  });

  describe("BaseLlmAdapter Contract", () => {
    it("throws on empty provider and unimplemented core methods", async () => {
      expect(() => new BaseLlmAdapter("")).toThrow("BaseLlmAdapter requires a provider identifier");

      const base = new BaseLlmAdapter("custom");
      await expect(base.generateCaption({})).rejects.toThrow("generateCaption() not implemented");
      await expect(base.suggestHashtags({})).rejects.toThrow("suggestHashtags() not implemented");
      await expect(base.repurposeContent({})).rejects.toThrow("repurposeContent() not implemented");
      await expect(base.generateVariants({})).rejects.toThrow("generateVariants() not implemented");

      await expect(base.evaluateTone({})).resolves.toBeNull();
      await expect(base.checkSensitivity({})).resolves.toBeNull();
      await expect(base.healthCheck()).resolves.toBe(true);
    });
  });

  describe("AiServiceLlmAdapter HTTP Client & Fallback Behavior", () => {
    it("posts to Python AI microservice and returns parsed payload on success", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ caption: "Service caption", model: "groq-test" }),
      });

      const adapter = new AiServiceLlmAdapter({ baseUrl: "http://ai.internal:5001" });
      const res = await adapter.generateCaption({ topic: "Coffee", platform: "instagram", tone: "casual" });

      expect(res).toEqual({ caption: "Service caption", model: "groq-test" });
      expect(global.fetch).toHaveBeenCalledWith(
        "http://ai.internal:5001/generate/caption",
        expect.objectContaining({ method: "POST" })
      );
      await expect(adapter.healthCheck()).resolves.toBe(true);
    });

    it("returns null gracefully when AI service responds 503 or throws", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const adapter = new AiServiceLlmAdapter({ baseUrl: "http://127.0.0.1:59999" });

      await expect(adapter.generateCaption({ topic: "Test" })).resolves.toBeNull();
      await expect(adapter.suggestHashtags({ content: "Test" })).resolves.toBeNull();
      await expect(adapter.repurposeContent({ content: "Test", targetPlatforms: ["gbp"] })).resolves.toBeNull();
      await expect(adapter.generateVariants({ idea: "Test", channels: ["facebook"] })).resolves.toBeNull();
      await expect(adapter.healthCheck()).resolves.toBe(false);
    });
  });

  describe("Swappable LLM Registry Integration", () => {
    class MockLlmAdapter extends BaseLlmAdapter {
      constructor() {
        super("mock-llm");
      }

      async generateCaption({ topic, platform, tone }) {
        return {
          platform,
          caption: `[MockLLM:${tone}] ${topic}`,
          model: "mock-v1",
          tone,
        };
      }

      async suggestHashtags({ platform }) {
        return {
          platform,
          hashtags: ["#MockTag1", "#MockTag2"],
          model: "mock-v1",
        };
      }

      async repurposeContent({ content, targetPlatforms }) {
        const repurposed = {};
        for (const p of targetPlatforms) {
          repurposed[p] = `[MockRepurpose:${p}] ${content}`;
        }
        return { repurposed, model: "mock-v1" };
      }

      async generateVariants({ channels, idea, tone }) {
        return {
          variants: channels.map((ch) => ({
            channel: ch,
            title: `Mock ${ch} Title`,
            body: `[MockVariant:${ch}:${tone}] ${idea}`,
            hashtags: ["#MockOmnichannel"],
          })),
          model: "mock-v1",
        };
      }
    }

    it("registers custom adapters, switches default provider, and resets cleanly", () => {
      expect(llmAdapterRegistry.has("ai-service")).toBe(true);
      expect(() => llmAdapterRegistry.setDefault("missing")).toThrow("is not registered");
      expect(() => getLlmAdapter("nonexistent")).toThrow("Unsupported LLM adapter");

      const mockAdapter = new MockLlmAdapter();
      registerLlmAdapter("mock-llm", mockAdapter);
      expect(llmAdapterRegistry.listProviders()).toContain("mock-llm");

      llmAdapterRegistry.setDefault("mock-llm");
      expect(getLlmAdapter()).toBe(mockAdapter);

      llmAdapterRegistry.resetDefaults();
      expect(llmAdapterRegistry.has("mock-llm")).toBe(false);
      expect(getLlmAdapter().provider).toBe("ai-service");
    });

    it("routes contentAdaptationService and /api/v1/ai/* controllers through swapped LLM adapter", async () => {
      registerLlmAdapter("mock-llm", new MockLlmAdapter());
      llmAdapterRegistry.setDefault("mock-llm");

      // Direct service check (including GBP #13 channel)
      const adapted = await contentAdaptationService.adaptIdeaToChannels({
        idea: "Weekend farmers market special",
        channels: ["instagram", "gbp"],
        tone: "bold",
      });
      expect(adapted.variants).toHaveLength(2);
      expect(adapted.variants[0].content.body).toContain("[MockVariant:instagram:bold]");
      expect(adapted.variants[1].channel).toBe("gbp");
      expect(adapted.variants[1].content.body).toContain("[MockVariant:gbp:bold]");

      // Controller route checks
      const capRes = await request(app)
        .post("/api/v1/ai/generate-caption")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ topic: "Autumn Menu", platform: "gbp", tone: "professional" });
      expect(capRes.status).toBe(200);
      expect(capRes.body.caption).toBe("[MockLLM:professional] Autumn Menu");
      expect(capRes.body.guardrails).toBeDefined();

      const tagRes = await request(app)
        .post("/api/v1/ai/suggest-hashtags")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ content: "Fresh bread daily", platform: "twitter" });
      expect(tagRes.status).toBe(200);
      expect(tagRes.body.hashtags).toEqual(["#MockTag1", "#MockTag2"]);

      const repRes = await request(app)
        .post("/api/v1/ai/repurpose")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ content: "Launch day!", sourcePlatform: "twitter", targetPlatforms: ["linkedin", "gbp"] });
      expect(repRes.status).toBe(200);
      expect(repRes.body.repurposed.linkedin).toContain("[MockRepurpose:linkedin]");
      expect(repRes.body.repurposed.gbp).toContain("[MockRepurpose:gbp]");

      // Partial variant return (e.g., upstream microservice omits gbp) fills missing channel locally
      class PartialLlmAdapter extends MockLlmAdapter {
        async generateVariants({ channels, idea, tone }) {
          return {
            variants: channels
              .filter((ch) => ch !== "gbp")
              .map((ch) => ({
                channel: ch,
                content: {
                  title: `Canonical ${ch}`,
                  body: `[CanonicalVariant:${ch}:${tone}] ${idea}`,
                  hashtags: ["#Canonical"],
                },
                provider: "canonical-llm",
                model: "canonical-v1",
              })),
          };
        }
      }
      registerLlmAdapter("partial-llm", new PartialLlmAdapter());
      const partialAdapted = await contentAdaptationService.adaptIdeaToChannels({
        idea: "Sunday pastry box",
        channels: ["instagram", "gbp"],
        tone: "warm",
        llmProvider: "partial-llm",
      });
      expect(partialAdapted.variants).toHaveLength(2);
      expect(partialAdapted.variants[0].content.body).toContain("[CanonicalVariant:instagram:warm]");
      expect(partialAdapted.variants[1].channel).toBe("gbp");
      expect(partialAdapted.variants[1].provider).toBe("template");
    });

    it("returns 400 when an unsupported provider is passed to AI routes", async () => {
      const res = await request(app)
        .post("/api/v1/ai/generate-caption")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id)
        .send({ topic: "Coffee", platform: "instagram", provider: "nope" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Unsupported LLM provider: 'nope'");
    });
  });
});
