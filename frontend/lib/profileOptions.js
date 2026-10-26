// Must match backend/src/validation/businessProfile.js — the API rejects
// any other value.
export const TONES = [
  { key: "professional", label: "Professional" },
  { key: "inspiring", label: "Inspiring" },
  { key: "tech-forward", label: "Tech-Forward" },
  { key: "casual", label: "Casual" },
  { key: "authoritative", label: "Authoritative" },
  { key: "bold", label: "Bold" },
  { key: "playful", label: "Playful" },
];

export const GOALS = [
  { key: "brand_awareness", label: "Brand Awareness" },
  { key: "lead_generation", label: "Lead Generation" },
  { key: "community_growth", label: "Community Growth" },
  { key: "thought_leadership", label: "Thought Leadership" },
];

export const CHANNELS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
];

// Same limits as the API, used as maxLength on the inputs.
export const LIMITS = { name: 80, businessType: 80, offer: 500, audience: 300, place: 100, serviceArea: 200 };

export const EMPTY_LOCATION = { city: "", region: "", country: "", serviceArea: "" };

/** Keep only values the API accepts (older profiles may hold others). */
export function knownKeys(values, options) {
  const keys = new Set(options.map((o) => o.key));
  return (values || []).filter((v) => keys.has(v));
}

/** A readable message from an API validation error. */
export function profileErrorMessage(err, fallback) {
  const data = err.response?.data;
  const issue = data?.details?.[0];
  if (issue) {
    const field = issue.path?.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  }
  return data?.error || fallback;
}
