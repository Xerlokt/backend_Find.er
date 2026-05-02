---
phase: 06-recommendation
plan: 03
subsystem: swipe
tags: [recommendation, fit-score, dependency-injection, arch-04, tdd, green]
dependency_graph:
  requires:
    - "06-01 (IRecommendationService interface)"
    - "06-02 (RecommendationRepository with real computeFitScore algorithm)"
  provides:
    - src/modules/swipe/swipe.service.ts (IRecommendationService injected, getRanking sorted by fitScore DESC, getFeed scored)
    - src/modules/swipe/swipe.routes.ts (RecommendationRepository(getNeo4jDriver()) injected in both route functions)
    - tests/unit/swipe.service.test.ts (20 unit tests green — 16 original + 4 new)
    - tests/integration/swipe.test.ts (fitScore field assertions in feed and ranking)
    - tests/integration/recommendation.test.ts (HTTP ranking fitScore integration test REC-03)
  affects:
    - GET /jobs/feed (now returns fitScore per job — CAND-03)
    - GET /jobs/:jobId/ranking (fitScore from real algorithm, sorted DESC — REC-03)
tech_stack:
  added: []
  patterns:
    - Constructor injection of IRecommendationService (ARCH-04 interface boundary)
    - Promise.all concurrent fit-score computation (getRanking + getFeed)
    - Array.sort DESC by fitScore then 1-based rank assignment
    - Route-level dependency injection (concrete class injected in routes, not service)
key_files:
  created: []
  modified:
    - src/modules/swipe/swipe.service.ts
    - src/modules/swipe/swipe.routes.ts
    - tests/unit/swipe.service.test.ts
    - tests/integration/swipe.test.ts
    - tests/integration/recommendation.test.ts
decisions:
  - "IRecommendationService injected as second SwipeService constructor arg — concrete RecommendationRepository only appears in swipe.routes.ts (ARCH-04)"
  - "Promise.all used for concurrent computeFitScore calls in both getRanking and getFeed — pure TypeScript in v1 so no blocking I/O at MVP scale (T-06-13 accepted)"
  - "Sort DESC then rank assignment — rank is post-sort index+1, not pre-sort (correctness requirement for REC-03)"
  - "candidate.searchRadiusKm cast via (candidate as any).searchRadiusKm ?? 50 in getFeed — CandidateProfile Prisma model includes searchRadiusKm but TypeScript inferred type from findUnique may not expose it without explicit select"
metrics:
  duration: "~20 minutes"
  completed_date: "2026-05-02"
  tasks_completed: 2
  files_created: 0
  files_modified: 5
---

# Phase 06 Plan 03: Wire RecommendationRepository into SwipeService Summary

**One-liner:** IRecommendationService injected as second SwipeService constructor arg replacing the fitScore:0 placeholder (D-13), getRanking now sorts by real fit scores DESC and getFeed returns scored jobs, all 20 unit tests green and ARCH-04 satisfied.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update SwipeService — inject IRecommendationService, replace fitScore placeholder, add fitScore to feed | c98a2d5 | src/modules/swipe/swipe.service.ts, src/modules/swipe/swipe.routes.ts |
| 2 | Update swipe unit tests + add integration test assertions for fitScore | 685d03b | tests/unit/swipe.service.test.ts, tests/integration/swipe.test.ts, tests/integration/recommendation.test.ts |

## What Was Built

### Task 1: SwipeService + swipe.routes.ts

**src/modules/swipe/swipe.service.ts** — Three changes:

1. **Constructor injection:** Added `IRecommendationService` as second constructor arg via `import type` (type-only import — no runtime coupling to `RecommendationRepository`). This satisfies ARCH-04.

2. **getRanking rewrite:** Replaced the synchronous `.map()` + `fitScore: 0` placeholder with `Promise.all()` over async `this.recommendation.computeFitScore()` calls. After scoring, items are sorted by `fitScore DESC` then 1-based rank is assigned. The sort happens after all scores are collected — rank reflects the sorted order.

3. **getFeed scored:** Added `scoredData` via `Promise.all()` mapping each feed job through `computeFitScore()`. The feed is NOT sorted by fitScore (informational only per CAND-03/REC-01) — items retain their `createdAt DESC` order from the DB.

**src/modules/swipe/swipe.routes.ts** — Both `swipeRoutes` and `swipeJobRoutes` now instantiate `RecommendationRepository(getNeo4jDriver())` and pass it as the second arg to `SwipeService`. The concrete class never appears in swipe.service.ts.

### Task 2: Tests

**tests/unit/swipe.service.test.ts** — Added:
- `makeRecRepo()` factory (jest.Mocked<RecommendationRepository>)
- `recRepo` variable in describe scope, initialized in `beforeEach` after `jest.clearAllMocks()` with `mockResolvedValue(0)` default
- `makeSwipeWithCandidate` updated to include `searchRadiusKm: 50` on the candidate object
- 3 new `getRanking` tests: computeFitScore called per swipe, sort DESC with rank reassignment, 3-item sort correctness
- 1 new `getFeed` test: fitScore field present per job (CAND-03)
- Total: 20 tests (16 original + 4 new), all GREEN

