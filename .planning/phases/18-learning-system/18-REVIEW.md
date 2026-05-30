---
phase: 18-learning-system
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - prisma/schema.prisma
  - src/adapters/controllers/swipe.controller.ts
  - src/adapters/repositories/weights.repository.ts
  - src/adapters/services/recommendation.repository.ts
  - src/app.ts
  - src/application/use-cases/swipe/get-feed.use-case.ts
  - src/application/use-cases/swipe/record-swipe.use-case.ts
  - src/application/use-cases/swipe/weights.constants.ts
  - src/domain/entities/candidate-weights.entity.ts
  - src/domain/interfaces/recommendation.repository.interface.ts
  - src/domain/interfaces/weights.repository.interface.ts
  - src/infrastructure/http/routes/swipe.routes.ts
  - tests/helpers/setup.ts
  - tests/integration/weights.test.ts
  - tests/unit/get-feed.use-case.test.ts
  - tests/unit/recommendation.service.test.ts
  - tests/unit/record-swipe.use-case.test.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-05-30
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The EMA weight learning system is architecturally clean: the application layer uses interfaces only, `weights.constants.ts` correctly avoids adapter imports, and the controller wires dependencies via injection. The EMA formula and renormalization math are correct. Float precision drift post-renormalization is bounded and the `Math.min(_, 100)` guard in `computeFitScore` handles the over-ceiling case. One critical race condition exists in the read-modify-write sequence of `RecordSwipeUseCase`, and four warnings cover a silent `likeCount` bug from that same race, a missing `discDominant` field in the feed score path, a wrong inline math comment in the unit test, and an import-ordering oddity in the domain interface file. Three info items cover the `toDomain(row: any)` typing, the `GetFeedUseCase` not passing `discDominant` to `computeFitScore`, and a test gap for concurrent LIKEs.

## Critical Issues

### CR-01: Race Condition in EMA Weight Read-Modify-Write (No Database Lock)

**File:** `src/application/use-cases/swipe/record-swipe.use-case.ts:111-152`

**Issue:** The EMA update sequence is: (1) `findByCandidateId` read, (2) compute new weights in application memory, (3) `upsertWeights` write. This is a non-atomic read-modify-write. Two concurrent LIKE swipes for the same candidate (possible at the rate-limit ceiling of 30/min) will both read the same `existing` record (or both read `null` on cold-start), compute independent EMA updates from the same baseline, and then race to write. The second write silently overwrites the first. The most concrete harm: on cold-start, both reads return `null`, both compute `likeCount = (null?.likeCount ?? 0) + 1 = 1`, and both upsert with `likeCount: 1`. The candidate accumulates 2 LIKEs of signal but the record shows `likeCount: 1`, permanently undercounting by one per racing pair. Over time this delays or blocks the `likeCount >= 5` personalization threshold.

**Fix:** Move the entire read-compute-write into a single Prisma `$transaction` with a pessimistic row lock, or use a PostgreSQL `UPDATE ... SET likeCount = likeCount + 1` atomic increment that bypasses the read. The cleanest approach given the existing `IWeightsRepository` interface is to add an `incrementAndUpsert` method that issues one `UPDATE ... RETURNING` (or Prisma raw) inside a transaction:

```typescript
// IWeightsRepository — add atomic method
atomicEmaUpdate(
  candidateId: string,
  observed: { profession: number; skills: number; location: number; modality: number; salary: number },
  alpha: number,
): Promise<CandidateWeights>
```

The repository implementation then:
```sql
-- Prisma $queryRaw inside a serializable transaction
INSERT INTO "CandidateWeights" (candidateId, ..., likeCount)
VALUES ($1, ..., 1)
ON CONFLICT (candidateId) DO UPDATE
  SET
    professionWeight = 0.1 * $observed_profession + 0.9 * "CandidateWeights".professionWeight,
    -- ... other weights ...
    likeCount = "CandidateWeights".likeCount + 1
RETURNING *;
```

This collapses the three-step sequence into one atomic statement, eliminating the race.

## Warnings

### WR-01: `discDominant` Not Passed to `computeFitScore` in `GetFeedUseCase`

