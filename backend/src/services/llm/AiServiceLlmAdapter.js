const BaseLlmAdapter = require("./BaseLlmAdapter");

/**
 * Default LLM adapter communicating with SteadyPost's Python AI microservice
 * (which multiplexes Groq, OpenRouter, Gemini, and OpenAI providers).
 */
class AiServiceLlmAdapter extends BaseLlmAdapter {
  constructor({ baseUrl = null } = {}) {
    super("ai-service");
    this.baseUrl = baseUrl;
  }

  getBaseUrl() {
    return this.baseUrl || process.env.AI_SERVICE_URL || "http://localhost:5001";
  }

  async _postJson(path, body, { timeoutMs = 12000, logLevel = "warn", reason = "AI service unavailable" } = {}) {
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${this.getBaseUrl()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      if (this.logger && typeof this.logger[logLevel] === "function") {
        this.logger[logLevel]({ err: err.message, path }, reason);
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    return null;
  }

  async generateCaption(params) {
    return this._postJson("/generate/caption", params, {
      timeoutMs: 16000,
      logLevel: "warn",
      reason: "AI service unavailable, using built-in generator",
    });
  }

  async suggestHashtags(params) {
    return this._postJson("/generate/hashtags", params, {
      timeoutMs: 16000,
      logLevel: "warn",
      reason: "AI service unavailable, using built-in generator",
    });
  }

  async repurposeContent(params) {
    return this._postJson("/generate/repurpose", params, {
      timeoutMs: 16000,
      logLevel: "warn",
      reason: "AI service unavailable, using built-in generator",
    });
  }

  async generateVariants(params) {
    const timeoutMs = parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 12000;
    return this._postJson("/generate/variants", params, {
      timeoutMs,
      logLevel: "warn",
      reason: "AI service unavailable, using local template adaptation",
    });
  }

  async evaluateTone({ content = "", targetTones = ["professional"], strictness = "moderate" } = {}) {
    return this._postJson(
      "/guardrails/tone",
      { content, targetTones, strictness },
      {
        timeoutMs: 2500,
        logLevel: "debug",
        reason: "AI service tone check unavailable, using local tone evaluator",
      }
    );
  }

  async checkSensitivity({ topic = "", snippet = "", sensitivityLevel = "standard" } = {}) {
    return this._postJson(
      "/guardrails/sensitivity",
      { topic, snippet, sensitivityLevel },
      {
        timeoutMs: 2000,
        logLevel: "debug",
        reason: "AI service sensitivity check unavailable, using local evaluator",
      }
    );
  }

  async healthCheck() {
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.getBaseUrl()}/health`, { signal: controller.signal });
      return Boolean(res && res.ok);
    } catch {
      return false;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

module.exports = AiServiceLlmAdapter;

