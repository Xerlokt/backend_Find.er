---
phase: 18-learning-system
plan: "01"
type: execute
subsystem: learning-system
tags: [tdd, domain-layer, prisma, weights, ema]
dependency_graph:
  requires: []
  provides:
    - CandidateWeights domain entity (src/domain/entities/candidate-weights.entity.ts)
    - IWeightsRepository interface + WeightSet type (src/domain/interfaces/weights.repository.interface.ts)
    - GLOBAL_WEIGHT_DEFAULTS constants (src/application/use-cases/swipe/weights.constants.ts)
    - CandidateWeights Prisma model (prisma/schema.prisma)
    - TDD RED test stubs for LEARN-01/02/03 (3 unit test files)
  affects:
    - src/adapters/controllers/swipe.controller.ts (weights opt added)
    - src/infrastructure/http/routes/swipe.routes.ts (SwipeRouteOpts extended)
    - src/app.ts (no-op weightsRepository stub wired)
    - src/application/use-cases/swipe/record-swipe.use-case.ts (4-arg constructor)
    - src/application/use-cases/swipe/get-feed.use-case.ts (4-arg constructor)
    - src/domain/interfaces/recommendation.repository.interface.ts (weights? param added)
    - src/adapters/services/recommendation.repository.ts (weights? param signature)
tech_stack:
  added: []
  patterns:
    - TDD RED state (failing tests for not-yet-implemented EMA logic)
    - Domain entity + repository interface pair (DiscResult/IDiscRepository analog)
    - Prisma schema upsert pattern (DiscResult model analog)
    - Constructor injection of new port (4th arg pattern)
key_files:
  created:
    - src/domain/entities/candidate-weights.entity.ts
    - src/domain/interfaces/weights.repository.interface.ts
    - src/application/use-cases/swipe/weights.constants.ts
  modified:
    - prisma/schema.prisma
    - tests/unit/record-swipe.use-case.test.ts
    - tests/unit/get-feed.use-case.test.ts
    - tests/unit/recommendation.service.test.ts
    - src/application/use-cases/swipe/record-swipe.use-case.ts
    - src/application/use-cases/swipe/get-feed.use-case.ts
    - src/domain/interfaces/recommendation.repository.interface.ts
    - src/adapters/services/recommendation.repository.ts
    - src/adapters/controllers/swipe.controller.ts
    - src/infrastructure/http/routes/swipe.routes.ts
    - src/app.ts
decisions:
  - IWeightsRepository in domain/interfaces/ and WeightSet type co-located (single source of truth for domain layer)
  - GLOBAL_WEIGHT_DEFAULTS in application/ (not adapters/) to satisfy layer rule — application must not import from adapters/
  - computeFitScore extended with optional weights?: WeightSet (D-13) on both interface and adapter — backward-compatible (all existing callers unchanged)
  - No-op weightsRepository stub wired in app.ts for Plan 01 (Plan 02 replaces with concrete WeightsRepository adapter)
  - Constructor arity fix (4-arg) applied to RecordSwipeUseCase and GetFeedUseCase as part of TDD RED — tests compile, implementations do not call upsertWeights or pass personalWeights yet
metrics:
  duration: 7 minutes
  completed: 2026-05-30
  tasks_completed: 3
  files_created: 3
  files_modified: 11
---

# Phase 18 Plan 01: Domain Layer Foundation + TDD RED Summary

TDD Wave 0 domain contracts established — CandidateWeights entity, IWeightsRepository interface, WeightSet type, GLOBAL_WEIGHT_DEFAULTS constants, Prisma schema model, and 7 failing test stubs across 3 unit test files (RED state for LEARN-01/02/03).

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Domain layer — entity, interface, constants | `5b7d076` | candidate-weights.entity.ts, weights.repository.interface.ts, weights.constants.ts |
| 2 | Prisma schema — CandidateWeights model | `8b17a7b` | prisma/schema.prisma |
| 3 | TDD RED — failing test stubs for LEARN-01/02/03 | `dd34b12` | 3 test files + 8 source files (arity fixes + type system) |

## Tasks Executed

### Task 1: Domain layer — entity, interface, constants

Created three new files following Phase 17 DiscResult/IDiscRepository patterns:

- `src/domain/entities/candidate-weights.entity.ts` — `CandidateWeights` interface with 10 fields (id, candidateId, 5 weight floats, likeCount, createdAt, updatedAt)
- `src/domain/interfaces/weights.repository.interface.ts` — `WeightSet` type + `IWeightsRepository` interface with `upsertWeights` and `findByCandidateId` methods
- `src/application/use-cases/swipe/weights.constants.ts` — `GLOBAL_WEIGHT_DEFAULTS` as const (profession=0.30, skills=0.35, location=0.20, modality=0.10, salary=0.05)

TypeScript compiled cleanly after creating these files.

### Task 2: Prisma schema — CandidateWeights model

Two surgical edits to `prisma/schema.prisma`:

1. Added `candidateWeights CandidateWeights?` relation to `CandidateProfile` model (after discResult)
2. Appended `model CandidateWeights { ... }` block after DiscResult with all 11 fields, Float defaults for weights, and FK cascade delete

`npx prisma validate` exits 0. No `prisma db push` — migration deferred to Plan 04.

### Task 3: TDD RED — failing test stubs

Updated 3 test files + 8 source files:

