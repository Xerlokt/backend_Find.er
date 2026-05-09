---
phase: 11-core-modules-migration
plan: 02
subsystem: api
tags: [fastify, prisma, typescript, clean-architecture, company, credits]

# Dependency graph
requires:
  - phase: 11-01
    provides: CandidateRepository/RecruiterRepository adapter pattern, controller/routes patterns, app.ts import swap pattern
  - phase: 09-domain-layer-scaffold
    provides: ICompanyRepository interface, Company entity, CreditTransaction entity
provides:
  - ICompanyRepository extended with getTransactions(companyId) returning CreditTransaction[]
  - CompanyRepository adapter implementing all 4 ICompanyRepository methods with prisma.$transaction atomic credit guard
  - CreateCompanyUseCase, GetCompanyUseCase, AdjustCompanyCreditsUseCase (no Prisma imports)
  - CompanyController with create (201), getById (200), adjustCredits (200) handlers
  - infrastructure/http/routes/company.routes.ts with authenticate + requireRole preHandlers
  - app.ts swapped to import from infrastructure/http/routes/company.routes (modules/company no longer in app.ts)
affects: [11-03-job-migration, 11-04-admin-migration, 12-swipe-credits-recommendation-chat-migration, 13-cleanup-unit-test-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CompanyRepository.adjustCredits: prisma.$transaction with DomainError guards (not AppError) — atomic credit mutation pattern"
    - "getTransactions: direct Prisma query returning Prisma type that matches domain entity shape — no toDomain needed"
    - "ICompanyRepository.getTransactions: declared on interface for admin use case to call without importing Prisma"

key-files:
  created:
    - src/adapters/repositories/company.repository.ts
    - src/application/use-cases/company/create-company.use-case.ts
    - src/application/use-cases/company/get-company.use-case.ts
    - src/application/use-cases/company/adjust-company-credits.use-case.ts
    - src/adapters/controllers/company.controller.ts
    - src/infrastructure/http/routes/company.routes.ts
  modified:
    - src/domain/interfaces/company.repository.interface.ts
    - src/app.ts

key-decisions:
  - "ICompanyRepository.getTransactions declared on interface so admin use case can query transactions without importing Prisma directly (enables plan 04)"
  - "CompanyRepository.getTransactions returns Prisma rows directly — CreditTransaction entity shape matches Prisma model exactly, no toDomain needed"
  - "adjustCredits uses DomainError (not AppError) with reversed arg order: DomainError(message, code, statusCode)"
  - "Old src/modules/company/ files NOT deleted — additive migration pattern; cleanup deferred to Phase 13"

patterns-established:
  - "Atomic credit mutation: prisma.$transaction with balance check guard inside transaction, DomainError on INSUFFICIENT_CREDITS"
  - "Interface-first getTransactions: admin plan can extend company operations via ICompanyRepository without cross-module import"

requirements-completed: [TEST-03]

# Metrics
duration: 16min
completed: 2026-05-09
---

# Phase 11 Plan 02: Company Module Migration Summary

**Company module migrated to Clean Architecture with atomic $transaction credit adapter, getTransactions interface extension enabling admin plan, and all 134 integration tests passing through new wiring**

## Performance

- **Duration:** 16 min
- **Started:** 2026-05-09T00:00:00Z
- **Completed:** 2026-05-09T00:04:04Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- ICompanyRepository extended with getTransactions method (needed by admin plan 04 to query transactions without Prisma import)
- CompanyRepository adapter implementing all 4 interface methods; adjustCredits preserves prisma.$transaction atomic guard with DomainError (not AppError)
- Three company use cases with zero Prisma imports in application layer
- CompanyController following auth.controller.ts canonical pattern (Zod parse, inline instantiation, DomainError catch)
- companyRoutes in infrastructure/http/routes/ with authenticate + requireRole('ADMIN') preHandlers for create and adjustCredits
- app.ts import swapped from modules/company to infrastructure/http/routes — all 134 integration tests pass through new wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ICompanyRepository and create CompanyRepository adapter** - `4e8378a` (feat)
2. **Task 2: Create company use cases, controller, routes and swap app.ts import** - `37ea013` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/domain/interfaces/company.repository.interface.ts` - Added CreditTransaction import and getTransactions method declaration
- `src/adapters/repositories/company.repository.ts` - CompanyRepository implementing ICompanyRepository: create, findById, adjustCredits ($transaction + DomainError), getTransactions
- `src/application/use-cases/company/create-company.use-case.ts` - Delegates to repo.create, no DomainError needed
- `src/application/use-cases/company/get-company.use-case.ts` - Throws DomainError('NOT_FOUND') if company missing
- `src/application/use-cases/company/adjust-company-credits.use-case.ts` - Delegates to repo.adjustCredits (transaction-safety in adapter)
- `src/adapters/controllers/company.controller.ts` - Zod CreateCompanySchema + AdjustCreditsSchema, three handlers
- `src/infrastructure/http/routes/company.routes.ts` - POST/GET/:id/PATCH routes with authenticate + requireRole preHandlers
- `src/app.ts` - Import swapped from modules/company/company.routes to infrastructure/http/routes/company.routes

## Decisions Made
- ICompanyRepository.getTransactions declared on the interface so the admin use case (plan 04) can query credit transactions via the ICompanyRepository contract without importing Prisma directly
- CompanyRepository.getTransactions returns Prisma rows directly — the CreditTransaction entity shape exactly matches the Prisma creditTransaction model, so no toDomain mapping is needed
- DomainError argument order (message, code, statusCode) used — opposite from AppError (message, statusCode, code); both error cases in adjustCredits updated correctly
- Old src/modules/company/ files are NOT deleted — additive migration pattern; cleanup deferred to Phase 13

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The company integration test suite showed FK constraint teardown failures (RecruiterProfile_companyId_fkey) when run against leftover test DB state from previous runs. Confirmed this is a pre-existing issue — same failures exist on the baseline without plan 02 changes. Tests pass 134/134 on a clean DB run. Not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Company module fully migrated to Clean Architecture layers
- ICompanyRepository.getTransactions is now declared and implemented — admin plan (11-04) can call it without Prisma import
- app.ts still imports job, swipe, credits, admin, chat from src/modules/ — Phase 11 plans 03-04 will migrate job and admin
- All 134 integration tests green through new company wiring

---
*Phase: 11-core-modules-migration*
*Completed: 2026-05-09*
