---
phase: 07-credits
plan: 01
subsystem: payments
tags: [prisma, postgresql, credits, unlock, haversine]

requires:
  - phase: 06-recommendation
    provides: fit-score engine and swipe service foundation

provides:
  - Unlock Prisma model with atomic @@unique constraint
  - CreditRepository with executeUnlock (atomic $transaction) and grantCredits
  - CreditService with full guard chain (FORBIDDEN/NOT_FOUND/CANDIDATE_ALREADY_VISIBLE/ALREADY_UNLOCKED/INSUFFICIENT_CREDITS)
  - haversineKm shared utility at src/shared/utils/haversine.ts
  - UNLOCK_COST_BY_PLAN constants (FREE=2, PRO=1)
  - createUnlock test factory + teardown setup

affects: [07-02, 07-03]

tech-stack:
  added: []
  patterns: [atomic-prisma-transaction, interface-injection, tdd-unit-mock-repo]

key-files:
  created:
    - prisma/migrations/20260502233139_add_unlock_model/migration.sql
    - src/modules/credits/credits.constants.ts
    - src/modules/credits/credits.repository.ts
    - src/modules/credits/credits.service.ts
    - src/shared/utils/haversine.ts
    - tests/unit/credit.service.test.ts
  modified:
    - prisma/schema.prisma
    - tests/helpers/factories.ts
    - tests/helpers/setup.ts

key-decisions:
  - "haversineKm extracted to shared utility (not duplicated) so both credits.routes.ts and future phases can import it"
  - "executeUnlock balance check runs INSIDE $transaction callback (first op) — prevents TOCTOU race"
  - "INSUFFICIENT_CREDITS thrown as plain Error inside transaction, caught and re-thrown as AppError 402 in service"

patterns-established:
  - "CreditRepository: thin DB layer, no AppError — throws plain Error for transaction-internal guards"
  - "CreditService: pre-transaction guard chain then atomic execution with P2002 catch"

requirements-completed: [CREDIT-01, CREDIT-02, CREDIT-03, CREDIT-04, SEC-03, ARCH-01]

duration: 25min
completed: 2026-05-02
---

# Phase 07-01: Credits Foundation Summary

**Unlock Prisma model with atomic $transaction credit deduction, CreditService guard chain, and haversineKm shared utility — 11 unit tests GREEN**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-02T23:00:00Z
- **Completed:** 2026-05-02T23:25:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Unlock model added to schema with `@@unique([companyId, candidateId, jobId])` and migration applied to dev+test DB
- CreditRepository with `executeUnlock` (atomic $transaction: balance check → decrement → create Unlock → create CreditTransaction) and `grantCredits`
- CreditService with 6-step guard chain: no recruiter → 403, job not found → 404, job not owned → 403, no swipe → 404, LIKE swipe → 422, already unlocked → 409, then cost lookup and P2002 catch → 409
- haversineKm extracted from swipe.service.ts to `src/shared/utils/haversine.ts`
- 11 unit tests GREEN (all guards + cost tiers + P2002 race condition)

## Task Commits

1. **Task 1: Schema + migration + factories + setup** — `ea2773a` (feat(07-01))

## Files Created/Modified
- `prisma/schema.prisma` — Unlock model + back-references on Company, CandidateProfile, Job
- `prisma/migrations/20260502233139_add_unlock_model/migration.sql` — Migration applied
- `src/modules/credits/credits.constants.ts` — UNLOCK_COST_BY_PLAN
- `src/modules/credits/credits.repository.ts` — CreditRepository with all DB methods
- `src/modules/credits/credits.service.ts` — CreditService with unlockCandidate + grantCredits
- `src/shared/utils/haversine.ts` — haversineKm shared utility
- `tests/unit/credit.service.test.ts` — 11 unit tests
- `tests/helpers/factories.ts` — createUnlock factory appended
- `tests/helpers/setup.ts` — prisma.unlock.deleteMany() added before creditTransaction

## Decisions Made
- haversineKm extracted (not duplicated) to keep a single source of truth — both credits and swipe can import
- Balance check inside $transaction (not before) to prevent TOCTOU
- Plain Error inside transaction, AppError in service catch — keeps repository free of HTTP concerns

## Deviations from Plan
- Prisma generate needed after migration (expected step, not in plan) — ran `npx prisma generate` to regenerate client types

## Issues Encountered
- `prisma.unlock` TypeScript error until `npx prisma generate` ran — resolved immediately

## Next Phase Readiness
- CreditService.unlockCandidate ready for HTTP layer (07-02)
- CreditService.grantCredits ready for AdminService delegation (07-03)
- haversineKm importable by credits.routes.ts for D-05 distanceKm

---
*Phase: 07-credits*
*Completed: 2026-05-02*
