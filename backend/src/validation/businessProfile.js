const { z } = require("zod");

// The only values the onboarding and profile forms offer. Tone feeds the AI
// caption prompt (ai.controller uses tone[0]), so free text isn't accepted.
const TONES = ["professional", "inspiring", "tech-forward", "casual", "authoritative", "bold", "playful"];
const GOALS = ["brand_awareness", "lead_generation", "community_growth", "thought_leadership"];
const CHANNELS = ["facebook", "instagram"];

const text = (max) => z.string().trim().max(max, `Must be ${max} characters or fewer`);
const uniqueList = (values) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .transform((list) => [...new Set(list)]);

const locationSchema = z.object({
  city: text(100).default(""),
  region: text(100).default(""),
  country: text(100).default(""),
  serviceArea: text(200).default(""),
});

// Every field is optional so the same schema validates a partial update
// (PUT /business-profile/profile) and the fields sent when a workspace is
// created with its profile (POST /workspaces). Unknown keys are dropped.
const profileFieldsSchema = z.object({
  name: text(80).optional(),
  businessType: text(80).optional(),
  websiteUrl: text(2048).optional(),
  offer: text(500).optional(),
  audience: text(300).optional(),
  location: locationSchema.optional(),
  tone: uniqueList(TONES).optional(),
  goals: uniqueList(GOALS).optional(),
  activeChannels: uniqueList(CHANNELS).optional(),
  // Set by the last step of the onboarding wizard.
  onboardingCompleted: z.literal(true).optional(),
});

module.exports = { TONES, GOALS, CHANNELS, profileFieldsSchema };
