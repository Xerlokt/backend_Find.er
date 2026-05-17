---
phase: 15-redis-caching
reviewed: 2026-05-17T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - docker-compose.yml
  - package.json
  - prisma/schema.prisma
  - scripts/check-deps.ts
  - src/adapters/controllers/candidate.controller.ts
  - src/adapters/controllers/swipe.controller.ts
  - src/adapters/services/redis.adapter.ts
  - src/app.ts
  - src/application/ports/cache.port.ts
  - src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts
  - src/application/use-cases/swipe/get-feed.use-case.ts
  - src/application/use-cases/swipe/get-ranking.use-case.ts
  - src/application/use-cases/swipe/record-swipe.use-case.ts
  - src/infrastructure/database/redis.ts
  - src/infrastructure/http/routes/candidate.routes.ts
  - src/infrastructure/http/routes/swipe.routes.ts
  - tests/helpers/setup.ts
  - tests/integration/indexes.test.ts
  - tests/integration/swipe.test.ts
  - tests/jest.setup-env.ts
  - tests/unit/check-deps.test.ts
  - tests/unit/get-feed.use-case.test.ts
  - tests/unit/get-ranking.use-case.test.ts
  - tests/unit/record-swipe.use-case.test.ts
  - tests/unit/upsert-candidate-profile.use-case.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Phase 15 introduces Redis caching via the cache-aside pattern across three use cases (GetFeed, GetRanking, RecordSwipe) and one candidate use case (UpsertCandidateProfile). The architecture is clean: `ICachePort` is defined in the application layer, `RedisAdapter` lives in adapters, ioredis is kept out of use cases, and the SCAN-based `invalidatePattern` correctly avoids `KEYS *`. The test suite is well-structured with proper `flushdb` isolation in `afterEach` and dedicated integration tests for cache hit/invalidation flows.

Three warnings were found: `JSON.parse` called outside try/catch for both feed and ranking cached reads (corrupted cache entries cause unhandled 500s), and `closeRedis()` is never called on graceful shutdown, which is a resource leak in production. Four info items cover test coverage gaps and a minor production-environment concern.

No critical (security, data-loss, or crash-at-scale) issues were found.

---

## Warnings

### WR-01: `JSON.parse(cached)` outside try/catch in `GetFeedUseCase` — corrupted cache entry causes unhandled 500

**File:** `src/application/use-cases/swipe/get-feed.use-case.ts:22`

**Issue:** The try/catch on line 21 only protects the `await this.cache.get(cacheKey)` call. The `return JSON.parse(cached)` on line 22 is OUTSIDE the try block. If a cached value is malformed (e.g., truncated by Redis memory eviction under `allkeys-lru`, manually set via redis-cli, or partially written by a concurrent process), `JSON.parse` throws a `SyntaxError` that propagates unhandled to Fastify's error handler as a 500. The current resilience goal is that Redis failures should never degrade the user experience — but a bad cache value has the same failure mode as a hard Redis error, just with a different code path.

**Fix:**
```typescript
// get-feed.use-case.ts — lines 19-23
if (!cursor) {
  let cached: string | null = null
  try {
    cached = await this.cache.get(cacheKey)
    if (cached) return JSON.parse(cached)   // move JSON.parse inside try
  } catch {
    /* Redis down or corrupted value — fall through to source */
  }
}
```

---

### WR-02: `JSON.parse(cached)` outside try/catch in `GetRankingUseCase` — same corrupted-cache 500 path

**File:** `src/application/use-cases/swipe/get-ranking.use-case.ts:31`

**Issue:** Identical pattern to WR-01. Lines 29-31:
```typescript
let cached: string | null = null
try { cached = await this.cache.get(cacheKey) } catch { /* Redis down — fall through */ }
if (cached) return JSON.parse(cached)   // <-- outside try/catch
```
`JSON.parse` is called after the try block closes. A malformed string in the ranking cache throws an unhandled `SyntaxError`.

**Fix:**
```typescript
// get-ranking.use-case.ts — lines 29-31
let cached: string | null = null
try {
  cached = await this.cache.get(cacheKey)
  if (cached) return JSON.parse(cached)   // move inside try
} catch {
  /* Redis down or corrupted value — fall through */
}
```

---

### WR-03: `closeRedis()` never called on graceful shutdown — connection leak in production

**File:** `src/infrastructure/database/redis.ts:13`, `src/app.ts:58`

**Issue:** `getRedisClient()` creates a singleton ioredis connection. `src/app.ts` calls `getRedisClient()` at line 58 (via `new RedisAdapter(getRedisClient())`) but never registers a shutdown hook to call `closeRedis()`. `closeRedis()` exists and is exported but is only called in test setup (`tests/helpers/setup.ts:21`). In production, when the process receives `SIGTERM`, the ioredis client will not send `QUIT` to the Redis server before the process exits. For short-lived functions this is harmless, but for long-running processes under a process manager (PM2, systemd) with connection limits, leaked connections accumulate across restarts.

