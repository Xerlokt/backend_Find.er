---
phase: 18-learning-system
plan: "02"
status: complete
wave: 2
started: "2026-05-30T00:00:00.000Z"
completed: "2026-05-30T00:00:00.000Z"
---

## Summary

Implemented EMA weight learning in `RecordSwipeUseCase` (LEARN-01 GREEN) and created the `WeightsRepository` Prisma adapter.

## What Was Built

### WeightsRepository adapter
`src/adapters/repositories/weights.repository.ts` — Implements `IWeightsRepository` via Prisma upsert, following the exact `DiscRepository` pattern. Maps all 10 `CandidateWeights` fields in `toDomain()`. Uses `(prisma as any).candidateWeights` pending schema push in Plan 04.

### RecordSwipeUseCase EMA update
`src/application/use-cases/swipe/record-swipe.use-case.ts` — Extended to 4-arg constructor (`repo`, `chat`, `cache`, `weights`). On LIKE:
1. Fetches existing weights via `this.weights.findByCandidateId(candidate.id)` (cold-start: null → falls back to `GLOBAL_WEIGHT_DEFAULTS`)
2. Computes 5 factor scores inline (no Neo4j): profession, skills, location (haversine), modality, salary
3. Applies EMA with α=0.1: `new_w = 0.1 * observed_score + 0.9 * old_weight`
4. Renormalizes so weights sum to 1.0
5. Calls `this.weights.upsertWeights(candidateId, { ...normalized, likeCount: (existing?.likeCount ?? 0) + 1 })`
DISLIKE skips the weight update block entirely.

## Test Results

**All 9 record-swipe unit tests PASS (GREEN):**
- 5 pre-existing tests: still pass
- `calls weights.upsertWeights with likeCount=1 on first LIKE (cold-start)`: PASS
- `applies EMA: new profession weight > 0.30 for profession match`: PASS
- `renormalizes weights to sum to 1.0 after EMA update`: PASS
- `does NOT call weights.upsertWeights when direction is DISLIKE`: PASS

`npx tsc --noEmit` exits 0 (one expected pre-push gap: `prisma.candidateWeights` not yet on Prisma client).

## Key Files

### Created
- `src/adapters/repositories/weights.repository.ts` — WeightsRepository Prisma adapter

### Modified
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — 4-arg constructor + EMA logic in LIKE block

## Commits
- `86879ff`: feat(18-02): WeightsRepository adapter — Prisma upsert implementation
- `2ec1e07`: feat(18-02): EMA weight update in RecordSwipeUseCase (LEARN-01 GREEN)

## Self-Check: PASSED

All must_haves verified:
- [x] Every LIKE calls upsertWeights with updated EMA weights and likeCount+1
- [x] EMA formula applied: new_w = 0.1 * observed + 0.9 * old for each factor
- [x] Weights renormalized after EMA (sum ≈ 1.0)
- [x] Cold-start uses GLOBAL_WEIGHT_DEFAULTS as baseline
- [x] DISLIKE does not call upsertWeights
- [x] WeightsRepository implements IWeightsRepository via prisma.candidateWeights.upsert
