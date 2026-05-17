---
phase: 16-recruiter-skill-preview
plan: "01"
subsystem: swipe/ranking
tags: [tdd, red-phase, recruiter-skill-preview, pure-functions, censoring]
dependency_graph:
  requires: []
  provides: [stub exports FullProfile CensoredProfile RankingProfile censorProfile buildFitReasons, 13 failing RED tests]
  affects: [tests/unit/get-ranking.use-case.test.ts, src/application/use-cases/swipe/get-ranking.use-case.ts]
tech_stack:
  added: []
  patterns: [TDD RED phase, named export stubs that throw, pure function design]
key_files:
  created: []
  modified:
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - tests/unit/get-ranking.use-case.test.ts
decisions:
  - censorProfile and buildFitReasons are pure functions (no side effects, no DB) exported from use-case file
  - RED stub functions throw Error with message ending in '— RED stub for Phase 16 TDD' to distinguish from real failures
  - Top-level candidateProfile fixture added to test file (non-breaking — local fixture inside cache-MISS test unchanged)
  - DISLIKE+unlocked use-case test passes with current implementation (existing code already reveals profile for unlocked candidates) — this is correct behavior, not a regression
metrics:
  duration: "~2m 23s"
  completed: "2026-05-17"
  tasks_completed: 2
  files_modified: 2
---

# Phase 16 Plan 01: Recruiter Skill Preview — TDD RED Phase Summary

**One-liner:** RED stubs for `censorProfile`/`buildFitReasons` with 13 new unit tests covering all candidate states and pure-function edge cases — forces 16-02 GREEN implementation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add stub exports to get-ranking.use-case.ts | 0e091b2 | src/application/use-cases/swipe/get-ranking.use-case.ts |
| 2 | Write RED unit tests | 32695e2 | tests/unit/get-ranking.use-case.test.ts |

## What Was Built

**Task 1 — Stub exports:**
Inserted a Phase 16 block between the import section and `GetRankingUseCase` class declaration in `get-ranking.use-case.ts`:
- `FullProfile` interface — identity fields (name, avatarUrl, bio, skills, professionId, preferredModalities, salaryExpectation)
- `CensoredProfile` interface — identity fields null, non-identity preview (matchingSkills, fitReasons)
- `RankingProfile` union type
- `buildFitReasons(candidate, job, matchingSkills): string[]` — throws RED stub
- `censorProfile(swipe, job, isUnlocked): FullProfile | CensoredProfile` — throws RED stub

**Task 2 — RED tests:**
Extended `tests/unit/get-ranking.use-case.test.ts` with:
- 6 `censorProfile()` pure function tests (LIKE reveal, DISLIKE+unlocked reveal, DISLIKE+locked censor, skill intersection, empty intersection, fitReasons format)
- 5 `buildFitReasons()` pure function tests (skill count string, salary in range, salary outside range, profession match, different profession)
- 2 use-case output integration tests (DISLIKE+locked → CensoredProfile, DISLIKE+unlocked → FullProfile)

## Verification Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Exit 0 — no type errors |
| Jest exit code | 1 (RED confirmed) |
| Pre-existing tests passing | 5 (4 original + DISLIKE-unlocked which already works) |
| New stub tests failing | 12 (all censorProfile/buildFitReasons tests + DISLIKE+locked use-case test) |

## TDD Gate Compliance

- RED gate commit: `test(16-01): add failing RED tests...` (32695e2) ✓
- GREEN gate: deferred to plan 16-02 (implementation phase)
- REFACTOR gate: deferred to plan 16-02 if applicable

## Deviations from Plan

**1. [Observation] DISLIKE+unlocked use-case test passes with current implementation**
- **Found during:** Task 2 verification
- **Issue:** Plan expected 13 failing tests; actual result is 12 failing, 5 passing. The "DISLIKE + unlocked" use-case test asserts `name === 'Alice'` — the current `GetRankingUseCase.execute()` already returns the full profile object for unlocked candidates (line 71-83 of use-case). This test passes without needing `censorProfile()`.
- **Impact:** None. The RED gate is still correct — all stub-dependent tests fail. The extra passing test validates existing behavior that 16-02 must preserve.
- **Fix:** None needed. Documented as expected behavior.

## Threat Flags

None — this plan adds only type exports and stub functions. No new network endpoints, auth paths, or schema changes introduced.

## Known Stubs

| File | Export | Reason |
|------|--------|--------|
| src/application/use-cases/swipe/get-ranking.use-case.ts | `censorProfile` | RED stub — implementation in plan 16-02 |
| src/application/use-cases/swipe/get-ranking.use-case.ts | `buildFitReasons` | RED stub — implementation in plan 16-02 |

These stubs are intentional (TDD RED phase). Plan 16-02 implements the bodies and achieves GREEN.

## Self-Check: PASSED

- [x] `src/application/use-cases/swipe/get-ranking.use-case.ts` exists and exports censorProfile, buildFitReasons
- [x] `tests/unit/get-ranking.use-case.test.ts` exists with new describe blocks
- [x] Commit 0e091b2 exists (feat stub exports)
- [x] Commit 32695e2 exists (test RED tests)
- [x] `tsc --noEmit` exits 0
- [x] Jest exits code 1 with 12 failing (RED stubs), 5 passing (4 pre-existing + 1 already-working)
