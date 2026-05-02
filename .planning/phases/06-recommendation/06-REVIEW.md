---
phase: 06-recommendation
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - scripts/seed-neo4j.ts
  - src/modules/recommendation/recommendation.repository.ts
  - src/modules/swipe/swipe.routes.ts
  - src/modules/swipe/swipe.service.ts
  - src/shared/db/neo4j.ts
  - src/shared/interfaces/recommendation.interface.ts
  - tests/helpers/neo4j-setup.ts
  - tests/integration/recommendation.test.ts
  - tests/integration/swipe.test.ts
  - tests/unit/recommendation.service.test.ts
  - tests/unit/swipe.service.test.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-05-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This phase implements the recommendation engine (fitScore computation), integrates it into the swipe feed and ranking endpoints, and provides full unit and integration test coverage. The architecture correctly uses a shared interface (`IRecommendationService`) to decouple the swipe module from the recommendation module, respecting ARCH-04. Security concerns (IDOR prevention, location privacy, input validation via Zod) are well handled.

Four warnings and four info items were found. No critical issues (no injection risks, no hardcoded secrets, no authentication bypasses, no data loss risks). The most notable warning is a Neo4j driver lifecycle issue in `swipe.routes.ts` that creates a new driver instance per request scope, and a type-safety gap (`as any`) in the service layer.

---

## Warnings

### WR-01: New Neo4j driver instance created on every route plugin registration

**File:** `src/modules/swipe/swipe.routes.ts:24` and `:44`

**Issue:** `getNeo4jDriver()` is called once per invocation of `swipeRoutes` and `swipeJobRoutes`. Fastify re-registers plugins in certain conditions (e.g., test isolation when `buildApp` is called multiple times). The singleton guard in `neo4j.ts` prevents duplicate TCP connections *within a single process*, but both route functions independently call `getNeo4jDriver()`, meaning if the driver is ever closed (e.g., `closeNeo4j()` called between tests), subsequent calls will throw rather than reconnect gracefully. More concretely, the two route handlers create two separate `RecommendationRepository` instances that both hold a reference to the same shared driver — this is safe today but fragile if driver teardown order changes.

**Fix:** Inject the driver (or the `RecommendationRepository`) as a Fastify decorator or plugin-level singleton rather than constructing it inline. Alternatively, document explicitly that `closeNeo4j()` must only be called after all route plugins are torn down:

```typescript
// In app.ts or a neo4j plugin:
app.decorate('neo4jDriver', getNeo4jDriver())

// In swipe.routes.ts:
const recRepo = new RecommendationRepository(app.neo4jDriver)
```

---

### WR-02: `as any` cast for `searchRadiusKm` hides missing field on `CandidateProfile`

**File:** `src/modules/swipe/swipe.service.ts:72`

**Issue:** `(candidate as any).searchRadiusKm ?? 50` bypasses TypeScript's type system to access a field that may not be present in the Prisma-generated type for `CandidateProfile`. If `searchRadiusKm` is nullable in the schema, this silently falls back to `50` even if the field was intentionally set to `null`. If the field does not exist on the model at all, TypeScript would normally flag this — the cast suppresses that protection. The same pattern appears in `getRanking` at line 109 without the cast, which suggests the type is inconsistent.

**Fix:** Verify `searchRadiusKm` is non-nullable in the Prisma schema (it is set without `?` in the integration test `create` call at `swipe.test.ts:35`, suggesting it is required). If so, remove the cast and access the field directly:

```typescript
searchRadiusKm: candidate.searchRadiusKm ?? 50,
// Remove the `(candidate as any)` wrapper — Prisma type should include the field
```

If the field is optional in the schema, update `CandidateData.searchRadiusKm` to `number | null` and handle the null explicitly in `computeFitScore` (which already does `candidate.searchRadiusKm > 0 ? candidate.searchRadiusKm : 50` at `recommendation.repository.ts:46`).

---

### WR-03: `swipe.service.ts` imports `RankingItem` directly from `job.routes.ts` — cross-module coupling

**File:** `src/modules/swipe/swipe.service.ts:4`

**Issue:** `import type { RankingItem } from '../job/job.routes'` breaks the module isolation rule (CLAUDE.md: "módulos não importam diretamente de outros módulos"). This is a type-only import so it causes no runtime issue, but it violates the architectural boundary and creates a compile-time dependency between the swipe and job modules. If `job.routes.ts` is ever refactored or split, this import silently breaks.

**Fix:** Move `RankingItem` (and its `distanceKm` extension) to the shared interfaces directory:

```typescript
// src/shared/interfaces/ranking.interface.ts
export interface RankingItem {
  candidateId: string
  fitScore: number
  distanceKm: number | null
  rank: number
  profile: Record<string, unknown> | null
}
```

