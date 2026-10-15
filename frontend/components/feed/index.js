"use client";

import { InstagramPreview } from "./InstagramPreview";
import { FacebookPreview } from "./FacebookPreview";

/**
 * Feed-preview registry. New channels (#13 GBP, …) slot in by calling
 * registerFeedPreview — the studio and calendar render whatever is
 * registered without knowing channel specifics.
 *
 * Each preview receives: { accountName, body, mediaUrls, mediaIndex,
 * onMediaIndexChange }
 */
const registry = {
  instagram: { label: "Instagram", Component: InstagramPreview },
  facebook: { label: "Facebook", Component: FacebookPreview },
};

export function registerFeedPreview(channel, { label, Component }) {
  registry[channel] = { label, Component };
}

export function getFeedPreview(channel) {
  return registry[channel] || null;
}

export function getFeedChannels() {
  return Object.keys(registry);
}

export function getFeedLabel(channel) {
  return registry[channel]?.label || channel;
}

export { InstagramPreview, FacebookPreview };
