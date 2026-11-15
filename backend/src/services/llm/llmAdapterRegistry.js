const AiServiceLlmAdapter = require("./AiServiceLlmAdapter");
const logger = require("../../config/logger");

class LlmAdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.defaultProvider = "ai-service";
    this.initDefaults();
  }

  initDefaults() {
    this.defaultProvider = "ai-service";
    this.register("ai-service", new AiServiceLlmAdapter());
  }

  /**
   * Register or override an LLM adapter for a given provider key.
   * Useful for swapping providers or mocking LLM calls in tests.
   * @param {string} provider
   * @param {import('./BaseLlmAdapter')} adapter
   */
  register(provider, adapter) {
    if (!provider || typeof provider !== "string") {
      throw new Error("LLM provider identifier must be a non-empty string");
    }
    const key = provider.toLowerCase().trim();
    this.adapters.set(key, adapter);
    logger.debug({ llmProvider: key }, "Registered LLM adapter");
  }

  /**
   * Switch the active default LLM provider used across controllers/services.
   * @param {string} provider
   */
  setDefault(provider) {
    if (!provider || typeof provider !== "string") {
      throw new Error("Default LLM provider must be a non-empty string");
    }
    const key = provider.toLowerCase().trim();
    if (!this.adapters.has(key)) {
      throw new Error(`Cannot set default LLM provider '${provider}' because it is not registered`);
    }
    this.defaultProvider = key;
  }

  /**
   * Look up a registered LLM adapter (defaults to the active default provider).
   * @param {string} [provider]
   * @returns {import('./BaseLlmAdapter')}
   */
  get(provider) {
    const key = (provider || this.defaultProvider).toLowerCase().trim();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(
        `Unsupported LLM adapter: ${provider || key}. Registered providers: ${this.listProviders().join(", ")}`
      );
    }
    return adapter;
  }

  has(provider) {
    if (!provider) return false;
    return this.adapters.has(provider.toLowerCase().trim());
  }

  listProviders() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Reset the registry back to default adapters (for clean test teardown).
   */
  resetDefaults() {
    this.adapters.clear();
    this.initDefaults();
  }
}

const llmAdapterRegistry = new LlmAdapterRegistry();

module.exports = {
  LlmAdapterRegistry,
  llmAdapterRegistry,
  getLlmAdapter: (provider) => llmAdapterRegistry.get(provider),
  registerLlmAdapter: (provider, adapter) => llmAdapterRegistry.register(provider, adapter),
};

