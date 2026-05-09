---
phase: 11-core-modules-migration
plan: 04
subsystem: api
tags: [fastify, prisma, typescript, clean-architecture, admin, user-repository]

# Dependency graph
requires:
  - phase: 11-03
    provides: job module migration pattern, app.ts import swap pattern
  - phase: 11-02
    provides: CompanyRepository adapter, ICompanyRepository.getTransactions
  - phase: 09-domain-layer-scaffold
    provides: IUserRepository interface, User entity, ICompanyRepository interface, CreditTransaction entity
provides:
  - IUserRepository extended with findMany + findByIdPublic + UserPublic exported type
  - UserRepository implementing findMany and findByIdPublic with select projection excluding passwordHash/googleId
  - ListUsersUseCase, GetUserByIdUseCase, AdjustAdminCreditsUseCase (local ICreditGrantPort), GetTransactionsUseCase — no Prisma imports
  - AdminController with ICreditGrantPort via constructor; UserRepository/CompanyRepository instantiated per-handler
  - infrastructure/http/routes/admin.routes.ts accepting opts.creditService (ICreditGrantPort)
  - app.ts swapped to import from infrastructure layer; AdminService removed from composition root
affects: [12-swipe-credits-recommendation-chat-migration, 13-cleanup-unit-test-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ICreditGrantPort: local interface in use-case and controller/routes files — avoids importing CreditService from src/modules/credits/ (Phase 12 migration)"
    - "UserPublic = Omit<User, 'passwordHash' | 'googleId'> — domain type for admin-safe user projection"
    - "findMany/findByIdPublic use Prisma select projection that explicitly excludes passwordHash and googleId (T-11-04-02)"
    - "AdminController receives ICreditGrantPort via constructor (not per-handler) — composition root passes creditService from app.ts"

key-files:
  created:
    - src/application/use-cases/admin/list-users.use-case.ts
    - src/application/use-cases/admin/get-user-by-id.use-case.ts
    - src/application/use-cases/admin/adjust-admin-credits.use-case.ts
    - src/application/use-cases/admin/get-transactions.use-case.ts
    - src/adapters/controllers/admin.controller.ts
    - src/infrastructure/http/routes/admin.routes.ts
  modified:
    - src/domain/interfaces/user.repository.interface.ts
    - src/adapters/repositories/user.repository.ts
    - src/app.ts

key-decisions:
  - "ICreditGrantPort defined locally in adjust-admin-credits.use-case.ts and admin.controller.ts — avoids importing CreditService from src/modules/credits/ which is not migrated until Phase 12; TypeScript structural typing ensures compatibility (T-11-04-06)"
  - "UserPublic type exported from user.repository.interface.ts as Omit<User, 'passwordHash' | 'googleId'> — findMany and findByIdPublic return this safe projection; sensitive fields never reach the controller (T-11-04-02)"
  - "Old src/modules/admin/ files NOT deleted — additive migration pattern; cleanup deferred to Phase 13"
  - "Admin tests when run standalone show FK teardown race conditions (pre-existing); all 134 tests pass with --runInBand in full suite"

patterns-established:
  - "ICreditGrantPort local interface pattern: use-case file defines the port interface it depends on — avoids coupling to non-migrated module layers"

requirements-completed: [TEST-03]

# Metrics
duration: 12min
completed: 2026-05-08
---

# Phase 11 Plan 04: Admin Module Migration Summary

**Admin module migrated to Clean Architecture — IUserRepository extended with findMany/findByIdPublic (UserPublic projection), 4 use cases with zero Prisma imports, AdminController with ICreditGrantPort injection, admin.routes.ts in infrastructure layer — 134/134 integration tests green**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-08T00:00:24Z
- **Completed:** 2026-05-08T00:12:12Z
- **Tasks:** 2
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments

- IUserRepository extended with `findMany(opts)` and `findByIdPublic(id)` methods; `UserPublic = Omit<User, 'passwordHash' | 'googleId'>` exported from interface file
- UserRepository implements both new methods with Prisma `select` projection that explicitly excludes `passwordHash` and `googleId` (T-11-04-02 mitigated)
- 4 admin use cases created with zero Prisma imports in application layer:
  - `ListUsersUseCase`: delegates to `IUserRepository.findMany` with pagination
  - `GetUserByIdUseCase`: delegates to `IUserRepository.findByIdPublic`, throws NOT_FOUND if missing
  - `AdjustAdminCreditsUseCase`: uses local `ICreditGrantPort` interface (avoids importing from `src/modules/credits/`)
  - `GetTransactionsUseCase`: delegates to `ICompanyRepository.getTransactions`
- `AdminController` receives `ICreditGrantPort` via constructor from composition root; uses `new UserRepository()` / `new CompanyRepository()` per-handler
- `admin.routes.ts` in `infrastructure/http/routes/` accepts `opts.creditService: ICreditGrantPort`; all 4 routes gated by `[authenticate, requireRole('ADMIN')]` (T-11-04-01 mitigated)
- `app.ts`: `AdminService` import and instantiation removed; admin import swapped to infrastructure layer; register call uses `{ prefix: '/admin', creditService }` directly
- 134/134 integration tests pass through new wiring (all 12 suites)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend IUserRepository and update UserRepository** — `33774ce` (feat)
2. **Task 2: Create admin use cases, controller, routes, swap app.ts** — `1999953` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/domain/interfaces/user.repository.interface.ts` — Extended with `findMany`, `findByIdPublic` methods and `UserPublic` exported type
- `src/adapters/repositories/user.repository.ts` — Added `findMany` and `findByIdPublic` with select projection excluding sensitive fields
- `src/application/use-cases/admin/list-users.use-case.ts` — Paginates via `IUserRepository.findMany`
- `src/application/use-cases/admin/get-user-by-id.use-case.ts` — Returns `UserPublic`, throws NOT_FOUND
- `src/application/use-cases/admin/adjust-admin-credits.use-case.ts` — Local `ICreditGrantPort` interface; delegates to `grantCredits`
- `src/application/use-cases/admin/get-transactions.use-case.ts` — Delegates to `ICompanyRepository.getTransactions`
- `src/adapters/controllers/admin.controller.ts` — `AdminController` with constructor `ICreditGrantPort` injection; per-handler Zod validation
- `src/infrastructure/http/routes/admin.routes.ts` — `adminRoutes` with `opts.creditService`; all routes require ADMIN role
- `src/app.ts` — Removed `AdminService` import/instantiation; swapped admin import to infrastructure layer; `{ prefix: '/admin', creditService }`

## Decisions Made

- `ICreditGrantPort` defined locally in use-case and controller files — avoids importing `CreditService` from `src/modules/credits/` (not migrated until Phase 12); TypeScript structural typing ensures compatibility at compile time (T-11-04-06 accepted)
- `UserPublic` exported from `user.repository.interface.ts` as `Omit<User, 'passwordHash' | 'googleId'>` — provides a domain-level safe projection type for admin reads
- Old `src/modules/admin/` files NOT deleted — additive migration pattern; cleanup deferred to Phase 13

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Admin tests when run standalone (without `--runInBand`) showed FK teardown race conditions — same pre-existing issue noted in Plans 11-02 and 11-03. When run as part of the full integration suite with `--runInBand`, all 134 tests pass. Not caused by Plan 04 changes.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None.

## Threat Surface Scan

No new security-relevant surface beyond what was planned in the threat model. All 4 admin routes use `[authenticate, requireRole('ADMIN')]` (T-11-04-01). `findMany`/`findByIdPublic` select projections exclude `passwordHash` and `googleId` (T-11-04-02). All queries use Prisma ORM parameterized API (T-11-04-05).

## Next Phase Readiness

- Admin module fully migrated to Clean Architecture layers
- `src/modules/admin/` still present (not deleted) — Phase 13 cleanup removes it
- `app.ts` now imports admin, auth, candidate, company, recruiter, job from `infrastructure/` layer
- `app.ts` still imports swipe, credits, chat from `src/modules/` — Phase 12 migrates these
- All 134 integration tests green through new admin wiring
- Phase 11 (Core Modules Migration) is now complete — all 4 plans done

---
*Phase: 11-core-modules-migration*
*Completed: 2026-05-08*
