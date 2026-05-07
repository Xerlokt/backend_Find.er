---
phase: 10-infrastructure-auth-migration
plan: 01
subsystem: infra
tags: [prisma, neo4j, fastify, jwt, helmet, cors, rate-limit, cron, clean-architecture]

# Dependency graph
requires:
  - phase: 09-domain-layer-scaffold
    provides: IRefreshTokenRepository interface, domain entities, application errors

provides:
  - src/infrastructure/database/prisma.ts — canonical PrismaClient singleton at infrastructure layer
  - src/infrastructure/database/neo4j.ts — canonical Neo4j Driver singleton at infrastructure layer
  - src/infrastructure/http/plugins/ — 6 plugin files (helmet, cors, jwt, rate-limit, scheduler, authenticate) at canonical infra locations
  - IRefreshTokenRepository.revokeByHash — method contract for atomic replay-attack detection
  - errorHandler.ts DomainError branch — first-check handling so auth use cases get correct HTTP responses

affects: [10-02, 10-03, 10-04, auth-use-cases, adapter-repositories, refresh-token-use-case]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Infrastructure directory layout: src/infrastructure/database/ + src/infrastructure/http/plugins/
    - Canonical import paths: adapters import prisma from ../../infrastructure/database/prisma
    - DomainError-first in errorHandler: instanceof DomainError checked before instanceof AppError
    - revokeByHash returns count for atomic replay detection without Prisma in use cases

key-files:
  created:
    - src/infrastructure/database/prisma.ts
    - src/infrastructure/database/neo4j.ts
    - src/infrastructure/http/plugins/helmet.plugin.ts
    - src/infrastructure/http/plugins/cors.plugin.ts
    - src/infrastructure/http/plugins/jwt.plugin.ts
    - src/infrastructure/http/plugins/rate-limit.plugin.ts
    - src/infrastructure/http/plugins/scheduler.plugin.ts
    - src/infrastructure/http/plugins/authenticate.hook.ts
  modified:
    - src/domain/interfaces/refresh-token.repository.interface.ts
    - src/shared/errors/errorHandler.ts

key-decisions:
  - "IRefreshTokenRepository.revokeByHash returns Promise<number> (count) — enables use cases to detect replay attacks (count===0) without importing Prisma directly"
  - "errorHandler.ts: DomainError branch added as FIRST check — prevents DomainError (which has statusCode property) from being swallowed by the generic statusCode-in-error fallback branch"
  - "authenticate.hook.ts copy keeps AppError (not DomainError) — errorHandler already handles AppError; switching would be premature and create no benefit in Phase 10"
  - "scheduler.plugin.ts path corrected from ../../modules to ../../../modules (3 levels up from src/infrastructure/http/plugins/)"
  - "authenticate.hook.ts AppError path corrected from ../errors/AppError to ../../../shared/errors/AppError (3 levels up)"

patterns-established:
  - "Infrastructure singleton pattern: exact copies of shared/ singletons at src/infrastructure/database/ — adapters/repositories import from canonical infra paths"
  - "Plugin naming convention: *.plugin.ts for Fastify plugins, *.hook.ts for preHandler hooks"
  - "DomainError-first error handler: all new use-case errors use DomainError; errorHandler checks it before AppError to preserve { error, code } response shape"

requirements-completed: [ARCH-09, ARCH-10, ARCH-11, ARCH-12]

# Metrics
duration: 15min
completed: 2026-05-07
---

# Phase 10 Plan 01: Infrastructure Directory Scaffold + Interface Extensions Summary

**8 infrastructure files created at canonical src/infrastructure/ locations; IRefreshTokenRepository extended with revokeByHash for atomic replay detection; errorHandler updated to handle DomainError before AppError**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-07T02:00:00Z
- **Completed:** 2026-05-07T02:15:00Z
- **Tasks:** 2
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- Created canonical `src/infrastructure/database/` directory with `prisma.ts` and `neo4j.ts` singletons — exact copies of `src/shared/db/` counterparts; all downstream adapters import from here
- Created `src/infrastructure/http/plugins/` with 6 files (helmet, cors, jwt, rate-limit, scheduler, authenticate) — scheduler path corrected to `../../../modules/` and authenticate AppError path corrected to `../../../shared/errors/AppError`
- Extended `IRefreshTokenRepository` with `revokeByHash(tokenHash: string): Promise<number>` — required by Wave 3 `RefreshTokenUseCase` to atomically detect replay attacks without importing Prisma
- Added `instanceof DomainError` as the FIRST branch in `errorHandler.ts` — ensures auth use-case errors include `{ error, code }` in the response body (DomainError would otherwise fall through to the generic `statusCode in error` check, omitting the `code` field)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend IRefreshTokenRepository + update errorHandler** - `84448a5` (feat)
2. **Task 2: Create infrastructure directory copies (database + plugins)** - `af6fdfb` (feat)

## Files Created/Modified
- `src/infrastructure/database/prisma.ts` — PrismaClient singleton (exact copy of src/shared/db/prisma.ts)
- `src/infrastructure/database/neo4j.ts` — Neo4j Driver singleton (exact copy of src/shared/db/neo4j.ts)
- `src/infrastructure/http/plugins/helmet.plugin.ts` — @fastify/helmet registration (exact copy)
- `src/infrastructure/http/plugins/cors.plugin.ts` — @fastify/cors registration (exact copy)
- `src/infrastructure/http/plugins/jwt.plugin.ts` — @fastify/jwt registration (exact copy)
- `src/infrastructure/http/plugins/rate-limit.plugin.ts` — @fastify/rate-limit registration (exact copy)
- `src/infrastructure/http/plugins/scheduler.plugin.ts` — node-cron job expiry check (copy; path corrected: `../../../modules/job/`)
- `src/infrastructure/http/plugins/authenticate.hook.ts` — FastifyJWT preHandler hook (copy; path corrected: `../../../shared/errors/AppError`)
- `src/domain/interfaces/refresh-token.repository.interface.ts` — added `revokeByHash(tokenHash: string): Promise<number>`
- `src/shared/errors/errorHandler.ts` — added DomainError import + instanceof branch as first check

## Decisions Made
- `revokeByHash` returns `Promise<number>` (count of rows updated) rather than `Promise<void>` — use cases need the count to distinguish replay attacks (count===0) from valid rotations (count===1) without importing Prisma
- errorHandler DomainError branch placed BEFORE AppError check AND before the generic `statusCode in error` fallback — `DomainError` has a `statusCode` property so the fallback would otherwise catch it and produce `{ error }` without `code`, breaking all auth error assertions
- authenticate.hook.ts keeps `AppError` — no behavioral change needed; switching to `DomainError` would be premature and add no value in Phase 10

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all files compiled clean on first attempt. Relative path corrections for scheduler and authenticate hook applied as specified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `src/infrastructure/database/prisma.ts` — ready for `src/adapters/repositories/` to import (`../../infrastructure/database/prisma`)
- `IRefreshTokenRepository.revokeByHash` — ready for `RefreshTokenUseCase` in Wave 3
- `errorHandler.ts` — handles `DomainError` correctly; auth use cases can throw `DomainError` and get proper HTTP status + `{ error, code }` body
- All 6 plugin files at canonical locations — ready for `src/app.ts` to optionally update plugin imports (Wave 4)
- Old `src/shared/` files untouched — existing integration tests remain green (additive changes only)

---
*Phase: 10-infrastructure-auth-migration*
*Completed: 2026-05-07*
