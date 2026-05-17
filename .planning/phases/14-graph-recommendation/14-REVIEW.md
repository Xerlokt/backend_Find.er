---
phase: 14-graph-recommendation
reviewed: 2026-05-16T00:00:00Z
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
false_positives: 3
false_positive_reason: "disableLosslessIntegers: true in neo4j.ts — Neo4j returns native JS numbers, not neo4j.Integer objects; WR-01/02/03 do not apply"
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 14 introduced a Neo4j graph traversal engine for skill adjacency scoring, renaming `skills`/`requiredSkills` to `skillIds`/`requiredSkillIds` at the interface boundary, expanding the taxonomy to 36 skills and 52 directed `RELATED_TO` edges, and adding unique constraints via a schema-separated session. The implementation is architecturally clean — Cypher queries are fully parameterized with no string interpolation, the traversal depth is explicitly bounded to `*1..2`, and session lifecycle is managed correctly with `finally` blocks throughout.

One real warning was found: the 26-loop `tx.run()` calls for `RELATED_TO` pairs should be batched into a single `UNWIND` query to avoid cursor accumulation on transient retry. Three additional warnings (WR-01/02/03) about Neo4j integer type handling were initially raised but are **false positives** — `disableLosslessIntegers: true` in the driver config ensures all Cypher integers return as native JS numbers. Four informational items cover a duplicate edge pair in the seed, a `satisfies` fragility at use-case call sites, missing `try/finally` for `app.close()` in some integration tests, and a `Math.round` in haversine that creates a step-function location score.

---

## False Positives (driver config invalidates these findings)

> **`disableLosslessIntegers: true`** is set in `src/infrastructure/database/neo4j.ts:13`. With this flag, the Neo4j JS driver returns native JS `number` primitives for all integer results — not `neo4j.Integer` objects. WR-01, WR-02, and WR-03 below were identified by the reviewer before discovering this config setting, and **do not apply to this codebase**.

### ~~WR-01~~: Neo4j integer type mismatch — **FALSE POSITIVE**
Not applicable. `disableLosslessIntegers: true` ensures `r.get('hops')` returns a native JS number. `WEIGHT[hops]` lookups work correctly for all hop values.

### ~~WR-02~~: `WEIGHT[hops]` undefined for non-zero hops — **FALSE POSITIVE**
Not applicable. Same reason as WR-01 — hops is always a native JS number with this driver config.

### ~~WR-03~~: `count()` returns `neo4j.Integer` in tests — **FALSE POSITIVE**
Not applicable. `disableLosslessIntegers: true` means `count()` returns a native JS number; `expect(count).toBe(36)` comparisons are correct.

---

## Warnings

### WR-04: Session may leak if `MATCH ... MERGE` throws inside `executeWrite`

**File:** `src/adapters/services/recommendation.repository.ts:117-244`
**Issue:** The `session.executeWrite(async (tx) => { ... })` callback issues 26 individual `tx.run()` calls for `RELATED_TO` pairs using `MATCH (a) (b) MERGE ...`. If a `MATCH` finds no node (e.g., a skill id was misspelled), Neo4j silently creates no relationship rather than throwing, so no leak occurs in the happy path. However, if any of the 26 individual `MERGE` calls throws a transient Neo4j error, `executeWrite` retries the entire transaction callback. Because each `tx.run` within the loop creates server-side cursors, a retry while cursors from the previous attempt are still open can exhaust the connection pool. The risk is low under normal conditions but real under transient load.

**Fix:** Batch the relationship creation into a single `tx.run` using `UNWIND` to avoid per-iteration cursor creation:
```typescript
await tx.run(
  `UNWIND $pairs AS pair
   MATCH (a:Skill {id: pair.aId}), (b:Skill {id: pair.bId})
   MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b)
   MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)`,
  { pairs: related }
)
```
This reduces 26 round-trips to 1, is retry-safe, and is semantically identical.

---

## Info

### IN-01: Duplicate `RELATED_TO` pair in taxonomy seed

