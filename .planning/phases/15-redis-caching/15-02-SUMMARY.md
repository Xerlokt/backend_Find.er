---
phase: 15-redis-caching
plan: "02"
subsystem: cache-implementation
status: complete
self_check: PASSED
tags: [redis, RedisAdapter, ioredis, ICachePort, tdd-green, prisma-migration]
dependency_graph:
  requires:
    - 15-01-SUMMARY.md (ICachePort interface, RED test contracts)
  provides:
    - RedisAdapter at src/adapters/services/redis.adapter.ts
    - getRedisClient singleton at src/infrastructure/database/redis.ts
    - GetFeedUseCase with cache injection (SCALE-01)
    - GetRankingUseCase with cache injection (SCALE-02)
    - RecordSwipeUseCase with cache.del invalidation (SCALE-01)
    - UpsertCandidateProfileUseCase with cache.invalidatePattern (SCALE-02)
    - Full cache wiring through controllers, routes, app.ts
    - Prisma schema with 4 SCALE-04 indexes (db push deferred — Docker not running)
tech_stack:
  added:
    - ioredis (RedisAdapter implementation, scanStream for invalidatePattern)
  patterns:
    - ICachePort dependency injection through constructor args
    - Redis-down fallthrough pattern: all cache calls wrapped in try/catch
    - Cache-aside pattern: get before source, set after compute
    - Composition root wiring: RedisAdapter instantiated once in app.ts
key_files:
  created:
    - src/infrastructure/database/redis.ts
    - src/adapters/services/redis.adapter.ts
  modified:
    - src/application/use-cases/swipe/get-feed.use-case.ts
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/application/use-cases/swipe/record-swipe.use-case.ts
    - src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts
    - src/adapters/controllers/swipe.controller.ts
    - src/adapters/controllers/candidate.controller.ts
    - src/infrastructure/http/routes/swipe.routes.ts
    - src/infrastructure/http/routes/candidate.routes.ts
    - src/app.ts
    - tests/unit/get-feed.use-case.test.ts
decisions:
  - RedisAdapter uses scanStream + pipeline for invalidatePattern (never KEYS * — blocks event loop)
  - Cache keys: feed:{candidateId} TTL 60s, ranking:{jobId} TTL 30s
  - Only first-page feed requests cached (no cursor); paginated pages bypass cache
  - All cache calls wrapped in try/catch for Redis-down resilience
  - Prisma db push deferred: Docker Desktop not running at execution time; schema.prisma already contains all 4 SCALE-04 indexes
metrics:
  duration: ~20min
  completed: 2026-05-17
  tasks: 3
  files: 11
---

## Summary

Wave 1 (GREEN) implementation: RedisAdapter with ioredis scanStream invalidation, getRedisClient singleton, ICachePort injected into all 4 use cases with cache-aside pattern and Redis-down fallthrough, full wiring from app.ts composition root through controllers and routes. All 57 unit tests pass GREEN.

## Tasks Completed

1. **RedisAdapter + redis.ts singleton** (commit 23bb91c) — Created `getRedisClient()` lazy-init singleton mirroring neo4j.ts pattern; created `RedisAdapter implements ICachePort` with `get`/`set`/`del`/`invalidatePattern` (scanStream + pipeline, never KEYS *). Both files were already created as part of the prior Task 1 commitment.

2. **ICachePort injection into 4 use cases** (commit 78445b6) — `UpsertCandidateProfileUseCase`: added `cache` as 2nd constructor arg, `invalidatePattern('ranking:*')` after `upsertProfile`. `RecordSwipeUseCase`: added `cache.del(feed:candidateId)` after `createSwipe`. `GetFeedUseCase` and `GetRankingUseCase` already had cache from Task 1. Fixed one test assertion bug (Rule 1): `nextCursor: expect.anything()` fails when `nextCursor` is `null` (valid value for last page) — changed to `toHaveProperty('nextCursor')`. All 16 targeted tests GREEN; 57 total unit tests GREEN.

