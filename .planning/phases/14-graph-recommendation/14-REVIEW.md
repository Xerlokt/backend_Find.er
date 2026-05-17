---
phase: 14-graph-recommendation
reviewed: 2026-05-17T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/adapters/services/recommendation.repository.ts
  - src/application/use-cases/swipe/get-feed.use-case.ts
  - src/application/use-cases/swipe/get-ranking.use-case.ts
  - src/domain/interfaces/recommendation.repository.interface.ts
  - tests/helpers/factories.ts
  - tests/integration/candidate.test.ts
  - tests/integration/job-routes.test.ts
  - tests/integration/job.test.ts
  - tests/integration/recommendation.test.ts
  - tests/integration/swipe.test.ts
  - tests/unit/create-job.use-case.test.ts
  - tests/unit/recommendation.service.test.ts
  - tests/unit/upsert-candidate-profile.use-case.test.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 14: Code Review Report (post-fix re-review)

**Reviewed:** 2026-05-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This review covers the post-review code changes since commit `70e5e0e`:

1. **`src/adapters/services/recommendation.repository.ts`** — `min(length(path))` aggregation fix
   to prevent cycle paths from inflating `skillsScore` (the fix that prompted this re-review).
2. **`src/application/use-cases/swipe/get-feed.use-case.ts`** and
   **`src/application/use-cases/swipe/get-ranking.use-case.ts`** — Phase 14 convention comments
   added at `skillIds` assignment sites.

The min-path fix is correct and resolves the cycle-inflation bug. The convention comments are clear
and follow the existing inline-comment style.

All three post-review changes are clean. The previously noted `disableLosslessIntegers: true`
driver config (which invalidated WR-01/02/03 from the cross-AI review) remains in place and
unaffected. One warning and four info items from the prior review remain open; they are reproduced
below for completeness and to serve as the authoritative single REVIEW.md.

---

## Warnings

### WR-01: 26-loop `tx.run()` for RELATED\_TO pairs — cursor accumulation on retry

**File:** `src/adapters/services/recommendation.repository.ts:238-243`

**Issue:** `seedTaxonomy` issues 26 individual `tx.run()` calls inside `executeWrite`, one per
`related` pair. If Neo4j triggers a transient retry, the callback re-runs from the top, reopening
server-side cursors while the previous attempt's cursors may still be open. Under normal
conditions this is harmless, but under transient load or connection pool pressure it can exhaust
available connections. The skill and profession loops (lines 130-179) have the same pattern and
carry the same risk.

**Fix:** Batch all three relationship loops into single `UNWIND` queries:
```typescript
// Professions
await tx.run(
  'UNWIND $professions AS p MERGE (n:Profession {id: p.id}) SET n.name = p.name',
  { professions }
)

// Skills
await tx.run(
  'UNWIND $skills AS s MERGE (n:Skill {id: s.id}) SET n.name = s.name',
  { skills }
)

// REQUIRES
await tx.run(
  `UNWIND $requires AS r
   MATCH (p:Profession {id: r.profId}), (s:Skill {id: r.skillId})
   MERGE (p)-[:REQUIRES]->(s)`,
  { requires }
)

// RELATED_TO (bidirectional)
await tx.run(
  `UNWIND $related AS r
   MATCH (a:Skill {id: r.aId}), (b:Skill {id: r.bId})
   MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b)
   MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)`,
  { related }
)
```
This reduces round-trips dramatically and is retry-safe.

---

## Info

### IN-01: Duplicate `RELATED_TO` pair inflates claimed edge count in comment

**File:** `src/adapters/services/recommendation.repository.ts:227` and `235`

