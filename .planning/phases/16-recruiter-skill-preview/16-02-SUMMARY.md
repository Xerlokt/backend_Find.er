---
phase: 16-recruiter-skill-preview
plan: "02"
subsystem: swipe/ranking
tags: [tdd, green-phase, recruiter-skill-preview, pure-functions, censoring, information-disclosure]
dependency_graph:
  requires: [16-01 — RED stubs and failing tests]
  provides: [implemented censorProfile, implemented buildFitReasons, RankingItem type, 17 green tests]
  affects:
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/infrastructure/http/routes/swipe.routes.ts
tech_stack:
  added: []
  patterns: [TDD GREEN phase, pure function with single responsibility, inline import() for type-only cross-module reference]
key_files:
  created: []
  modified:
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/infrastructure/http/routes/swipe.routes.ts
decisions:
  - censorProfile() is the single code path for reveal/conceal — inline ternary removed from execute()
  - matchingSkills computed as candidate.skills.filter(s => job.requiredSkills.includes(s)) — candidate-first direction (T-16-02-02 mitigated)
  - RankingItem uses inline import() expression for RankingProfile to avoid circular import risk at top level
  - profile is never null for any swipe state — CensoredProfile replaces old null for DISLIKE-locked candidates
metrics:
  duration: "~2m"
  completed: "2026-05-17"
  tasks_completed: 3
  files_modified: 2
---

# Phase 16 Plan 02: Recruiter Skill Preview — GREEN Phase Summary

**One-liner:** Implemented `buildFitReasons()` and `censorProfile()` pure functions; replaced inline ternary with single `censorProfile()` call; all 17 unit tests green; `RankingItem` type exported with `profile: RankingProfile`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement buildFitReasons() and censorProfile() | 49d04f8 | src/application/use-cases/swipe/get-ranking.use-case.ts |
| 2 | Update RankingItem type contract in swipe.routes.ts | 63f5aba | src/infrastructure/http/routes/swipe.routes.ts |
| 3 | Full unit suite green check | — (no file changes) | — |

## What Was Built

**Task 1 — buildFitReasons() implementation:**
- Always emits skill count string: `"N/M skills match"` where N = matching count, M = job required count
- Conditionally emits salary reason (`"salary in range"` / `"salary outside range"`) only when both candidate and job have salary data
- Always emits profession reason (`"profession match"` / `"different profession"`)

**Task 1 — censorProfile() implementation:**
- `isRevealed = swipe.direction === 'LIKE' || isUnlocked` — single boolean governs all branching
- Revealed path returns `FullProfile` with all identity and preference fields (lat/lng excluded for location privacy)
- Locked path computes `matchingSkills` as `candidate.skills.filter(s => job.requiredSkills.includes(s))` (candidate-first — T-16-02-02), calls `buildFitReasons()`, returns `CensoredProfile` with `name/avatarUrl/bio: null`

**Task 1 — execute() refactor:**
- Inline ternary (lines 121-134 of original) replaced by `const profile = censorProfile(swipe, job, unlockedCandidateIds.has(swipe.candidateId))`
- `profile: null` no longer exists anywhere in the execute() map callback

**Task 2 — RankingItem type:**
- `export type RankingItem` added to `swipe.routes.ts` after `SwipeRouteOpts`
- `profile` field typed as `import('...get-ranking.use-case').RankingProfile` via inline import expression
- Route handler functions unchanged; both `swipeRoutes` and `swipeJobRoutes` still exported

**Task 3 — Full unit suite:**
- 70 tests across 13 suites — all pass
- 17 `get-ranking.use-case.test.ts` tests green (4 pre-existing + 6 censorProfile() + 5 buildFitReasons() + 2 use-case output)
- Zero regressions

## Verification Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` | Exit 0 — no type errors |
| `jest tests/unit/get-ranking.use-case.test.ts` | 17/17 passed |
| `jest tests/unit --runInBand` | 70/70 passed (13 suites) |
| `grep "const profile = censorProfile("` | 1 match (line 165) |
| `grep "profile: null"` in execute() | 0 matches |
| `grep "export type RankingItem"` in swipe.routes.ts | 1 match (line 14) |
| `grep "export function censorProfile"` | 1 match |
| `grep "export function buildFitReasons"` | 1 match |

## TDD Gate Compliance

- RED gate commit: `test(16-01): add failing RED tests...` (32695e2) — from plan 16-01
- GREEN gate commit: `feat(16-02): implement buildFitReasons() and censorProfile()` (49d04f8) ✓
- REFACTOR gate: not needed — implementation is clean on first pass

## Deviations from Plan

None — plan executed exactly as written. All three changes in Task 1 applied cleanly. Task 2 insert point matched exactly. Task 3 confirmed 70/70 tests with no regressions.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Known Stubs

None — all stubs from plan 16-01 are now implemented. `censorProfile` and `buildFitReasons` have real bodies.

## Self-Check: PASSED

- [x] `src/application/use-cases/swipe/get-ranking.use-case.ts` contains `const profile = censorProfile(` (line 165)
- [x] `src/application/use-cases/swipe/get-ranking.use-case.ts` does NOT contain `profile: null` in execute()
- [x] `src/infrastructure/http/routes/swipe.routes.ts` contains `export type RankingItem` (line 14)
- [x] `src/infrastructure/http/routes/swipe.routes.ts` contains `profile: import(...)RankingProfile` (line 19)
- [x] Commit 49d04f8 exists (feat buildFitReasons + censorProfile GREEN)
- [x] Commit 63f5aba exists (feat RankingItem type)
- [x] `tsc --noEmit` exits 0
- [x] 17/17 get-ranking tests pass; 70/70 full unit suite passes