**Test files (RED state):**
- `record-swipe.use-case.test.ts`: Added `makeWeightsRepo` factory, updated 5 existing tests to 4-arg constructor, added 4 EMA tests (3 RED: upsertWeights not yet called; 1 guard: DISLIKE correctly skips)
- `get-feed.use-case.test.ts`: Added `makeWeightsRepo` factory, updated 4 existing tests to 4-arg constructor, added 3 cold-start/personal-weights tests (all RED: computeFitScore still called without personalWeights)
- `recommendation.service.test.ts`: Added 2 personal-weights tests (1 RED: weights param ignored so personalScore not > globalScore; 1 guard: backward-compat with undefined works)

**Source files (arity fixes for tsc compliance):**
- `record-swipe.use-case.ts`: Constructor extended to accept `weights: IWeightsRepository` as 4th arg (stored, not yet used)
- `get-feed.use-case.ts`: Constructor extended to accept `weights: IWeightsRepository` as 4th arg (stored, not yet used)
- `recommendation.repository.interface.ts`: `computeFitScore` extended with `weights?: WeightSet` (D-13 contract)
- `recommendation.repository.ts`: `computeFitScore` signature extended; `weights` param accepted but ignored (RED for LEARN-03)
- `swipe.controller.ts`: `opts` type extended with `weights: IWeightsRepository`; use case instantiation updated to 4-arg
- `swipe.routes.ts`: `SwipeRouteOpts` extended with `weights: IWeightsRepository`
- `app.ts`: No-op `weightsRepository` stub wired (Plan 02 replaces with concrete `WeightsRepository`)

**Final test result:** 36 PASS, 7 FAIL (RED) — all failures are runtime assertion failures, not compile errors.

## Verification Results

```
npx tsc --noEmit     → exit 0 (clean)
npx prisma validate  → "The schema at prisma/schema.prisma is valid"
npx jest (3 files)   → 36 pass, 7 fail (RED — expected)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript arity errors propagated to controller, routes, and app.ts**

- **Found during:** Task 3
- **Issue:** Extending `RecordSwipeUseCase` and `GetFeedUseCase` constructors to 4-arg caused `swipe.controller.ts` and `app.ts` to fail `tsc --noEmit` with "Expected 3 arguments, but got 4" errors. The plan's acceptance criteria requires `tsc --noEmit` exits 0.
- **Fix:** Extended `SwipeController.opts` type and `SwipeRouteOpts` to include `weights: IWeightsRepository`; added no-op stub `weightsRepository` in `app.ts` (Plan 02 creates the concrete `WeightsRepository`); added `IWeightsRepository` import to `swipe.controller.ts`, `swipe.routes.ts`, and `app.ts`.
- **Files modified:** `src/adapters/controllers/swipe.controller.ts`, `src/infrastructure/http/routes/swipe.routes.ts`, `src/app.ts`
- **Commit:** `dd34b12` (included in Task 3 commit alongside test files)
- **Note:** The no-op stub in app.ts is intentionally temporary — `findByCandidateId` returns `null` (safe), `upsertWeights` throws (surfaced only on LIKE, acceptable in testing with no real DB). Plan 02 will replace this with `new WeightsRepository()`.

**2. [Rule 3 - Blocking] IRecommendationRepository.computeFitScore + RecommendationRepository signature extension required for test compilation**

- **Found during:** Task 3
- **Issue:** New test cases call `repo.computeFitScore(candidate, job, undefined)` and `repo.computeFitScore(candidate, job, personalWeights)` with 3 arguments, but the interface and adapter only had 2-parameter signatures.
- **Fix:** Extended `IRecommendationRepository.computeFitScore` with `weights?: WeightSet` (D-13 domain contract). Extended `RecommendationRepository.computeFitScore` signature to accept `weights?` but NOT implement it — the LEARN-03 test correctly remains RED because `weights` is ignored. This is architecturally correct per the plan.
- **Files modified:** `src/domain/interfaces/recommendation.repository.interface.ts`, `src/adapters/services/recommendation.repository.ts`
- **Commit:** `dd34b12`

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| No-op `weightsRepository` (upsertWeights throws, findByCandidateId returns null) | `src/app.ts` | Temporary — Plan 02 creates concrete `WeightsRepository` adapter and replaces this stub |
| `weights` param accepted but not used in `computeFitScore` | `src/adapters/services/recommendation.repository.ts` | Intentional RED state — Plan 02 implements the parametric weights logic |
| `weights` field stored in constructor but not used | `src/application/use-cases/swipe/record-swipe.use-case.ts` | Intentional RED state — Plan 02 implements EMA update |
| `weights` field stored in constructor but not used | `src/application/use-cases/swipe/get-feed.use-case.ts` | Intentional RED state — Plan 02 implements cold-start check |

These stubs are intentional TDD RED artifacts. Plans 02 and 03 will make all RED tests GREEN.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. All new files are domain-layer types and constants (compile-time only).

## Self-Check

- [x] `src/domain/entities/candidate-weights.entity.ts` exists with `export interface CandidateWeights`
- [x] `src/domain/interfaces/weights.repository.interface.ts` exists with `export type WeightSet` and `export interface IWeightsRepository`
- [x] `src/application/use-cases/swipe/weights.constants.ts` exists with `export const GLOBAL_WEIGHT_DEFAULTS`
- [x] `prisma/schema.prisma` contains `model CandidateWeights` and `candidateWeights CandidateWeights?` in CandidateProfile
- [x] Commit `5b7d076` exists
- [x] Commit `8b17a7b` exists
- [x] Commit `dd34b12` exists
- [x] 36 tests PASS, 7 tests FAIL (RED — correct)
- [x] `tsc --noEmit` exits 0
- [x] `prisma validate` exits 0

## Self-Check: PASSED
