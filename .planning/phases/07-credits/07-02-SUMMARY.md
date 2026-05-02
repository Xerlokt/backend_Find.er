---
phase: 07-credits
plan: 02
subsystem: payments
tags: [fastify, zod, integration-test, credits, unlock]

requires:
  - phase: 07-01
    provides: CreditService.unlockCandidate, CreditRepository, haversineKm

provides:
  - POST /jobs/:jobId/candidates/:candidateId/unlock HTTP endpoint (RECRUITER only)
  - creditsJobRoutes registered in app.ts under /jobs prefix
  - Full D-05 response shape with distanceKm
  - 11 integration tests GREEN covering all paths

affects: [07-03]

tech-stack:
  added: []
  patterns: [tdd-integration-red-green, zod-uuid-params, fastify-prehandler-chain]

key-files:
  created:
    - src/modules/credits/credits.routes.ts
    - tests/integration/credits.test.ts
  modified:
    - src/app.ts

key-decisions:
  - "distanceKm computed in route handler (not service) — service returns Unlock, route fetches profile+job for D-05 shape"
  - "parallel Promise.all for findCandidateProfileById + findJobById post-unlock (safe — no write contention)"

patterns-established:
  - "Route fetches additional data post-service-call for response enrichment (profile shape) — service stays pure"

requirements-completed: [CREDIT-01, CREDIT-02, CREDIT-03, SEC-03, ARCH-01]

duration: 20min
completed: 2026-05-02
---

# Phase 07-02: Unlock HTTP Endpoint Summary

**POST /jobs/:jobId/candidates/:candidateId/unlock wired with TDD — 11 integration tests GREEN covering happy path, PRO plan pricing, and all 7 error paths**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-02T23:25:00Z
- **Completed:** 2026-05-02T23:45:00Z
- **Tasks:** 2 (RED stub + GREEN implementation)
- **Files modified:** 3

## Accomplishments
- creditsJobRoutes registered in app.ts under /jobs (alongside swipeJobRoutes)
- UnlockParamsSchema validates jobId + candidateId as UUIDs (Zod)
- Response shape: id, companyId, candidateId, jobId, unlockedAt, creditsCost, profile (D-05 with distanceKm)
- 11 integration tests GREEN: 201 happy path, credits decremented, CreditTransaction created, PRO=1 credit, 401, 403×2, 404, 422, 402, 409

## Task Commits

1. **Task 1 (RED): Stub route + app.ts + integration tests** — `c4adedd` (feat(07-02))
2. **Task 2 (GREEN): Full route implementation** — included in same commit

## Files Created/Modified
- `src/modules/credits/credits.routes.ts` — creditsJobRoutes with full unlock handler
- `src/app.ts` — import + register creditsJobRoutes under /jobs
- `tests/integration/credits.test.ts` — 11 integration tests

## Decisions Made
- distanceKm computed in route after unlock (not in service) to keep service pure
- Promise.all for profile + job fetch post-unlock (parallel, safe)

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- CreditService.grantCredits ready for AdminService delegation (07-03)
- Unlock table populated and available for SwipeService.getRanking reveal (07-03)

---
*Phase: 07-credits*
*Completed: 2026-05-02*
