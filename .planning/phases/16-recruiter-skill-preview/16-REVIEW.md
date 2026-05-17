---
phase: 16-recruiter-skill-preview
reviewed: 2026-05-17T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/application/use-cases/swipe/get-ranking.use-case.ts
  - src/infrastructure/http/routes/swipe.routes.ts
  - tests/unit/get-ranking.use-case.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-05-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the `GetRankingUseCase` with its Phase 16 pure helpers (`censorProfile`, `buildFitReasons`), the Fastify route registration module, and the corresponding unit test suite.

The pure-function logic for censoring profiles is correct and well-tested. The authorization chain (recruiter verification → job ownership → cache → repo) is in the right order. The main concerns are: one critical privacy leak where `candidateId` is exposed in the ranking payload for censored candidates, one type-safety gap where `profile: null` can escape the system via stale cache, one misleading edge-case output in `buildFitReasons`, and a missing route-level schema in the Fastify handler.

---

## Critical Issues

### CR-01: `candidateId` exposed for DISLIKE-locked (censored) candidates — privacy bypass

**File:** `src/application/use-cases/swipe/get-ranking.use-case.ts:175-180`

**Issue:** Every ranking item unconditionally includes `candidateId: swipe.candidateId`. When `profile` is a `CensoredProfile` (DISLIKE + not unlocked), the recruiter still receives the candidate's UUID. A recruiter can cross-reference this ID against any other endpoint (e.g., a public profile lookup, or a future user-search route) to de-anonymize the locked candidate. This defeats the entire purpose of `CensoredProfile` as defined in REC-03.

**Fix:** Omit `candidateId` from censored items, or substitute a non-resolvable opaque token:

```typescript
// In the map callback (lines 175-180), replace:
return {
  candidateId: swipe.candidateId,
  fitScore,
  distanceKm,
  profile,
}

// With:
const isRevealed = swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
return {
  ...(isRevealed ? { candidateId: swipe.candidateId } : {}),
  fitScore,
  distanceKm,
  rank: 0, // rank added later — placeholder here
  profile,
}
```

Update `RankingItem` type in `swipe.routes.ts` accordingly:
```typescript
export type RankingItem = {
  candidateId?: string  // present only for FullProfile (revealed) candidates
  fitScore: number
  distanceKm: number | null
  rank: number
  profile: RankingProfile
}
```

---

## Warnings

### WR-01: `profile: null` can escape the system via stale cache — type contract violation at runtime

**File:** `src/infrastructure/http/routes/swipe.routes.ts:12-20` and `src/application/use-cases/swipe/get-ranking.use-case.ts:124-126`

**Issue:** `RankingItem.profile` is typed as `RankingProfile` (non-nullable union of `FullProfile | CensoredProfile`). However, the cache `get` at line 125 of the use-case returns raw JSON via `JSON.parse(cached)` without any validation. If the cache contains a pre-Phase-16 entry where `profile` was `null`, the use-case returns it verbatim. The comment in `swipe.routes.ts` explicitly acknowledges this trade-off ("cached entries from before Phase 16 may return `profile: null` for up to 30s (TTL)"), but the TypeScript type does not reflect it, and no runtime guard exists. Any caller that does `result[0].profile.name` will crash with a null-dereference on stale entries.

**Fix — Option A (preferred):** Add a runtime guard after cache parse that strips entries with `profile: null`:

```typescript
const cached = await this.cache.get(cacheKey)
if (cached) {
  const parsed = JSON.parse(cached)
  // Guard against pre-Phase-16 cache entries where profile was null
  if (parsed.every((item: any) => item.profile != null)) {
    return parsed
  }
  // Stale cache — fall through to recompute
}
```

**Fix — Option B:** Update the type and document the nullability, so downstream callers null-check before access:

```typescript
export type RankingItem = {
  candidateId?: string
  fitScore: number
  distanceKm: number | null
  rank: number
  profile: RankingProfile | null  // null only in stale pre-Phase-16 cache entries
}
```

Option A is strongly preferred — it eliminates the class of runtime errors rather than exposing them to clients.

---

### WR-02: `buildFitReasons` emits misleading `"0/0 skills match"` when `job.requiredSkills` is empty

**File:** `src/application/use-cases/swipe/get-ranking.use-case.ts:44`

