---
phase: 14-graph-recommendation
plan: "01"
subsystem: recommendation
tags: [tdd, neo4j, graph, skills, adjacency, red-phase]
dependency_graph:
  requires: []
  provides:
    - unit-test-contract-for-adjacency-scoring
    - integration-test-contract-for-seed-expansion
    - slug-based-skill-id-convention-in-test-data
  affects:
    - tests/unit/recommendation.service.test.ts
    - tests/integration/recommendation.test.ts
    - tests/helpers/factories.ts
tech_stack:
  added: []
  patterns:
    - makeMockDriver pattern for neo4j Driver mocking in unit tests
    - slug ID convention for skills (nodejs not Node.js) across all test data
key_files:
  created: []
  modified:
    - tests/unit/recommendation.service.test.ts
    - tests/integration/recommendation.test.ts
    - tests/helpers/factories.ts
    - tests/integration/candidate.test.ts
    - tests/integration/job-routes.test.ts
    - tests/integration/job.test.ts
    - tests/integration/swipe.test.ts
    - tests/unit/create-job.use-case.test.ts
    - tests/unit/upsert-candidate-profile.use-case.test.ts
decisions:
  - "Merged main into worktree branch to bring Phase 13 code (adapters architecture) before applying Phase 14 test changes — worktree was branched from plan-phase-13 pre-execution commit"
  - "Neo4j node name assertions in recommendation.test.ts (lines 91-92) kept as 'Node.js'/'TypeScript' — these check s.name attribute on Skill nodes, not skill ID slugs"
  - "Unit test and integration test files outside recommendation test scope (candidate, job, swipe) also updated to slug IDs for full consistency with Option A convention"
metrics:
  duration: "11 minutes"
  completed: "2026-05-16T19:29:49Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 9
---

# Phase 14 Plan 01: TDD RED Phase — Test Contract for Graph Recommendation

**One-liner:** Established full TDD RED state — unit tests with `makeMockDriver` adjacency control, integration tests asserting 36 skills/42 nodes/50+ RELATED_TO edges/unique constraints, and slug ID convention across all test data.

## What Was Done

### Task 1 — Unit test update (RED)

Rewrote `tests/unit/recommendation.service.test.ts` with:
- `makeMockDriver(adjacency)` factory: returns a mock neo4j `Driver` where `session().run()` resolves with controlled `[{skill, hops}]` adjacency records
- Renamed `makeCandidate` factory field: `skills` → `skillIds` with slug defaults `['nodejs', 'typescript']`
- Renamed `makeJob` factory field: `requiredSkills` → `requiredSkillIds` with slug defaults `['nodejs', 'typescript']`
- Updated `beforeEach` to use `makeMockDriver([{skill:'nodejs',hops:0},{skill:'typescript',hops:0}])` instead of `{} as any`
- Updated all 13 existing test cases with new field names and per-test mock drivers
- Added `describe('adjacency scoring (GRAPH-01)')` with 6 new test cases: 0-hop direct match, 1-hop, 2-hop, no adjacency, mixed hops (1 direct + 1 adjacent), no required skills short-circuit

**State:** FAIL — TypeScript errors `TS2561: 'skillIds' does not exist in type 'Partial<FitScoreInput>'` (expected RED)

### Task 2 — Integration test update (RED)

Rewrote `tests/integration/recommendation.test.ts` with:
- Same factory field renames (`skillIds`, `requiredSkillIds`) with slug defaults
- Skill node count assertion: `10` → `36` (expanded seed target)
- Total node count assertion (idempotency test): `16` → `42` (36 skills + 6 professions)
- Updated all `computeFitScore` test cases to slug field names
- Added RELATED_TO edge count test: `count >= 50` (GRAPH-02)
- Added unique constraint verification test: `skill_id_unique` and `profession_id_unique` (GRAPH-03)
- Added `describe('adjacency scoring — integration (GRAPH-01)')` with 2 integration tests: SQL→PostgreSQL 1-hop test and rust→postgresql no-path test
- Updated REC-03 ranking test to use slug IDs in both Prisma data calls

**State:** FAIL — same TypeScript errors on renamed fields (expected RED)

### Task 3 — factories.ts and all test files

Updated `tests/helpers/factories.ts`:
- `createCandidate()` default: `['Node.js', 'TypeScript']` → `['nodejs', 'typescript']`
- `createJob()` default: `['Node.js', 'TypeScript']` → `['nodejs', 'typescript']`

Updated 6 additional test files that had hardcoded `'Node.js'`/`'TypeScript'` skill strings in Prisma data or use-case inputs:
- `tests/integration/candidate.test.ts` — skills request body
- `tests/integration/job-routes.test.ts` — requiredSkills request body
- `tests/integration/job.test.ts` — requiredSkills use-case inputs (2 occurrences)
- `tests/integration/swipe.test.ts` — skills Prisma data (2 occurrences)
- `tests/unit/create-job.use-case.test.ts` — requiredSkills input
- `tests/unit/upsert-candidate-profile.use-case.test.ts` — skills input

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing Phase 13 code**

- **Found during:** Task 1 setup — unit test referenced `src/adapters/services/recommendation.repository` but worktree only had `src/modules/recommendation/recommendation.repository`
- **Issue:** Worktree was branched from commit `73577f7` (`plan-phase-13` — planning docs only, before Phase 13 executed). Phase 13 code (Clean Architecture migration creating `src/adapters/` structure) was on `main` but not in the worktree.
- **Fix:** `git merge main --no-edit --no-verify` to bring Phase 13 code into the worktree branch before applying Phase 14 test changes.
- **Files modified:** All Phase 13 files pulled in via merge
- **Commit:** Merge commit (not separate — was prerequisite for task commits)

**2. [Rule 2 - Scope expansion] Updated 6 additional test files with display name skill strings**

- **Found during:** Task 3 — plan only explicitly mentioned factories.ts and recommendation tests, but grep revealed `'Node.js'`/`'TypeScript'` skill strings in 6 other test files
- **Issue:** Leaving inconsistent display names would cause data mismatches when tests run against the post-Phase-14 Neo4j seed (which uses slug IDs)
- **Fix:** Updated all occurrences in integration and unit tests that use skill strings as Prisma/domain data values
- **Exception:** Lines 91-92 in recommendation.test.ts kept as `'Node.js'`/`'TypeScript'` — those assert `s.name` (Neo4j node display name), not skill ID slugs

## Verification Results

1. Unit tests — RED: `FAIL tests/unit/recommendation.service.test.ts` (TypeScript errors on `skillIds`/`requiredSkillIds`)
2. Integration tests — RED: `FAIL tests/integration/recommendation.test.ts` (same TypeScript errors)
3. factories.ts slug IDs: `skills: overrides.skills ?? ['nodejs', 'typescript']` confirmed
4. No `'Node.js'` display names as skill data in any test file
5. `npx tsc --noEmit` on src/ — clean (correct: interface not yet changed; that's Plan 02's job)

## Known Stubs

None — this plan only writes test files in RED state. No production code was modified.

## Threat Flags

None — test files only; no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check

- [x] `tests/unit/recommendation.service.test.ts` — exists and FAILS with TS errors
- [x] `tests/integration/recommendation.test.ts` — exists and FAILS with TS errors
- [x] `tests/helpers/factories.ts` — exists with slug ID defaults
- [x] Commit `3c22264` — Task 1 (unit test)
- [x] Commit `718cdda` — Task 2 (integration test)
- [x] Commit `9ead6c5` — Task 3 (factories + other test files)

## Self-Check: PASSED
