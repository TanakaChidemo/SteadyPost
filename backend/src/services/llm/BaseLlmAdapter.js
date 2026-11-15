const logger = require("../../config/logger");

/**
 * Base abstract adapter interface for LLM providers (Python AI microservice,
 * Groq, OpenRouter, Gemini, OpenAI, or test doubles).
 * Mirrors publishers/BaseAdapter so LLM providers and platform APIs share the
 * same swappable, mockable adapter architecture (#10).
 */
class BaseLlmAdapter {
  constructor(provider = "base") {
    if (!provider) {
      throw new Error("BaseLlmAdapter requires a provider identifier");
    }
    this.provider = provider;
    this.logger = logger.child ? logger.child({ llmProvider: provider }) : logger;
  }

  /**
   * Generate a social caption (optionally returning multi-model candidates).
   * @param {Object} _params - { topic, platform, tone, businessProfile, workspaceId, userId }
   * @returns {Promise<Object|null>}
   */
  async generateCaption(_params) {
    throw new Error(`generateCaption() not implemented for LLM provider: ${this.provider}`);
  }

  /**
   * Suggest relevant hashtags for post content.
   * @param {Object} _params - { content, platform, maxTags, userId }
   * @returns {Promise<Object|null>}
   */
  async suggestHashtags(_params) {
    throw new Error(`suggestHashtags() not implemented for LLM provider: ${this.provider}`);
  }

  /**
   * Repurpose source content across target platforms.
   * @param {Object} _params - { content, sourcePlatform, targetPlatforms, tone, userId }
   * @returns {Promise<Object|null>}
   */
  async repurposeContent(_params) {
    throw new Error(`repurposeContent() not implemented for LLM provider: ${this.provider}`);
  }

  /**
   * Adapt a campaign idea or source post into platform-native channel variants.
   * @param {Object} _params - { idea, channels, tone, businessProfile, sourcePost }
   * @returns {Promise<Object|null>}
   */
  async generateVariants(_params) {
    throw new Error(`generateVariants() not implemented for LLM provider: ${this.provider}`);
  }

  /**
   * Evaluate draft copy against target brand tones.
   * Returning null signals the caller to use deterministic local scoring.
   * @param {Object} _params - { content, targetTones, strictness }
   * @returns {Promise<Object|null>}
   */
  async evaluateTone(_params) {
    return null;
  }

  /**
   * Check whether a trend topic/snippet touches sensitive or crisis events.
   * Returning null signals the caller to use deterministic local screening.
   * @param {Object} _params - { topic, snippet, sensitivityLevel }
   * @returns {Promise<Object|null>}
   */
  async checkSensitivity(_params) {
    return null;
  }

  /**
   * Verify connectivity / configuration for this LLM provider.
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    return true;
  }
}

module.exports = BaseLlmAdapter;