**File:** `src/application/use-cases/swipe/get-feed.use-case.ts:51-73`

**Issue:** `computeFitScore` accepts a `FitScoreInput` that includes `discDominant?: string | null` (used in the DISC weight redistribution branch at `recommendation.repository.ts:96-103`). The `FitScoreInput` constructed in `GetFeedUseCase` does not include a `discDominant` field — it is not populated from the `candidate` object. Because `candidateProfile` returned by `findCandidateProfileByUserId` does not carry `discDominant` (that field lives on the `discResult` join, and the swipe repository flattens it as `discDominant` on the candidate object), this silently omits the DISC factor from feed scores even when the candidate has completed the DISC assessment and the job declares a `discProfile`. The result: `discDominant` is always `undefined`, `discScore` is always `0`, and a job requiring a matching DISC profile can never reach 100 in the feed — creating a silent, invisible scoring regression for DISC-enabled jobs.

**Fix:** Ensure `findCandidateProfileByUserId` in `ISwipeRepository` returns `discDominant` (it already does via `discResult?.dominant` in `swipe.repository.ts:92`). Then populate it in the `FitScoreInput` object:

```typescript
{
  id: candidate.id,
  professionId: candidate.professionId,
  skillIds: candidate.skills,
  preferredModalities: candidate.preferredModalities,
  salaryExpectation: candidate.salaryExpectation ?? null,
  lat: candidate.lat ?? null,
  lng: candidate.lng ?? null,
  searchRadiusKm: candidate.searchRadiusKm ?? 50,
  discDominant: candidate.discDominant ?? null,  // ADD THIS
} satisfies FitScoreInput,
```

Also add a unit test case in `get-feed.use-case.test.ts` covering the DISC field forwarding.

### WR-02: Wrong EMA Math Comment in Unit Test (Incorrect `sum` Value)

**File:** `tests/unit/record-swipe.use-case.test.ts:163`

**Issue:** The inline comment claims:
```
// raw (from GLOBAL_DEFAULTS): { profession:0.37, skills:0.315, location:0.28, modality:0.09, salary:0.095 }
// sum = 1.15; normalized profession = 0.37/1.15 ≈ 0.322 > 0.30 ✓
```
The actual computed values for the `professionOnlyJob` scenario (profession=1.0, skills=0.0, location=1.0 [both lat/lng null], modality=0.0, salary=1.0 [both salaryMin/Max null]) are:
- `raw.salary = 0.1 * 1.0 + 0.9 * 0.05 = 0.145` (not 0.095)
- `raw.sum = 0.37 + 0.315 + 0.28 + 0.09 + 0.145 = 1.20` (not 1.15)

The assertion `professionWeight > 0.30` is still correct (0.37/1.20 = 0.308 > 0.30) so the test passes, but the comment documents the wrong math. This is a maintenance hazard: someone debugging a future weight anomaly will trust the comment and get the wrong baseline.

**Fix:** Correct the comment:
```typescript
// observed = { profession:1.0, skills:0.0, location:1.0, modality:0.0, salary:1.0 }
// (location=1.0: both lat/lng null → job has no location → full credit)
// (salary=1.0: both salaryMin/Max null → open range → full credit)
// raw: { profession:0.37, skills:0.315, location:0.28, modality:0.09, salary:0.145 }
// sum = 1.20; normalized profession = 0.37/1.20 ≈ 0.308 > 0.30 ✓
```

### WR-03: Late Import Statement in Domain Interface File

**File:** `src/domain/interfaces/recommendation.repository.interface.ts:25`

**Issue:** `import { WeightSet } from './weights.repository.interface'` appears after the `FitScoreInput` and `FitScoreJobInput` interface declarations (lines 1-23). Imports placed after top-level declarations are hoisted by the TypeScript/Node module system and will not cause a runtime error, but this ordering violates the convention expected by ESLint import-order rules and creates a visual anomaly — a reader scanning the file sees three export blocks followed by an import. If `eslint-plugin-import` or `@typescript-eslint/consistent-type-imports` is added to the project, this will become a lint error.