**tests/integration/swipe.test.ts** — Added:
- Feed test: creates candidate + job, GETs `/jobs/feed`, asserts `fitScore` field is a `number`
- Ranking test: creates recruiter + job + candidate swipe, GETs `/jobs/:jobId/ranking`, asserts `typeof fitScore === 'number'`

**tests/integration/recommendation.test.ts** — Added `describe('GET /jobs/:jobId/ranking — fitScore integration (REC-03)')` with one HTTP-level test using dynamic imports to create the full app stack and assert `fitScore >= 0` on the ranking response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed createSwipe call in recommendation.test.ts**
- **Found during:** Task 2 — reading the `factories.ts` helper
- **Issue:** Plan's suggested code used `createSwipe(candUser.id, job.id, 'LIKE')` — but `createSwipe` takes `(candidateId, jobId, overrides: { direction })` where `candidateId` is the CandidateProfile.id (not User.id), and the third arg must be an object
- **Fix:** Changed to `createSwipe(candProfile.id, job.id, { direction: 'LIKE' })` and captured the `candProfile` from `prisma.candidateProfile.create()`
- **Files modified:** tests/integration/recommendation.test.ts
- **Commit:** 685d03b

**2. [Rule 2 - Missing field] Added searchRadiusKm to makeSwipeWithCandidate in unit tests**
- **Found during:** Task 2 — the service's getRanking uses `swipe.candidate.searchRadiusKm ?? 50`; the original mock didn't include this field, which is fine due to `?? 50` fallback, but adding it makes the mock more faithful
- **Fix:** Added `searchRadiusKm: 50` to the candidate object in `makeSwipeWithCandidate`
- **Files modified:** tests/unit/swipe.service.test.ts
- **Commit:** 685d03b

## Known Stubs

None — fitScore:0 placeholder from Plan 06-01/D-13 has been fully replaced with real `computeFitScore()` calls.

## Threat Surface Scan

No new threat surface beyond what the plan's threat model covers. All mitigations verified:

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-06-09 (getRanking IDOR) | Mitigated | `job.recruiterId !== recruiterProfile.id → 403` preserved unchanged |
| T-06-10 (fitScore disclosure) | Accepted | Only rounded integer 0–100 exposed; factor scores not in response |
| T-06-11 (Tampering — computeFitScore input) | Accepted | Input comes from Prisma (trusted, already Zod-validated on write) |
| T-06-12 (EoP — CANDIDATE accessing ranking) | Mitigated | `requireRole('RECRUITER')` preHandler unchanged |
| T-06-13 (DoS — Promise.all feed) | Accepted | Pure TypeScript math in v1, no I/O; 20 concurrent calls negligible at MVP scale |
| T-06-14 (ARCH-04 violation) | Mitigated | `import type { IRecommendationService }` only in swipe.service.ts; 0 matches for `import.*RecommendationRepository` in service |

## Self-Check

### File Existence

- [x] src/modules/swipe/swipe.service.ts — modified (exists)
- [x] src/modules/swipe/swipe.routes.ts — modified (exists)
- [x] tests/unit/swipe.service.test.ts — modified (exists)
- [x] tests/integration/swipe.test.ts — modified (exists)
- [x] tests/integration/recommendation.test.ts — modified (exists)

### Commit Existence

- [x] c98a2d5 — feat(06-03): inject IRecommendationService into SwipeService, replace fitScore:0 placeholder
- [x] 685d03b — test(06-03): update swipe unit tests + add fitScore integration assertions

### Test State

- Unit tests (swipe): 20/20 PASSING (GREEN)
- Unit tests (recommendation): 14/14 PASSING (GREEN)
- tsc --noEmit: exits 0

### Verification Checks

- [x] `grep "import type.*IRecommendationService" src/modules/swipe/swipe.service.ts` → 1 match
- [x] `grep "private readonly recommendation: IRecommendationService"` → 1 match
- [x] `grep "this.recommendation.computeFitScore"` → 2 matches (getRanking + getFeed)
- [x] `grep "fitScore: 0" src/modules/swipe/swipe.service.ts` → 0 matches (placeholder removed)
- [x] `grep "sort.*fitScore"` → 1 match (`.sort((a, b) => b.fitScore - a.fitScore)`)
- [x] `grep "scoredData"` → 2 matches (declaration + return)
- [x] `grep "import.*RecommendationRepository" src/modules/swipe/swipe.service.ts` → 0 matches (ARCH-04)
- [x] `grep "RecommendationRepository" src/modules/swipe/swipe.routes.ts` → 3 matches (import + 2 usages)
- [x] `grep "getNeo4jDriver" src/modules/swipe/swipe.routes.ts` → 2+ matches

## Self-Check: PASSED