Then import from `../../shared/interfaces/ranking.interface` in both `swipe.service.ts` and `job.routes.ts`.

---

### WR-04: `getRanking` skips the `job.isActive` / `job.expiresAt` guard present in `recordSwipe`

**File:** `src/modules/swipe/swipe.service.ts:93-95`

**Issue:** `recordSwipe` validates that the job is active and not expired before proceeding (lines 37-39). `getRanking` fetches the job only to verify recruiter ownership (line 95) — it does not check `isActive` or `expiresAt`. A recruiter can therefore retrieve ranking data for jobs that have since expired or been deactivated. Depending on product requirements this may be intentional (view historical rankings), but there is no comment indicating this is a deliberate design choice, and no integration test covers this edge case.

**Fix:** If expired/inactive jobs should still be rankable (read-only history), add a comment explicitly documenting the intent:

```typescript
// Intentionally allow ranking for inactive/expired jobs — recruiters may review
// historical swipe data after a job closes (REQ-xxx).
```

If they should not be rankable, add the guard:

```typescript
if (!job.isActive || job.expiresAt <= new Date()) {
  throw new AppError('Job not found', 404, 'NOT_FOUND')
}
```

---

## Info

### IN-01: `haversineKm` is implemented twice with different signatures

**File:** `src/modules/recommendation/recommendation.repository.ts:6` and `src/modules/swipe/swipe.service.ts:7`

**Issue:** The Haversine distance formula is duplicated. The `recommendation.repository.ts` version takes four `number` parameters and returns `number`. The `swipe.service.ts` version accepts `number | null` parameters and returns `number | null`. The duplication increases maintenance burden if the formula ever needs to change.

**Fix:** Extract a single implementation to a shared utility (e.g., `src/shared/utils/haversine.ts`) accepting nullable parameters and returning `number | null`. Both files can then import from the same source.

---

### IN-02: `swipe.service.ts` line 100 — `swipe: any` type annotation

**File:** `src/modules/swipe/swipe.service.ts:100`

**Issue:** The `swipes.map(async (swipe: any) => {` annotation at line 100 discards type information returned by `this.repo.findSwipesByJobId`. The Prisma return type for `findSwipesByJobId` (which includes `candidate` and nested `user`) is fully typed via the `include` clause in `swipe.repository.ts`. Using `any` here prevents TypeScript from catching property access errors (e.g., `swipe.candidate.searchRadiusKm`).

**Fix:** Derive or declare a type from the repository return:

```typescript
// Option: use Prisma utility type
import type { Prisma } from '@prisma/client'
type SwipeWithCandidate = Prisma.SwipeGetPayload<{
  include: { candidate: { include: { user: { select: { avatarUrl: true } } } } }
}>
// Then: swipes.map(async (swipe: SwipeWithCandidate) => {
```

---

### IN-03: Integration test in `recommendation.test.ts` calls `getNeo4jDriver().close()` in `afterAll` which closes the shared singleton

**File:** `tests/integration/recommendation.test.ts:35-37`

**Issue:** `afterAll(async () => { await getNeo4jDriver().close() })` closes the module-level singleton driver. If any test file imported after this one (within the same Jest worker) calls `getNeo4jDriver()`, it will attempt to use the already-closed driver. The `getNeo4jDriver` singleton in `neo4j.ts` does not reset the `driver` variable after `close()`, so subsequent calls return the closed instance rather than creating a new one.

**Fix:** Use `closeNeo4j()` from `src/shared/db/neo4j.ts` (which is already exported for this purpose) and note that Jest runs each test file in its own worker by default — but if `--runInBand` is used or workers are shared, this becomes a real issue. To be safe, reset the driver reference in `neo4j.ts` after closing:

```typescript
// src/shared/db/neo4j.ts
export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close()
    driver = undefined as unknown as Driver  // reset singleton so next call reconnects
  }
}
```

---

### IN-04: `tests/unit/swipe.service.test.ts` — `recRepo.computeFitScore.mockResolvedValue(0)` set after `jest.clearAllMocks()`

**File:** `tests/unit/swipe.service.test.ts:55`

**Issue:** The comment "set AFTER clearAllMocks — preserve existing test behaviors" acknowledges an ordering dependency that is subtle. `jest.clearAllMocks()` resets all mock return values, so `mockResolvedValue(0)` is immediately overridden per test by individual `mockResolvedValueOnce` calls. This is correct but creates a non-obvious setup where the baseline return value of `0` only applies to tests that do not supply their own mock. This works correctly but may confuse future contributors.

**Fix:** Either document this pattern with a clearer comment, or set the default return value in each relevant `beforeEach` at a finer-grained describe block scope rather than the top-level `beforeEach`. No behavior change needed — this is a readability improvement only.

---

_Reviewed: 2026-05-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