3. **Full wiring + Prisma migration** (commit 8df6e80) — `SwipeController`: added `cache: ICachePort` to opts, passed `this.opts.cache` as 3rd arg to all 3 use cases. `CandidateController`: added `constructor(opts: { cache: ICachePort })`, wired to `UpsertCandidateProfileUseCase`. `swipe.routes.ts`: extended `SwipeRouteOpts` with `cache: ICachePort`. `candidate.routes.ts`: added `CandidateRouteOpts` type and `opts` parameter. `app.ts`: imported `RedisAdapter` and `getRedisClient`, instantiated `redisAdapter`, wired into 3 route registrations (swipeRoutes, swipeJobRoutes, candidateRoutes). Prisma `db push` deferred — Docker Desktop not running; SCALE-04 indexes already in `schema.prisma` from Plan 01.

## Verification

- `npx tsc --noEmit`: exits 0
- `npm run check:deps`: exits 0 (Dependency rule: OK)
- `npx jest tests/unit --runInBand --no-coverage`: exits 0 (57 tests, 13 suites — all GREEN)
- Prisma migration: SCALE-04 indexes present in schema.prisma; `db push` requires Docker (not running at execution time)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed failing test assertion for nextCursor**
- **Found during:** Task 2 test run
- **Issue:** `expect(result).toMatchObject({ data: expect.any(Array), nextCursor: expect.anything() })` fails when `nextCursor` is `null` — `expect.anything()` does not match `null` or `undefined`. With 1 mock job and `limit=20`, `hasNext=false` so `nextCursor=null` is correct behavior.
- **Fix:** Changed to `expect(result).toMatchObject({ data: expect.any(Array) })` + `expect(result).toHaveProperty('nextCursor')` — verifies the key exists without requiring a non-null value.
- **Files modified:** `tests/unit/get-feed.use-case.test.ts`
- **Commit:** 78445b6

### Infrastructure Deviations

**Prisma db push deferred — Docker Desktop not running**
- `npx prisma db push` requires PostgreSQL at `localhost:5432`
- Docker Desktop was not running during execution
- SCALE-04 indexes are already in `schema.prisma` (added in Plan 01)
- Migration will apply on next `prisma db push` or `prisma migrate dev` when Docker is up

## Key Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `src/infrastructure/database/redis.ts` | Created (Task 1) | `getRedisClient()` lazy-init singleton |
| `src/adapters/services/redis.adapter.ts` | Created (Task 1) | `RedisAdapter implements ICachePort` |
| `src/application/use-cases/swipe/get-feed.use-case.ts` | Modified (Task 1) | Cache-aside: feed:candidateId, TTL 60s |
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | Modified (Task 1) | Cache-aside: ranking:jobId, TTL 30s |
| `src/application/use-cases/swipe/record-swipe.use-case.ts` | Modified (Task 2) | cache.del(feed:candidateId) after swipe |
| `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | Modified (Task 2) | cache.invalidatePattern('ranking:*') after upsert |
| `src/adapters/controllers/swipe.controller.ts` | Modified (Task 3) | cache threaded through opts to 3 use cases |
| `src/adapters/controllers/candidate.controller.ts` | Modified (Task 3) | constructor(opts: { cache: ICachePort }) added |
| `src/infrastructure/http/routes/swipe.routes.ts` | Modified (Task 3) | SwipeRouteOpts extended with cache |
| `src/infrastructure/http/routes/candidate.routes.ts` | Modified (Task 3) | CandidateRouteOpts type + opts parameter |
| `src/app.ts` | Modified (Task 3) | RedisAdapter instantiated, wired to 3 routes |
| `tests/unit/get-feed.use-case.test.ts` | Modified (Task 2) | Fixed nextCursor assertion bug |

## Self-Check: PASSED

- src/infrastructure/database/redis.ts: exists, exports getRedisClient and closeRedis
- src/adapters/services/redis.adapter.ts: exists, implements ICachePort with scanStream
- src/app.ts: contains `new RedisAdapter(getRedisClient())` and `cache: redisAdapter` (3 registrations)
- All 4 use cases accept ICachePort constructor arg
- All cache calls wrapped in try/catch
- npx tsc --noEmit: exits 0
- npm run check:deps: exits 0
- npx jest tests/unit: 57 passed, 0 failed
