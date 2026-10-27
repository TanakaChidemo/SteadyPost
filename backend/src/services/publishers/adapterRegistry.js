const MetaAdapter = require("./MetaAdapter");
const TwitterAdapter = require("./TwitterAdapter");
const LinkedInAdapter = require("./LinkedInAdapter");
const GbpAdapter = require("./GbpAdapter");
const logger = require("../../config/logger");

class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.initDefaults();
  }

  initDefaults() {
    const metaFacebook = new MetaAdapter("facebook");
    const metaInstagram = new MetaAdapter("instagram");
    const twitter = new TwitterAdapter();
    const linkedin = new LinkedInAdapter();
    const gbp = new GbpAdapter();

    this.register("facebook", metaFacebook);
    this.register("instagram", metaInstagram);
    this.register("twitter", twitter);
    this.register("x", twitter); // alias
    this.register("linkedin", linkedin);
    this.register("gbp", gbp);
    this.register("google_business", gbp); // alias
    this.register("google", gbp); // alias
  }

  /**
   * Register or override an adapter for a given platform.
   * Useful for swapping implementations or mocking in tests.
   * @param {string} platform
   * @param {import('./BaseAdapter')} adapter
   */
  register(platform, adapter) {
    if (!platform || typeof platform !== "string") {
      throw new Error("Platform identifier must be a non-empty string");
    }
    const key = platform.toLowerCase().trim();
    this.adapters.set(key, adapter);
    logger.debug({ platform: key }, "Registered platform adapter");
  }

  /**
   * Look up the registered adapter for a platform.
   * @param {string} platform
   * @returns {import('./BaseAdapter')}
   */
  get(platform) {
    if (!platform) {
      throw new Error("Platform name is required to get adapter");
    }
    const key = platform.toLowerCase().trim();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`Unsupported platform adapter: ${platform}. Supported platforms: ${this.listPlatforms().join(", ")}`);
    }
    return adapter;
  }

  has(platform) {
    if (!platform) return false;
    return this.adapters.has(platform.toLowerCase().trim());
  }

  listPlatforms() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Reset the registry back to standard default adapters.
   * Particularly useful in test suites after mocking.
   */
  resetDefaults() {
    this.adapters.clear();
    this.initDefaults();
  }
}

const adapterRegistry = new AdapterRegistry();

module.exports = {
  AdapterRegistry,
  adapterRegistry,
  getAdapter: (platform) => adapterRegistry.get(platform),
  registerAdapter: (platform, adapter) => adapterRegistry.register(platform, adapter),
};
