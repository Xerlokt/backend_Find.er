---
phase: 07-credits
plan: 03
subsystem: api
tags: [prisma, fastify, credits, swipe, admin, arch-04]

# Dependency graph
requires:
  - phase: 07-credits/07-01
    provides: CreditService.grantCredits, CreditRepository, Unlock model
  - phase: 07-credits/07-02
    provides: POST /jobs/:jobId/candidates/:candidateId/unlock HTTP endpoint
provides:
  - ICreditService interface for AdminService testability (ARCH-04)
  - AdminService delegates credit mutations to ICreditService (no inline $transaction)
  - GET /admin/companies/:id/transactions audit log endpoint (CREDIT-03)
  - SwipeRepository.findUnlocksByJobAndCompany method
  - getRanking reveals full profile for unlocked DISLIKE candidates
affects: [phase-08, ranking, admin, credits, swipe]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ICreditService interface injection: AdminService depends on interface not concrete CreditRepository (ARCH-04)"
    - "Repository cross-model queries: SwipeRepository queries prisma.unlock directly without importing credits module (ARCH-04)"
    - "Audit log pattern: GET /admin/:resource/:id/transactions returns ordered CreditTransaction[]"

key-files:
  created: []
  modified:
    - src/modules/admin/admin.service.ts
    - src/modules/admin/admin.routes.ts
    - src/modules/swipe/swipe.repository.ts
    - src/modules/swipe/swipe.service.ts
    - tests/unit/swipe.service.test.ts
    - tests/integration/admin.test.ts
    - tests/integration/swipe.test.ts

key-decisions:
  - "AdminService uses ICreditService interface (not concrete CreditService type import) for ARCH-04 testability"
  - "SwipeRepository.findUnlocksByJobAndCompany queries prisma.unlock directly — repositories may cross Prisma models; modules may not import other modules"
  - "GET /admin/companies/:id/transactions uses admin-trusted IDOR disposition (T-07-03): admin role trusted to query any company"
  - "Prisma import kept in admin.service.ts for listUsers/getUserById; CreditService injected via constructor for adjustCredits"

patterns-established:
  - "Module isolation via interface injection: services depend on interfaces, not concrete implementations from other modules"
  - "Repository direct Prisma access: cross-model queries in repositories are acceptable; cross-module service imports are not"

requirements-completed: [CREDIT-03, CREDIT-04, ARCH-04, SEC-03]

# Metrics
duration: 35min
completed: 2026-05-02
---

# Phase 07 Plan 03: Credits Integration Summary

**AdminService refactored to ICreditService injection (ARCH-04), audit log endpoint added, and ranking now reveals unlocked DISLIKE candidates via SwipeRepository.findUnlocksByJobAndCompany**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-02T00:00:00Z
- **Completed:** 2026-05-02T00:35:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- AdminService.adjustCredits delegates to ICreditService.grantCredits — no more inline `prisma.$transaction` in AdminService (ARCH-04, D-14)
- GET /admin/companies/:id/transactions audit log endpoint implemented with admin-only access (CREDIT-03)
- SwipeRepository.findUnlocksByJobAndCompany queries prisma.unlock directly (ARCH-04: no credits module import in swipe module)
- getRanking now reveals full profile for DISLIKE candidates that have been unlocked, while still censoring non-unlocked DISLIKE candidates

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor AdminService + add audit log endpoint** - `2037ef6` (feat)
2. **Task 2: SwipeRepository.findUnlocksByJobAndCompany + getRanking reveal** - `82b4477` (feat)

_Note: TDD tasks — tests written first (RED), then implementation (GREEN)_

## Files Created/Modified

- `src/modules/admin/admin.service.ts` — Added ICreditService interface, constructor injection, removed inline $transaction from adjustCredits
- `src/modules/admin/admin.routes.ts` — Added CreditRepository/CreditService imports and injection, added GET /companies/:id/transactions route
- `src/modules/swipe/swipe.repository.ts` — Added findUnlocksByJobAndCompany method querying prisma.unlock directly
- `src/modules/swipe/swipe.service.ts` — getRanking now calls findUnlocksByJobAndCompany and uses unlockedCandidateIds in profile ternary
- `tests/unit/swipe.service.test.ts` — Added findUnlocksByJobAndCompany to makeRepo mock, default Set() in beforeEach, new DISLIKE reveal unit test
- `tests/integration/admin.test.ts` — Added prisma import, 3 new GET /admin/companies/:id/transactions tests
- `tests/integration/swipe.test.ts` — Added createUnlock import, 2 new integration tests (unlocked DISLIKE revealed, non-unlocked DISLIKE censored)

## Decisions Made

- ICreditService interface defined in `admin.service.ts` (not in a separate file) — keeps interface co-located with the consumer, ARCH-04 testability without extra files
- `prisma` import retained in `admin.service.ts` because `listUsers` and `getUserById` still use it directly; only `adjustCredits` delegates to ICreditService
- Audit log route uses module-level `import { prisma }` in `admin.routes.ts` rather than dynamic import — cleaner and consistent with the rest of the codebase
- `SwipeRepository.findUnlocksByJobAndCompany` uses comment `// SwipeService must never import from src/modules/credits/` for ARCH-04 documentation

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing failures in `tests/unit/company.service.test.ts` (2 tests) unrelated to this plan — `CompanyService.adjustCredits` uses `prisma.$transaction` directly making unit mocks of `repo.findById` ineffective. These failures existed before plan 07-03 and were not introduced by these changes. Logged as out-of-scope, not fixed.

## Known Stubs

None — all data sources fully wired. Rankings reveal actual unlock records from DB.

## Threat Flags

None — all security-relevant surfaces were addressed in the plan's threat model. GET /admin/companies/:id/transactions protected by `requireRole('ADMIN')` (T-07-03 accepted disposition).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 7 (Credits) is complete: Unlock model, CreditService, HTTP unlock endpoint, AdminService delegation, audit log, ranking reveal — all implemented and tested
- Full credits lifecycle operational: grant via admin, spend via unlock, audit via transactions endpoint, reveal via ranking
- ARCH-04 verified: swipe module has no imports from credits module; admin module depends on ICreditService interface

---
*Phase: 07-credits*
*Completed: 2026-05-02*
