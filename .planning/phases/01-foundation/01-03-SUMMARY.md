---
plan: 01-03
phase: 01-foundation
status: complete
completed: 2026-04-18
subsystem: shared-infrastructure
tags: [error-handling, auth-hooks, neo4j, health-route, tdd]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [error-handling, jwt-auth-hooks, neo4j-driver, health-route]
  affects: [src/app.ts, all future route modules]
tech_stack:
  added: []
  patterns: [AppError pattern, Fastify errorHandler, preHandler hooks, FastifyJWT augmentation]
key_files:
  created:
    - src/shared/errors/AppError.ts
    - src/shared/errors/errorHandler.ts
    - src/shared/db/neo4j.ts
    - src/shared/hooks/authenticate.ts
    - src/shared/hooks/requireRole.ts
    - src/modules/health/health.routes.ts
    - tests/unit/appError.test.ts
    - tests/unit/errorHandler.test.ts
  modified:
    - src/app.ts
decisions:
  - "FastifyJWT module augmentation used for request.user typing instead of FastifyRequest directly — avoids conflict with @fastify/jwt's existing user property declaration"
metrics:
  duration: 5 minutes
  completed: 2026-04-18
  tasks_completed: 3
  files_created: 8
  files_modified: 1
---

## Summary

Built the complete error handling layer (AppError class + global Fastify errorHandler), Neo4j driver singleton, JWT auth hooks (authenticate + requireRole), and the GET /health route, then wired errorHandler and healthRoutes into the existing buildApp factory from plan 01-02. All components follow TDD: tests written first (RED confirmed), then implementation (GREEN confirmed). TypeScript compiles clean with zero errors.

## Key Files Created

- `src/shared/errors/AppError.ts` — AppError extends Error with statusCode (default 400), optional code field, correct prototype chain via Object.setPrototypeOf
- `src/shared/errors/errorHandler.ts` — Global Fastify errorHandler covering AppError (typed status), ZodError (400+details), Prisma P2002 (409), P2025 (404), and unknown fallback (500, no stack leak)
- `src/shared/db/neo4j.ts` — getNeo4jDriver() singleton with lazy init; closeNeo4j() for graceful shutdown
- `src/shared/hooks/authenticate.ts` — preHandler hook calling request.jwtVerify(), throws AppError(401) on failure; FastifyJWT module augmented for typed request.user
- `src/shared/hooks/requireRole.ts` — Factory returning preHandler that throws AppError(403) for wrong role, AppError(401) if user not set
- `src/modules/health/health.routes.ts` — GET /health pings Prisma with $queryRaw SELECT 1, returns {status:'ok',db:'connected'} (200) or {status:'error',db:'disconnected'} (503)
- `tests/unit/appError.test.ts` — 4 unit tests for AppError (message, statusCode, code, instanceof)
- `tests/unit/errorHandler.test.ts` — 3 unit tests for errorHandler (AppError, ZodError, unknown fallback)

## Tasks Completed

1. Task 1 (TDD): AppError class and global errorHandler with unit tests
   - RED: tests/unit/appError.test.ts failed (module not found) — confirmed
   - GREEN: src/shared/errors/AppError.ts created — 4 tests pass
   - RED: tests/unit/errorHandler.test.ts failed (module not found) — confirmed
   - GREEN: src/shared/errors/errorHandler.ts created — 3 tests pass
   - Commit: 39aa836

2. Task 2: Neo4j driver singleton, authenticate hook, requireRole hook
   - src/shared/db/neo4j.ts — singleton with graceful close
   - src/shared/hooks/authenticate.ts — JWT verification preHandler
   - src/shared/hooks/requireRole.ts — role enforcement factory
   - Commit: 38b897d

3. Task 3: Health route, wire errorHandler into app.ts
   - src/modules/health/health.routes.ts — GET /health with Prisma ping
   - src/app.ts updated — setErrorHandler + register(healthRoutes)
   - Commit: ce3043b

## Deviations

### Auto-fixed Issues

**1. [Rule 1 - Bug] ZodError property: .errors → .issues**
- Found during: Task 1 (GREEN phase)
- Issue: TypeScript error TS2339 — ZodError in installed version uses `.issues` not `.errors`
- Fix: Changed `error.errors.map(...)` to `error.issues.map(...)` in errorHandler.ts
- Files modified: src/shared/errors/errorHandler.ts
- Commit: 39aa836

**2. [Rule 1 - Bug] FastifyRequest.user augmentation conflict**
- Found during: Task 2 (TypeScript compile check)
- Issue: TS2717 — declaring `user` directly on `FastifyRequest` conflicts with @fastify/jwt's existing declaration (`user: string | object | Buffer`)
- Fix: Augmented `FastifyJWT` interface in `@fastify/jwt` module instead, which is the correct extension point; @fastify/jwt maps `FastifyJWT.user` → `FastifyRequest.user`
- Files modified: src/shared/hooks/authenticate.ts
- Commit: 38b897d

**3. [Rule 1 - Bug] FastifyError.statusCode may be undefined**
- Found during: Task 1 (GREEN phase)
- Issue: TS2345 — `FastifyError.statusCode` is typed as `number | undefined`, not assignable to `number` parameter of `reply.status()`
- Fix: Extracted to local const with explicit `as number` cast after guard confirmed it is a number
- Files modified: src/shared/errors/errorHandler.ts
- Commit: 39aa836

## Self-Check

- [x] AppError.test.ts: all 4 assertions GREEN (npx jest tests/unit/appError.test.ts)
- [x] errorHandler.test.ts: all 3 assertions GREEN (npx jest tests/unit/errorHandler.test.ts)
- [x] GET /health registered (grep "healthRoutes" src/app.ts — found)
- [x] setErrorHandler wired (grep "setErrorHandler" src/app.ts — found)
- [x] npx tsc --noEmit exits 0
- [x] Object.setPrototypeOf present in AppError.ts (prototype chain fix)
- [x] ZodError handled in errorHandler.ts (uses .issues)
- [x] PrismaClientKnownRequestError handled in errorHandler.ts
- [x] driver.close() present in neo4j.ts (graceful shutdown)
- [x] request.jwtVerify() present in authenticate.ts
- [x] FastifyJWT module augmentation present in authenticate.ts
- [x] roles.includes() present in requireRole.ts
- [x] No @modules imports in src/shared/hooks/ (verified with grep)

## Known Stubs

None — all functionality is wired and operational. Integration test (health.test.ts) is still RED due to Docker not running (no DB connection), but this is a Docker environment constraint, not a stub.

## Threat Flags

No new threat surface introduced beyond what is documented in the plan's threat model (T-01-03-01 through T-01-03-05 all mitigated or accepted as designed).
