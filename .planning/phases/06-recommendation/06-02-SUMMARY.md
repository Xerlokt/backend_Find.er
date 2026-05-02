---
phase: 06-recommendation
plan: 02
subsystem: recommendation
tags: [recommendation, fit-score, tdd, green, algorithm, haversine]
dependency_graph:
  requires:
    - "06-01 (IRecommendationService interface, RecommendationRepository skeleton, RED test stubs)"
  provides:
    - src/modules/recommendation/recommendation.repository.ts (computeFitScore — 5-factor weighted scoring, all 14 unit tests GREEN)
  affects:
    - tests/unit/recommendation.service.test.ts (12 previously RED tests now GREEN)
tech_stack:
  added: []
  patterns:
    - 5-factor weighted fit scoring (profession 30%, skills 35%, location 20%, modality 10%, salary 5%)
    - Haversine great-circle distance (floating-point, module-level helper)
    - TDD RED → GREEN transition (stub replaced with real algorithm)
    - Null-safe factor guards (null coords → neutral 0.5, null salary → full credit 1.0)
    - Case-insensitive skill matching with toLowerCase() on both sides
key_files:
  created: []
  modified:
    - src/modules/recommendation/recommendation.repository.ts
decisions:
  - "haversineKm placed as module-level function (not class method) for pure testability — no side effects, no DB dependency"
  - "Skills comparison uses cs.toLowerCase() === req.toLowerCase() — exact match only; RELATED_TO graph traversal for partial credit deferred to v1.1"
  - "locationScore=0.5 for null candidate coords (neutral penalty) — cannot penalise candidate who has not shared location"
  - "salaryScore=1.0 when candidate.salaryExpectation is null — no stated preference means any salary is acceptable"
  - "haversineKm in this file returns float (unlike swipe.service.ts which rounds) — scoring requires floating-point precision before final Math.round"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-02"
  tasks_completed: 1
  files_created: 0
  files_modified: 1
---

# Phase 06 Plan 02: computeFitScore 5-Factor Algorithm Summary

**One-liner:** 5-factor weighted fit-score algorithm (profession 30%, skills 35%, location 20%, work mode 10%, salary 5%) implemented in RecommendationRepository, turning all 12 RED unit tests GREEN with Haversine distance and null-safe factor guards.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement computeFitScore 5-factor algorithm (RED → GREEN) | 92f3e8e | src/modules/recommendation/recommendation.repository.ts |

## What Was Built

### computeFitScore Implementation

Replaced the Plan 06-01 stub (always returns 0) with the full 5-factor weighted scoring algorithm in `src/modules/recommendation/recommendation.repository.ts`.

**haversineKm helper (module-level):**
Returns floating-point great-circle distance in kilometres using the Haversine formula. Placed at module level (above the class) for pure testability. Uses floating-point arithmetic (no rounding) so the linear decay computation `Math.max(0, 1 - distKm / radius)` has full precision before the final `Math.round`.

**Factor 1 — Profession match (30%):**
`professionScore = 1.0` if both `candidate.professionId` and `job.professionId` are non-null and equal; `0.0` otherwise. Null-safe: a null professionId on either side contributes 0.

**Factor 2 — Skills overlap (35%):**
If `job.requiredSkills.length === 0` → `skillsScore = 1.0` (full credit, division-by-zero guard, T-06-08 mitigation). Otherwise `matched.length / job.requiredSkills.length` where `matched` uses case-insensitive comparison: `cs.toLowerCase() === req.toLowerCase()` on both sides (T-06-05 mitigation).

**Factor 3 — Location proximity (20%):**
- `job.lat == null || job.lng == null` → `locationScore = 1.0` (no location requirement)
- `candidate.lat == null || candidate.lng == null` → `locationScore = 0.5` (neutral, cannot penalise)
- Otherwise: `Math.max(0, 1 - haversineKm(c, j) / radius)` with `radius = searchRadiusKm > 0 ? searchRadiusKm : 50`

**Factor 4 — Work mode (10%):**
`modalityScore = candidate.preferredModalities.includes(job.modality) ? 1.0 : 0.0`

**Factor 5 — Salary compatibility (5%):**
- `candidate.salaryExpectation == null` → `1.0` (no preference)
- `job.salaryMin == null && job.salaryMax == null` → `1.0` (open range)
- Otherwise: `1.0` if expectation is within `[salaryMin, salaryMax]` (null bound treated as open-ended), `0.0` otherwise

**Final score:**
`Math.round((profession*0.30 + skills*0.35 + location*0.20 + modality*0.10 + salary*0.05) * 100)`

### Test Results

- Before: 12 failing (RED), 2 passing (trivially)
- After: 14 passing (all GREEN)
- tsc --noEmit: exits 0

## Deviations from Plan

None — plan executed exactly as written. Implementation matches the algorithm specified in the plan's `<implementation>` block verbatim.

## Known Stubs

None — computeFitScore stub from Plan 06-01 has been fully replaced with the real algorithm.

## Threat Surface Scan

All threat mitigations from the plan's threat model were applied:

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-06-05 (Tampering — case-insensitive skill comparison) | Mitigated | `cs.toLowerCase() === req.toLowerCase()` on both sides of the comparison (line 34) |
| T-06-06 (Information Disclosure — fitScore exposure) | Accepted | Only the rounded integer 0–100 aggregate is returned; individual factor scores not exposed |
| T-06-07 (DoS — computeFitScore per feed item) | Accepted | Pure TypeScript math, no DB calls in v1; negligible latency at MVP scale |
| T-06-08 (Tampering — division by zero) | Mitigated | `if (job.requiredSkills.length === 0) skillsScore = 1.0` guard before division (line 29) |

No new threat surface detected beyond what the plan's threat model covers.

## Self-Check

### File Existence

- [x] src/modules/recommendation/recommendation.repository.ts — modified (exists)

### Commit Existence

- [x] 92f3e8e — feat(06-recommendation-02): implement 5-factor computeFitScore algorithm

### Test State

- Unit tests: 14/14 PASSING (GREEN)
- tsc --noEmit: exits 0

### Verification Checks

- [x] `grep "toLowerCase()"` → 2 matches (both sides of skill comparison, line 34)
- [x] `grep "searchRadiusKm"` → 1 match (used in locationScore calculation, line 46)
- [x] `grep "haversineKm"` → 2 matches (function definition line 6 + call site line 47)
- [x] `grep "Math.round"` → 1 match (final score computation, line 66)
- [x] `grep "0.30|0.35|0.20|0.10|0.05"` → 5 matches (all weights present, lines 67-71)

## Self-Check: PASSED