**Fix:** In the production server entrypoint (`src/server.ts` — not in scope for this review but the hook should be registered there), or in `buildApp`:
```typescript
// src/app.ts — after app is built, register cleanup
app.addHook('onClose', async () => {
  await closeRedis()
})
```
Import `closeRedis` from `./infrastructure/database/redis`.

---

## Info

### IR-01: Unit tests don't cover `cache.set` rejection fallthrough in `GetFeedUseCase`

**File:** `tests/unit/get-feed.use-case.test.ts`

**Issue:** There is a unit test for `cache.get` throwing (Redis down fallthrough on read), but no test for `cache.set` throwing. The implementation wraps `cache.set` in its own try/catch (line 61 of the use case), which silently swallows the error. The behavior is correct, but the test suite does not verify it — a refactor that accidentally removes the `set` try/catch would not be caught by unit tests.

**Fix:** Add a test case:
```typescript
it('does not throw when cache.set throws (Redis error on write)', async () => {
  const repo = makeSwipeRepo()
  const rec = makeRecRepo()
  const cache = makeCache()
  repo.findCandidateProfileByUserId.mockResolvedValue(candidateProfile as any)
  repo.findFeedJobs.mockResolvedValue([jobItem] as any)
  rec.computeFitScore.mockResolvedValue(0.75)
  cache.set.mockRejectedValue(new Error('Redis READONLY'))

  const uc = new GetFeedUseCase(repo, rec, cache)
  await expect(uc.execute('user-1', undefined, 20)).resolves.toMatchObject({ data: expect.any(Array) })
})
```

---

### IR-02: Unit tests don't cover `invalidatePattern` rejection fallthrough in `UpsertCandidateProfileUseCase`

**File:** `tests/unit/upsert-candidate-profile.use-case.test.ts`

**Issue:** The use case wraps `cache.invalidatePattern('ranking:*')` in a try/catch that silently swallows errors (line 28 of the use case). There is no unit test verifying that the use case still returns the profile when `invalidatePattern` rejects (Redis down scenario). A future refactor removing the try/catch would not be caught by tests.

**Fix:** Add a test case:
```typescript
it('returns profile even when cache.invalidatePattern throws (Redis down)', async () => {
  const repo = makeRepo()
  const cache = makeCache()
  const mockProfile = { id: 'cand-1', userId: 'user-1', name: 'Alice' }
  repo.upsertProfile.mockResolvedValue(mockProfile as any)
  cache.invalidatePattern.mockRejectedValue(new Error('Redis connection refused'))

  const uc = new UpsertCandidateProfileUseCase(repo, cache)
  const result = await uc.execute('user-1', { name: 'Alice', professionId: 'backend-dev', skills: ['nodejs'], preferredModalities: ['REMOTE'] } as any)
  expect(result).toEqual(mockProfile)
})
```

---

### IR-03: `invalidatePattern` pattern is caller-supplied but unescaped — future risk if called with user input

**File:** `src/adapters/services/redis.adapter.ts:21`

**Issue:** `scanStream({ match: pattern })` receives the pattern string directly from the caller without escaping glob characters (`*`, `?`, `[`, `]`). Currently all callers pass hardcoded string literals (`'ranking:*'`), so there is no injection risk today. If a future caller constructs the pattern from user-provided data (e.g., a job ID from a request body), unescaped glob characters in the input could match unintended keys. This is a latent risk, not a present vulnerability.

**Fix:** Document the contract in the `ICachePort` interface to make the responsibility explicit, or add a guard in the adapter:
```typescript
// Option A — document in ICachePort (cache.port.ts):
/**
 * Invalidates all keys matching the given glob pattern.
 * WARNING: pattern must be a server-controlled string — never pass user input directly.
 */
invalidatePattern(pattern: string): Promise<void>

// Option B — sanitize in the adapter if user input is ever expected:
private escapeGlob(s: string): string {
  return s.replace(/[*?[\]]/g, '\\$&')
}
```

---

### IR-04: Redis services in `docker-compose.yml` have no password — ensure `REDIS_URL` is set in production

**File:** `docker-compose.yml:33-41`, `src/infrastructure/database/redis.ts:7`

**Issue:** Both `redis` and `redis_test` Docker services run without `requirepass`, which is appropriate for local development. The `getRedisClient()` function falls back to `redis://localhost:6379` when `REDIS_URL` is not set. If a production environment accidentally omits `REDIS_URL`, the app silently connects to an unauthenticated local Redis (or fails to connect and falls through on every cache call). There is no startup-time assertion that `REDIS_URL` is set in non-development environments.

**Fix:** Add an environment validation at startup for production mode (e.g., in `src/server.ts`):
```typescript
if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL must be set in production')
}
```

---

_Reviewed: 2026-05-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
