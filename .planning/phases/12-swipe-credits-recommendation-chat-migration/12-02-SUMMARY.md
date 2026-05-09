---
phase: 12-swipe-credits-recommendation-chat-migration
plan: "02"
subsystem: api
tags: [neo4j, credits, clean-architecture, prisma, fastify, atomic-transactions]

# Dependency graph
requires:
  - phase: 12-01
    provides: IChatPort at src/application/ports/chat.port.ts (needed by UnlockCandidateUseCase)
  - phase: 11
    provides: domain entities (Job, Swipe, Unlock, Company, CandidateProfile), ICreditRepository interface, DomainError, CandidateProfile entity
provides:
  - Neo4jAdapter wrapping RecommendationRepository (implements IRecommendationRepository)
  - UNLOCK_COST_BY_PLAN constant in application/use-cases/credits/
  - CreditRepository adapter with 7 ICreditRepository methods and atomic prisma.$transaction
  - UnlockCandidateUseCase with full business guard chain and IChatPort injection
  - GrantCreditsUseCase with positive-integer validation guard
  - CreditsController with response enrichment (candidateProfile + distanceKm)
  - creditsJobRoutes infrastructure route function
affects:
  - 12-03: Neo4jAdapter needed by swipe use cases (Plan 03)
  - 12-04: app.ts import swap for credits module

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Adapter wrapping inner repository with private readonly inner (no re-instantiation per call)
    - In-transaction TOCTOU protection for credit deduction with DomainError on P2002
    - Response enrichment as explicit controller concern (not business logic)
    - IChatPort constructor injection in use case (IChatPort from domain ports)
    - String literal 'DISLIKE' for SwipeDirection comparison (zero @prisma/client in use cases)

key-files:
  created:
    - src/adapters/services/neo4j.adapter.ts
    - src/application/use-cases/credits/credits.constants.ts
    - src/adapters/repositories/credit.repository.ts
    - src/application/use-cases/credits/unlock-candidate.use-case.ts
    - src/application/use-cases/credits/grant-credits.use-case.ts
    - src/adapters/controllers/credits.controller.ts
    - src/infrastructure/http/routes/credits.routes.ts
  modified: []

key-decisions:
  - "Neo4jAdapter stores RecommendationRepository instance as private readonly inner in constructor — FitScoreInput structural superset of CandidateData makes call compatible"
  - "UNLOCK_COST_BY_PLAN lives in application/use-cases/credits/ (not modules/) — application layer owns business constants"
  - "P2002 duplicate unlock caught inside prisma.$transaction in CreditRepository — never in use case layer (clean separation)"
  - "UnlockCandidateUseCase compares swipe.direction !== 'DISLIKE' via domain string literal, zero @prisma/client imports"
  - "CreditsController enrichment (candidateProfile + distanceKm) is explicit controller concern — documented with comment"

patterns-established:
  - "CreditRepository.$transaction pattern: read company inside tx, guard credits < cost (TOCTOU), update, try create unlock/creditTransaction, catch P2002 as DomainError"
  - "Use case guard chain: recruiter ownership check → job existence → swipe existence → direction guard → existing unlock → cost computation → executeUnlock → createOrGetChat"

requirements-completed:
  - ARCH-07
  - TEST-01

# Metrics
duration: 30min
completed: 2026-05-09
---

# Phase 12 Plan 02: Neo4jAdapter + Credits Module Migration Summary

**Neo4jAdapter wrapping RecommendationRepository, atomic CreditRepository with TOCTOU-protected $transaction, UnlockCandidateUseCase with IChatPort injection, GrantCreditsUseCase, CreditsController with distanceKm enrichment, and creditsJobRoutes — all @prisma/client-free in use cases**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-09T17:53:00Z
- **Completed:** 2026-05-09T18:23:35Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Neo4jAdapter delegates to RecommendationRepository via `private readonly inner` — no re-instantiation per call; TypeScript structural typing confirms FitScoreInput compatibility with CandidateData
- CreditRepository implements all 7 ICreditRepository methods; executeUnlock and grantCredits wrapped in prisma.$transaction with in-transaction credit sufficiency check preventing TOCTOU race conditions
- P2002 (duplicate unlock) caught inside the $transaction as DomainError('ALREADY_UNLOCKED', 409) — never bubbles to use case
- UnlockCandidateUseCase contains zero @prisma/client imports; direction compared as string literal 'DISLIKE'; full 6-step guard chain enforced
- GrantCreditsUseCase validates amount with Number.isInteger + > 0 before any repo call
- CreditsController enriches unlock response with candidateProfile + haversineKm distanceKm (explicitly documented as controller concern)

## Task Commits

1. **Task 1: Neo4jAdapter + credits constants + CreditRepository adapter** - `5497159` (feat)
2. **Task 2: Credits use cases + CreditsController + infrastructure credits.routes.ts** - `33e67ed` (feat)

**Plan metadata:** (to be added after state commit)

## Files Created/Modified
- `src/adapters/services/neo4j.adapter.ts` - Neo4jAdapter implementing IRecommendationRepository by wrapping RecommendationRepository
- `src/application/use-cases/credits/credits.constants.ts` - UNLOCK_COST_BY_PLAN constant (FREE: 2, PRO: 1)
- `src/adapters/repositories/credit.repository.ts` - CreditRepository implementing ICreditRepository with 2 atomic $transaction methods and DomainError throws
- `src/application/use-cases/credits/unlock-candidate.use-case.ts` - UnlockCandidateUseCase with ICreditRepository + IChatPort, zero Prisma imports
- `src/application/use-cases/credits/grant-credits.use-case.ts` - GrantCreditsUseCase with positive-integer validation
- `src/adapters/controllers/credits.controller.ts` - CreditsController with haversineKm enrichment and Zod param validation
- `src/infrastructure/http/routes/credits.routes.ts` - creditsJobRoutes function with IChatPort opts injection

## Decisions Made
- Neo4jAdapter stores RecommendationRepository as `private readonly inner` to avoid re-instantiation per call (structural delegation pattern)
- P2002 caught inside $transaction in CreditRepository so use case layer stays clean of Prisma error codes
- UnlockCandidateUseCase uses domain string literal 'DISLIKE' (not Prisma enum) — enforces ARCH-07 (no @prisma/client in use cases)
- Response enrichment kept in CreditsController with explicit comment — not business logic per architecture rules
- app.ts import swap deferred to Plan 04 per plan spec

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Neo4jAdapter is ready for Plan 03 (swipe use cases) to inject as IRecommendationRepository
- CreditRepository adapter ready for Plan 04 app.ts import swap
- creditsJobRoutes ready for Plan 04 registration in buildApp
- Integration tests will run in Plan 04 after app.ts import swap per plan spec

---
*Phase: 12-swipe-credits-recommendation-chat-migration*
*Completed: 2026-05-09*
