// GLOBAL_WEIGHT_DEFAULTS — application-layer constants (D-03)
// CRITICAL: Defined here (application layer) so RecordSwipeUseCase can import without violating
// architecture rules (application/ must NOT import from adapters/).
// The adapter (recommendation.repository.ts) uses its own hardcoded copy as fallback — the
// values are the same and will remain stable (D-03 locked decision).
export const GLOBAL_WEIGHT_DEFAULTS = {
  profession: 0.30,
  skills: 0.35,
  location: 0.20,
  modality: 0.10,
  salary: 0.05,
} as const

export type WeightKeys = keyof typeof GLOBAL_WEIGHT_DEFAULTS