**Fix:** Move the import to the top of the file with all other imports:
```typescript
import { WeightSet } from './weights.repository.interface'

export interface FitScoreInput { ... }
export interface FitScoreJobInput { ... }
export interface IRecommendationRepository { ... }
```

### WR-04: `WeightsRepository.toDomain` Uses `any` Typed Parameter

**File:** `src/adapters/repositories/weights.repository.ts:30`

**Issue:** `private toDomain(row: any): CandidateWeights` accepts `any`, bypassing TypeScript's structural check. If the Prisma schema renames a column (e.g., `professionWeight` → `profWeight`), the mapping will silently return `undefined` for that field rather than a type error. The Prisma-generated type for `CandidateWeights` is available directly.

**Fix:** Replace `any` with the Prisma model type:
```typescript
import type { CandidateWeights as PrismaCandidateWeights } from '@prisma/client'

private toDomain(row: PrismaCandidateWeights): CandidateWeights {
```

## Info

### IN-01: No Unit Test for `discDominant` Forwarding in Feed Score

**File:** `tests/unit/get-feed.use-case.test.ts`

**Issue:** The `personal weights cold-start` describe block tests the `likeCount` threshold correctly but does not assert that `discDominant` from the candidate profile is forwarded to `computeFitScore`. Given WR-01 identifies this as currently broken, a regression test is needed.

**Fix:** Add a test that mocks `findCandidateProfileByUserId` returning a profile with `discDominant: 'D'`, and asserts `computeFitScore` is called with a first argument containing `discDominant: 'D'`.

### IN-02: No Integration Test for Concurrent LIKE Scenario

**File:** `tests/integration/weights.test.ts`

**Issue:** The three integration tests cover sequential LIKE accumulation only. The race condition described in CR-01 (two concurrent LIKEs both seeing `likeCount: 0`) has no test. Without a concurrent test, the race will remain invisible until it surfaces in production.

**Fix:** Add a test that fires two LIKE requests in parallel (`Promise.all`) against two different jobs for the same candidate and then asserts `likeCount === 2`. This will currently fail (likeCount = 1), confirming CR-01, and will pass once the atomic upsert is implemented.

```typescript
it('LEARN-CONCURRENT: two simultaneous LIKEs yield likeCount=2 (no race condition)', async () => {
  const [{ job: job1 }, { job: job2 }] = await Promise.all([
    createRecruiterWithJob(company.id),
    createRecruiterWithJob(company.id),
  ])
  await Promise.all([
    supertest(app.server).post('/swipes').set('Authorization', `Bearer ${token}`)
      .send({ jobId: job1.id, direction: 'LIKE' }),
    supertest(app.server).post('/swipes').set('Authorization', `Bearer ${token}`)
      .send({ jobId: job2.id, direction: 'LIKE' }),
  ])
  const record = await prisma.candidateWeights.findUnique({ where: { candidateId: profile.id } })
  expect(record!.likeCount).toBe(2)
})
```

### IN-03: `swipe.controller.ts` Instantiates Use-Case Concrete Classes Directly

**File:** `src/adapters/controllers/swipe.controller.ts:39,54`

**Issue:** `new RecordSwipeUseCase(new SwipeRepository(), ...)` and `new GetFeedUseCase(new SwipeRepository(), ...)` construct `SwipeRepository` as concrete instantiations inside the controller. This means the controller has an implicit compile-time dependency on the adapter layer (`SwipeRepository`), which makes unit-testing the controller itself impractical without mocking module resolution. The architecture rules state services must not import DB clients directly, and while use-cases are not "services" in the strict sense, having the controller own repository construction creates a coupling that makes the controller untestable without the full stack.

**Fix:** Inject `ISwipeRepository` through the controller constructor options (alongside the existing `neo4j`, `chat`, `cache`, `weights` ports), and let `swipe.routes.ts` construct `new SwipeRepository()` as part of the composition root in `app.ts`. This aligns with the pattern already used for `WeightsRepository`, `ChatRepository`, and `Neo4jAdapter`.

---

_Reviewed: 2026-05-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