**Issue:** `{ aId: 'kotlin', bId: 'android' }` (line 227) and `{ aId: 'android', bId: 'kotlin' }` (line 235) are the same undirected pair. The Cypher `MERGE (a)-[:RELATED_TO]->(b) MERGE (b)-[:RELATED_TO]->(a)` for the first entry already creates both directed edges. The second entry is a no-op MERGE. The comment at line 201 claims "26 pairs × 2 directions = 52 directed edges" but there are 25 unique pairs yielding 50 directed edges. The integration test at `recommendation.test.ts:103` asserts `>= 50`, so tests still pass — but the comment is wrong.

**Fix:** Remove the duplicate entry at line 235, update the comment to "25 pairs × 2 = 50 directed edges", and optionally replace it with a new distinct pair to genuinely reach 26:
```typescript
// Remove line 235:
{ aId: 'android', bId: 'kotlin' },  // duplicate — remove

// Or replace with a new pair, e.g.:
{ aId: 'devops', bId: 'ci-cd' },
```

---

### IN-02: `satisfies FitScoreJobInput` at use-case call sites does not enforce field-name mapping

**File:** `src/application/use-cases/swipe/get-feed.use-case.ts:38-44`,
`src/application/use-cases/swipe/get-ranking.use-case.ts:51-57`

**Issue:** The `satisfies FitScoreJobInput` assertion verifies structural conformance at
compile-time, but the mapping `requiredSkillIds: job.requiredSkills` is between two `string[]`
fields with different names. If the Prisma `Job` model renames `requiredSkills` in a future
migration, the compiler will flag `job.requiredSkills` as `undefined` — but only if the Prisma
type is regenerated first. If someone manually patches the object without running codegen, the
mapping silently breaks. The Phase 14 convention comments added in this round help document the
intent, which is good — this item is now lower risk than before.

**Fix (optional):** Extract a named mapper function so the translation is a single tested unit:
```typescript
// In a shared adapter utility:
export function toFitScoreJobInput(job: PrismaJob): FitScoreJobInput {
  return {
    id: job.id,
    professionId: job.professionId,
    requiredSkillIds: job.requiredSkills, // Prisma field → interface field
    modality: job.modality,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    lat: job.lat ?? null,
    lng: job.lng ?? null,
  }
}
```

---

### IN-03: Several integration tests call `app.close()` outside `try/finally`

**File:** `tests/integration/swipe.test.ts` (multiple tests, e.g., lines 67-71, 80-86)

**Issue:** Most test cases in `swipe.test.ts`, `job-routes.test.ts`, `candidate.test.ts`, and
`job.test.ts` follow the pattern:
```typescript
const app = await buildApp({ testing: true })
await app.ready()
// ... assertions ...
await app.close()
```
If any assertion throws before `app.close()`, the Fastify instance is never closed. With Jest's
test isolation, this is generally benign (the process exits), but it can cause port-conflict
noise between tests and complicates debugging if `--runInBand` is used.

**Fix:** Wrap test bodies in `try/finally`:
```typescript
const app = await buildApp({ testing: true })
await app.ready()
try {
  // ... assertions ...
} finally {
  await app.close()
}
```
The `recommendation.test.ts:222-257` REC-03 test already uses this pattern correctly and serves
as the reference.

---

### IN-04: `haversineKm` integer rounding creates step-function near radius boundary

**File:** `src/application/utils/haversine.ts:16`

**Issue:** `Math.round(R * 2 * Math.atan2(...))` returns whole kilometers. In
`recommendation.repository.ts:74`, `locationScore = Math.max(0, 1 - distKm / radius)` with
integer `distKm` means a candidate at 49.9km and one at 50.1km both round to the same integer
and receive identical scores, while a candidate at exactly 50km gets 0.0. The step is not a bug
but creates a noticeable cliff in score distribution near the radius boundary. Note that
`get-ranking.use-case.ts:76-81` uses `haversineKm` to compute `distanceKm` for display — that
return value is also rounded to whole km, which may look odd in the UI for short distances.

**Fix (optional):** Remove `Math.round` to return a floating-point distance:
```typescript
return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
// Callers display with .toFixed(1) if needed.
```

---

_Reviewed: 2026-05-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
