/** Preset questions. Client-safe: no server imports. */
export const PRESETS = [
  { id: "why_flagged", question: (place: string) => `Why is ${place} flagged for review?` },
  { id: "who_first", question: () => "Which residents need attention first?" },
  { id: "verify_before_outreach", question: () => "What should the property team verify before renewal outreach?" },
  {
    id: "maintenance_association",
    question: () => "Does the data show that maintenance issues are associated with lower renewals?",
  },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export const MAX_QUESTION_LENGTH = 500;

export function isPresetId(v: unknown): v is PresetId {
  return PRESETS.some((p) => p.id === v);
}