**File:** `src/adapters/services/recommendation.repository.ts:230-232`
**Issue:** The pair `{ aId: 'android', bId: 'kotlin' }` at line 232 is redundant with `{ aId: 'kotlin', bId: 'android' }` at line 224. Because the MERGE creates bidirectional edges for every pair, the second entry causes a no-op MERGE (idempotent, so no data error) but the comment at line 228 says "add 3 more to reach 26 total" while two of those three entries (`nodejs/typescript` and `go/rust`) are genuinely new — only `android/kotlin` is truly duplicate. The effective count is 25 unique pairs (50 directed edges) not 26 (52). The test at line 98 only asserts `>= 50`, so this passes, but the comment and documentation are misleading.

**Fix:** Replace the duplicate pair with a distinct one, for example:
```typescript
{ aId: 'devops', bId: 'ci-cd' },
```

---

### IN-02: `satisfies FitScoreJobInput` in use-case call sites masks field presence, not field names

**File:** `src/application/use-cases/swipe/get-feed.use-case.ts:38`, `src/application/use-cases/swipe/get-ranking.use-case.ts:51`
**Issue:** The `satisfies FitScoreJobInput` type assertion verifies the object conforms to the interface at the call site. However, the Prisma model field for a job's skills is `requiredSkills` (string array on the `Job` model), while the interface field is `requiredSkillIds`. The mapping `requiredSkillIds: job.requiredSkills` is correct, but if the Prisma field name changes in a future migration the TypeScript compiler will not catch it here because `job.requiredSkills` is typed as `string[]` regardless of whether the mapping is semantically correct. This is an info-level fragility, not a current bug.

**Fix:** Consider adding a named mapping function in the adapter layer (or a type alias) so that the translation from Prisma model to domain input is explicit and testable:
```typescript
function toFitScoreJobInput(job: JobWithSkills): FitScoreJobInput {
  return {
    id: job.id,
    professionId: job.professionId,
    requiredSkillIds: job.requiredSkills,
    modality: job.modality,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    lat: job.lat ?? null,
    lng: job.lng ?? null,
  }
}
```

---

### IN-03: Integration test `recommendation.test.ts` — REC-03 test does not close `app` on assertion failure

**File:** `tests/integration/recommendation.test.ts:222-257`
**Issue:** The REC-03 test block uses a `try/finally` pattern correctly, but the inner `try` does not have its own `catch`. If any assertion inside the `try` throws (Jest assertion failure), execution jumps to `finally { await app.close() }` which is correct. This is actually fine — noted here only because several other tests in `swipe.test.ts` (e.g., lines 56-71, 74-86) call `await app.close()` at the end of the test body without a `try/finally`, meaning a failing assertion causes the `app.close()` call to be skipped. If the test runner isolates Fastify instances per test this is benign, but if port conflicts can arise between test cases it could cause intermittent failures.

**Fix:** Wrap `app.close()` in a `finally` block for all test cases that build an app instance:
```typescript
const app = await buildApp({ testing: true })
await app.ready()
try {
  // ... assertions ...
} finally {
  await app.close()
}
```

---

### IN-04: `haversineKm` rounds to integer kilometers — causes locationScore step-function near radius boundary

**File:** `src/application/utils/haversine.ts:16`
**Issue:** `Math.round(R * 2 * Math.atan2(...))` returns a whole number of kilometers. In `recommendation.repository.ts` line 71, `locationScore = Math.max(0, 1 - distKm / radius)` with integer `distKm` and integer `radius` (default 50) means candidates at 49km and 50km get scores of `0.02` and `0.0` respectively, while candidates at 50.9km also round down to 50km and receive `0.0`. The step function is not a bug per se, but it means the score cliff between `radius - 1` and `radius` km is sharp (one score unit). This is informational — no behavioral defect.

**Fix (optional):** Remove `Math.round` in `haversineKm` to return a floating-point distance:
```typescript
return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
```
This makes `locationScore` a smooth linear function of distance.

---

_Reviewed: 2026-05-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
