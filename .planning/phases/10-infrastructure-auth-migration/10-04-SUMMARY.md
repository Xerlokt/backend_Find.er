---
phase: 10-infrastructure-auth-migration
plan: 04
subsystem: auth
tags: [clean-architecture, auth-controller, fastify-routes, adapter-pattern, domain-error, rate-limit, integration-tests]

# Dependency graph
requires:
  - phase: 10-infrastructure-auth-migration
    plan: 03
    provides: RegisterUseCase, LoginUseCase, LogoutUseCase, RefreshTokenUseCase, LoginWithGoogleUseCase
  - phase: 10-infrastructure-auth-migration
    plan: 02
    provides: UserRepository, RefreshTokenRepository, BcryptAdapter, JwtAdapter

provides:
  - src/adapters/controllers/auth.controller.ts — AuthController with 5 handlers (register, login, refresh, logout, loginWithGoogle); Zod parse + use case instantiation + DomainError catch per handler
  - src/infrastructure/http/routes/auth.routes.ts — zero-logic Fastify route registrar; new AuthController(), 5 paths with rate limits, ctrl.method.bind(ctrl)
  - src/app.ts — swapped auth import from ./modules/auth/auth.routes to ./infrastructure/http/routes/auth.routes

affects: [phase-11-core-modules-migration, phase-13-cleanup-unit-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Controller pattern: each handler is stateless (new use case + adapters per request), no shared mutable state
    - DomainError defense-in-depth: explicit catch in every handler even though errorHandler.ts also handles DomainError
    - bind(ctrl) pattern: required for Fastify class method delegation to preserve 'this' context
    - JwtAdapter(request.server): FastifyInstance accessed via request.server for jwt.sign/verify decorations

key-files:
  created:
    - src/adapters/controllers/auth.controller.ts
    - src/infrastructure/http/routes/auth.routes.ts
  modified:
    - src/app.ts

key-decisions:
  - "Each AuthController handler instantiates new adapters per request — stateless design; no shared Prisma/bcrypt state on the class"
  - "DomainError caught explicitly in every handler as defense-in-depth even though errorHandler.ts handles it — both paths produce identical wire responses"
  - "ctrl.method.bind(ctrl) required in auth.routes.ts — without bind, 'this' inside handlers is undefined when Fastify calls the function"
  - "JwtAdapter receives request.server (not a stored app reference) — request.server is always the live FastifyInstance with all decorations registered"
  - "src/modules/auth/auth.routes.ts left untouched — additive migration; deleted in Phase 13 cleanup"

requirements-completed: [ARCH-09, ARCH-12]

# Metrics
duration: 8min
completed: 2026-05-07
---

# Phase 10 Plan 04: AuthController + Route Wiring Summary

**AuthController adapter wires 5 use cases to Fastify with Zod parsing and DomainError mapping; auth.routes.ts is a zero-logic delegator; app.ts import swapped — 134/134 integration tests green through new wiring**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-07T21:08:00Z
- **Completed:** 2026-05-07T21:30:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created `src/adapters/controllers/auth.controller.ts` — AuthController with 5 handlers (register/login/refresh/logout/loginWithGoogle); each handler does: Zod parse → new UseCase(new Adapter(), ...) → try/execute/send → DomainError catch → throw err; JwtAdapter(request.server) in 4 handlers
- Created `src/infrastructure/http/routes/auth.routes.ts` — thin Fastify plugin: new AuthController(), 5 POST routes with rate limits (3/5/10/global/5 req/min), ctrl.method.bind(ctrl); zero Zod, zero business logic
- Updated `src/app.ts` — single-line import swap: `./modules/auth/auth.routes` → `./infrastructure/http/routes/auth.routes`; src/modules/auth/auth.routes.ts untouched
- TypeScript compiles clean (npx tsc --noEmit exits 0)
- All 134 integration tests pass green (12 suites); 14 auth-specific tests confirm route wiring works end-to-end through new controller → use cases → adapters → Prisma

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AuthController and new auth.routes.ts** - `a75f5d6` (feat)
2. **Task 2: Update app.ts + verify all integration tests green** - `653c35d` (feat)

## Files Created/Modified

- `src/adapters/controllers/auth.controller.ts` — AuthController; 5 handler methods; Zod schemas (RegisterBodySchema, LoginBodySchema, RefreshBodySchema, LogoutBodySchema, GoogleBodySchema); DomainError catch in every handler (5 instances); new JwtAdapter(request.server) in 4 handlers; reply.status(201) for register+loginWithGoogle, 200 for login+refresh, 204 for logout
- `src/infrastructure/http/routes/auth.routes.ts` — authRoutes Fastify plugin; new AuthController(); 5 POST routes; rate limits: /register max:3, /login max:5, /refresh max:10, /logout global, /google max:5; all handlers use ctrl.method.bind(ctrl); zero Zod, zero logic
- `src/app.ts` — line 10 import changed from `./modules/auth/auth.routes` to `./infrastructure/http/routes/auth.routes`

## Decisions Made

- `AuthController` is fully stateless — new adapters are instantiated per request rather than stored on the class; prevents shared Prisma connection state across requests
- `DomainError` caught explicitly in every handler even though `errorHandler.ts` also handles it — defense-in-depth pattern; both paths produce identical `{ error, code }` wire format
- `ctrl.method.bind(ctrl)` required in `auth.routes.ts` — Fastify calls handlers with its own `this` context; without `.bind`, `this` inside each handler would be `undefined`
- `JwtAdapter(request.server)` — `request.server` provides the live FastifyInstance with `@fastify/jwt` decorations registered at app startup; this is the correct way to access jwt.sign in Fastify handler context
- `src/modules/auth/auth.routes.ts` preserved untouched — additive migration strategy; Phase 13 will delete old module files after all modules migrate

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Docker Desktop was stopped** — worktree Docker context pointed at non-running daemon. Started Docker Desktop, then started `postgres_test` container and `neo4j` container. Both needed for integration tests (134 tests = PostgreSQL + Neo4j). Not related to code changes.
- **No .env file in worktree** — worktrees do not inherit `.env` from main repo directory. Copied `.env` from main repo to worktree to provide `DATABASE_URL_TEST` for test runner. Not a code deviation.

## Threat Model Review

All STRIDE threats from plan mitigated:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-10-04-01 | MITIGATED — Zod schemas copied verbatim from src/modules/auth/auth.routes.ts; RegisterBodySchema, LoginBodySchema, RefreshBodySchema, GoogleBodySchema match exactly |
| T-10-04-02 | MITIGATED — Rate limits verified: max:3 (register), max:5 (login+google), max:10 (refresh) — matches original |
| T-10-04-03 | MITIGATED — `new JwtAdapter(request.server)` confirmed in 4 handlers; integration tests pass confirming jwt.sign works |
| T-10-04-04 | MITIGATED — `bind(ctrl)` confirmed in all 5 route registrations; auth tests pass confirming handlers execute with correct 'this' |
| T-10-04-05 | MITIGATED — `grep "infrastructure/http/routes/auth.routes" src/app.ts` returns match; 134 integration tests green |

## Known Stubs

None — all handlers are fully wired to concrete use cases and adapters.

## Next Phase Readiness

- Auth call chain fully migrated end-to-end: Fastify route → AuthController → Use case → Repository/Adapter → Prisma/bcrypt/jwt
- All 134 integration tests green confirming no regressions
- `src/modules/auth/` files untouched and available for other modules that may still reference them
- Phase 11 (Core Modules Migration) can proceed — auth is the template for the remaining module migrations

## Self-Check

- [x] `src/adapters/controllers/auth.controller.ts` — exists, exports AuthController, 5 handlers
- [x] `src/infrastructure/http/routes/auth.routes.ts` — exists, exports authRoutes, 5 routes with rate limits
- [x] `src/app.ts` — imports from `./infrastructure/http/routes/auth.routes`
- [x] Commit `a75f5d6` — Task 1 (AuthController + auth.routes.ts)
- [x] Commit `653c35d` — Task 2 (app.ts import swap)
- [x] `npx tsc --noEmit` exits 0
- [x] `npm run test:integration` — 134/134 tests pass

## Self-Check: PASSED

---
*Phase: 10-infrastructure-auth-migration*
*Completed: 2026-05-07*
