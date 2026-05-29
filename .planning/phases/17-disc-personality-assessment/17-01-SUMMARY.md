---
phase: "17"
plan: "01"
subsystem: "disc-assessment"
tags: [prisma-schema, domain-layer, tdd-red, disc, personality-assessment]
dependency_graph:
  requires: []
  provides:
    - prisma/schema.prisma:DiscResult
    - src/domain/entities/disc-result.entity.ts
    - src/domain/interfaces/disc.repository.interface.ts
    - tests/unit/disc.use-cases.test.ts (RED)
  affects:
    - src/domain/entities/job.entity.ts
    - src/domain/interfaces/recommendation.repository.interface.ts
    - src/domain/interfaces/swipe.repository.interface.ts
    - src/adapters/repositories/swipe.repository.ts
    - tests/helpers/setup.ts
    - tests/unit/recommendation.service.test.ts
    - tests/unit/get-ranking.use-case.test.ts
tech_stack:
  added: []
  patterns:
    - Prisma upsert with @unique candidateId (onDelete Cascade)
    - Domain entity + interface without Prisma imports (ARCH-06)
    - TDD RED state via "Cannot find module" import stubs
    - SwipeWithCandidateInfo intersection type extension with discDominant
    - Optional field extension pattern for backward-compatible FitScoreInput/FitScoreJobInput
key_files:
  created:
    - prisma/schema.prisma (DiscResult model + Job.discProfile + CandidateProfile relation)
    - src/domain/entities/disc-result.entity.ts
    - src/domain/interfaces/disc.repository.interface.ts
    - tests/unit/disc.use-cases.test.ts (RED stubs)
  modified:
    - src/domain/entities/job.entity.ts (discProfile?: string | null)
    - src/domain/interfaces/recommendation.repository.interface.ts (discDominant?, discProfile?)
    - src/domain/interfaces/swipe.repository.interface.ts (discDominant: string | null in intersection)
    - src/adapters/repositories/swipe.repository.ts (discResult include + discDominant mapping)
    - tests/helpers/setup.ts (discResult.deleteMany before candidateProfile)
    - tests/unit/recommendation.service.test.ts (DISC D-05 test suite)
    - tests/unit/get-ranking.use-case.test.ts (DISC D-06 test suite)
decisions:
  - "discResult.deleteMany() inserted before candidateProfile.deleteMany() in setup.ts afterEach to respect FK constraint"
  - "SwipeRepository.findSwipesByJobId extended with discResult include and discDominant flattening as Rule 1 auto-fix (interface change caused compile error)"
  - "toJobDomain in SwipeRepository now maps discProfile field for completeness"
  - "DISC test stubs import from use case paths that do not exist yet (Wave 1) — RED state confirmed via Cannot find module"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-29"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 7
---

# Phase 17 Plan 01: DISC Schema, Domain Layer, and TDD RED Stubs Summary

**One-liner:** Prisma schema with DiscResult model pushed to dev DB; domain contracts (IDiscRepository, DiscResult entity, extended FitScoreInput/SwipeWithCandidateInfo) locked; 8 RED unit test stubs for SubmitDiscUseCase and GetDiscUseCase committed.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Prisma schema extension + db push | 51c0af9 | prisma/schema.prisma |
| 2 | Domain layer — entities, interfaces, extensions | 01c4030 | disc-result.entity.ts, disc.repository.interface.ts, job.entity.ts, recommendation.repository.interface.ts, swipe.repository.interface.ts, swipe.repository.ts |
| 3 | TDD RED — unit test stubs + teardown extension | 4974ae8 | tests/helpers/setup.ts, tests/unit/disc.use-cases.test.ts, tests/unit/recommendation.service.test.ts, tests/unit/get-ranking.use-case.test.ts |

## Verification Results

- `npx prisma validate` → exits 0 (schema valid)
- `npx tsc --noEmit` → exits 0 (no type errors)
- `npx jest tests/unit/disc.use-cases.test.ts --no-coverage` → FAIL with "Cannot find module" (RED confirmed)
- Existing 41 unit tests: PASS
- New DISC test cases: 3 FAIL (RED — computeFitScore and censorProfile not yet extended)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SwipeRepository type error after SwipeWithCandidateInfo extension**
- **Found during:** Task 2 — after extending `SwipeWithCandidateInfo.candidate` with `discDominant: string | null`, `tsc --noEmit` reported a type error in `swipe.repository.ts`
- **Issue:** `findSwipesByJobId` return mapping was missing `discDominant` — TypeScript reported the returned type was no longer assignable to `SwipeWithCandidateInfo[]`
- **Fix:** Added `discResult: { select: { dominant: true } }` to the Prisma include and added `discDominant: row.candidate.discResult?.dominant ?? null` to the candidate mapping (Pitfall 10 from research)
- **Files modified:** `src/adapters/repositories/swipe.repository.ts`
- **Commit:** 01c4030

**2. [Rule 1 - Bug] Added discProfile mapping to SwipeRepository.toJobDomain**
- **Found during:** Task 2 — completing the Job entity extension required the adapter to also map the new field
- **Fix:** Added `discProfile: row.discProfile ?? null` to `toJobDomain()` in `swipe.repository.ts`
- **Files modified:** `src/adapters/repositories/swipe.repository.ts`
- **Commit:** 01c4030

## Known Stubs

None — this plan creates RED test stubs intentionally. The missing implementations (SubmitDiscUseCase, GetDiscUseCase) are Wave 1 work. The failing DISC assertions in recommendation.service.test.ts and get-ranking.use-case.test.ts are also intentional RED states targeting Wave 1 implementation.

## Threat Flags

None — this plan adds no network endpoints or new trust boundary surfaces. The DiscResult model and domain interfaces are internal structures only. T-17-01 through T-17-06 are documented in the plan threat model and will be mitigated in Wave 1 (use cases, controller, routes).

## Self-Check: PASSED

- FOUND: prisma/schema.prisma
- FOUND: src/domain/entities/disc-result.entity.ts
- FOUND: src/domain/interfaces/disc.repository.interface.ts
- FOUND: tests/unit/disc.use-cases.test.ts
- FOUND: commit 51c0af9 (Prisma schema)
- FOUND: commit 01c4030 (domain layer)
- FOUND: commit 4974ae8 (TDD RED tests)
