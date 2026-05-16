---
phase: 14-graph-recommendation
plan: "02"
subsystem: recommendation
tags: [tdd, neo4j, graph, skills, interface-rename, typescript]
dependency_graph:
  requires:
    - 14-01 (TDD RED phase — unit/integration tests with skillIds/requiredSkillIds)
  provides:
    - updated-FitScoreInput-interface (skillIds: string[])
    - updated-FitScoreJobInput-interface (requiredSkillIds: string[])
    - callers-updated-to-new-interface
  affects:
    - src/domain/interfaces/recommendation.repository.interface.ts
    - src/application/use-cases/swipe/get-feed.use-case.ts
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/adapters/services/recommendation.repository.ts
tech_stack:
  added: []
  patterns:
    - "satisfies FitScoreInput compile-time guard catches all callers of renamed interface"
    - "Adapter field references updated in sync with interface renames (Rule 1)"
key_files:
  created: []
  modified:
    - src/domain/interfaces/recommendation.repository.interface.ts
    - src/application/use-cases/swipe/get-feed.use-case.ts
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/adapters/services/recommendation.repository.ts
decisions:
  - "recommendation.repository.ts adapter also updated (Rule 1 bug-fix) — it accesses candidate.skills and job.requiredSkills directly via typed FitScoreInput/FitScoreJobInput params; renaming the interface fields without updating the adapter would produce a runtime error in tsc"
  - "Profile object skills field in get-ranking.use-case.ts line 67 intentionally left as 'skills' — it is a profile API field returned to clients, not a FitScoreInput field"
metrics:
  duration: "8 minutes"
  completed: "2026-05-16T19:45:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 14 Plan 02: Interface Field Renames — skillIds and requiredSkillIds

**One-liner:** Renamed FitScoreInput.skills→skillIds and FitScoreJobInput.requiredSkills→requiredSkillIds across interface, callers, and adapter; tsc passes with zero errors; unit tests remain RED at runtime (expected).

## What Was Done

### Task 1 — Rename interface fields

Modified `src/domain/interfaces/recommendation.repository.interface.ts`:
- `FitScoreInput.skills: string[]` → `FitScoreInput.skillIds: string[]`
- `FitScoreJobInput.requiredSkills: string[]` → `FitScoreJobInput.requiredSkillIds: string[]`
- `IRecommendationRepository` signature unchanged

**State after Task 1:** tsc fails immediately — all callers using `satisfies FitScoreInput` / `satisfies FitScoreJobInput` now report compile errors, confirming the breaking change is tracked by TypeScript.

### Task 2 — Update all callers

Updated three files to use the renamed fields:

**get-feed.use-case.ts:**
- `skills: candidate.skills` → `skillIds: candidate.skills` (inside `satisfies FitScoreInput` block)
- `requiredSkills: job.requiredSkills` → `requiredSkillIds: job.requiredSkills` (inside `satisfies FitScoreJobInput` block)

**get-ranking.use-case.ts:**
- `skills: swipe.candidate.skills` → `skillIds: swipe.candidate.skills` (inside `satisfies FitScoreInput` block)
- `requiredSkills: job.requiredSkills` → `requiredSkillIds: job.requiredSkills` (inside `satisfies FitScoreJobInput` block)
- Line 67 `skills: swipe.candidate.skills` inside profile object — **intentionally unchanged** (profile API field, not FitScoreInput)

**recommendation.repository.ts (Rule 1 auto-fix):**
- `job.requiredSkills.length` → `job.requiredSkillIds.length` (3 occurrences)
- `candidate.skills.some(...)` → `candidate.skillIds.some(...)` (1 occurrence)

**Verification:** `npx tsc --noEmit` → exit code 0, zero errors.

**Unit test state:** `FAIL tests/unit/recommendation.service.test.ts` — 1 failed, 19 passed. The 1 failure is the new adjacency test expecting graph traversal behavior — correct RED state; implementation comes in Plan 03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated recommendation.repository.ts adapter field references**

- **Found during:** Task 2 — running `npx tsc --noEmit` after updating get-feed and get-ranking
- **Issue:** `recommendation.repository.ts` accesses `candidate.skills` and `job.requiredSkills` directly as typed parameters of `FitScoreInput`/`FitScoreJobInput`. After renaming the interface fields, TypeScript would report errors on those property accesses in the adapter.
- **Fix:** Updated `job.requiredSkills` → `job.requiredSkillIds` (3 occurrences) and `candidate.skills` → `candidate.skillIds` (1 occurrence) in `computeFitScore()` method body.
- **Files modified:** `src/adapters/services/recommendation.repository.ts`
- **Commit:** `76cb317`

## Verification Results

1. `npx tsc --noEmit` → exit code 0, zero errors
2. Interface field check: `grep "skillIds\|requiredSkillIds" src/domain/interfaces/recommendation.repository.interface.ts` → 2 matches (lines 4, 15)
3. Old field names absent: no `skills:` or `requiredSkills:` in interface file
4. get-feed caller: `skillIds: candidate.skills` and `requiredSkillIds: job.requiredSkills` — 1 match each
5. get-ranking caller: `skillIds: swipe.candidate.skills` and `requiredSkillIds: job.requiredSkills` — 1 match each
6. Profile object preserved: `skills: swipe.candidate.skills` on line 67 — 1 match (unchanged)
7. Unit tests: `FAIL — 1 failed, 19 passed` (expected RED for adjacency test)

## Known Stubs

None — this plan only renames interface fields and updates callers. No production logic was changed.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The interface rename is contained within the TypeScript type system; all callers verified by compile-time `satisfies` guards.

## Self-Check

- [x] `src/domain/interfaces/recommendation.repository.interface.ts` — `skillIds` and `requiredSkillIds` present; old names absent
- [x] `src/application/use-cases/swipe/get-feed.use-case.ts` — `skillIds: candidate.skills` and `requiredSkillIds: job.requiredSkills`
- [x] `src/application/use-cases/swipe/get-ranking.use-case.ts` — `skillIds: swipe.candidate.skills` and `requiredSkillIds: job.requiredSkills`; profile `skills:` field unchanged
- [x] `src/adapters/services/recommendation.repository.ts` — `skillIds` and `requiredSkillIds` field accesses
- [x] Commit `8c660b7` — Task 1 (interface rename)
- [x] Commit `76cb317` — Task 2 (caller updates + adapter fix)
- [x] `npx tsc --noEmit` → 0 errors

## Self-Check: PASSED