**Issue:** Line 44 unconditionally pushes the skill-count reason string:

```typescript
reasons.push(`${matchingSkills.length}/${job.requiredSkills.length} skills match`)
```

When `job.requiredSkills` is `[]`, this emits `"0/0 skills match"`, which is uninformative and arguably misleading (recruiter may interpret it as "0 out of a required set"). There is no test for this edge case.

**Fix:** Guard the skill reason against empty required-skills arrays:

```typescript
if (job.requiredSkills.length > 0) {
  reasons.push(`${matchingSkills.length}/${job.requiredSkills.length} skills match`)
} else {
  reasons.push('no required skills listed')
}
```

---

### WR-03: GET `/:jobId/ranking` route has no Fastify route-level schema — Zod validation is controller-only

**File:** `src/infrastructure/http/routes/swipe.routes.ts:39`

**Issue:** The route is registered without a `schema:` property:

```typescript
app.get('/:jobId/ranking', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.getRanking.bind(ctrl))
```

The `jobId` UUID validation does happen inside `SwipeController.getRanking` via `JobIdParamsSchema.parse(request.params)`, but the project security rules state "Inputs validados com Zod em todos os endpoints." The current implementation validates at the controller layer, not the route layer. The gap is: if the controller validation throws a Zod error, the error is not caught by the `DomainError` handler, and the raw Zod error propagates to the client (potentially leaking internal schema information). The `getFeed` route and `POST /` route have the same pattern for consistency, but this does not make it safe.

**Fix:** Add a `schema:` block to the Fastify route declaration, or wrap `JobIdParamsSchema.parse()` in a try/catch that converts `ZodError` to a `DomainError`:

```typescript
// In SwipeController.getRanking:
try {
  const { jobId } = JobIdParamsSchema.parse(request.params)
  // ...
} catch (err) {
  if (err instanceof z.ZodError) {
    reply.status(400).send({ error: 'Invalid job ID format', code: 'VALIDATION_ERROR' })
    return
  }
  throw err
}
```

---

## Info

### IN-01: Variable shadowing of `candidateProfile` in test file

**File:** `tests/unit/get-ranking.use-case.test.ts:52` and `tests/unit/get-ranking.use-case.test.ts:93`

**Issue:** `candidateProfile` is declared at module scope (line 52) as a `const`. The second `it` block ("fetches from repo on cache MISS...") at line 93 re-declares `const candidateProfile` in local scope, shadowing the outer. The inner declaration is identical in content to the outer except for being scoped. TypeScript strict mode (with `noShadow`) would flag this. It can cause confusion when future tests in the same `describe` block reference `candidateProfile` — some will use the outer, some the inner.

**Fix:** Remove the inner redeclaration in the second `it` block and use the module-scope `candidateProfile`:

```typescript
// Remove lines 93-105 (inner candidateProfile declaration)
// Use the module-scope candidateProfile directly in the mock setup at line 106
repo.findSwipesByJobId.mockResolvedValue([
  {
    id: 'swipe-1',
    candidateId: 'cand-1',
    jobId: 'job-1',
    direction: 'LIKE',
    swipedAt: new Date(),
    candidate: candidateProfile,  // now refers to module-scope fixture
  },
] as any)
```

---

### IN-02: Cache-hit test fixture uses `profile: null` — inconsistent with enforced type

**File:** `tests/unit/get-ranking.use-case.test.ts:75`

**Issue:** The cached ranking fixture used in the cache-HIT test has `profile: null`:

```typescript
const cachedRanking = [{ candidateId: 'cand-1', fitScore: 0.9, rank: 1, profile: null, distanceKm: null }]
```

This is intentional (testing the stale-cache trade-off documented in `swipe.routes.ts`), but it documents the null-escaping behavior rather than guarding against it. If WR-01 is fixed by adding a runtime guard in the use-case, this test should be updated to verify the guard triggers a cache miss and falls through to recompute, rather than returning the `null`-profile entry.

**Fix:** After implementing the WR-01 guard, update this test to assert that a cached entry with `profile: null` causes a cache miss (the guard discards the stale entry and falls through to repo calls):

```typescript
// After WR-01 fix: stale cache with profile:null should NOT short-circuit
expect(repo.findSwipesByJobId).toHaveBeenCalled()  // should be called, not skipped
```

---

_Reviewed: 2026-05-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
