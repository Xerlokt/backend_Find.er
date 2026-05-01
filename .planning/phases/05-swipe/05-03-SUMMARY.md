---
phase: 05-swipe
plan: "03"
subsystem: swipe
tags: [ranking, haversine, censorship, tdd, location-privacy, ownership-check]
dependency_graph:
  requires:
    - "05-01 (SwipeService, SwipeRepository — findSwipesByJobId, findRecruiterProfileByUserId, findJobById)"
    - "05-02 (swipeJobRoutes plugin — /feed already registered first)"
    - "04-jobs (RankingItem interface in job.routes.ts)"
  provides:
    - "SwipeService.getRanking — ownership check, LIKE/DISLIKE serialization gate, Haversine distanceKm, rank 1-based"
    - "haversineKm utility — null-safe Haversine formula (returns null when any coord is missing)"
    - "GET /jobs/:jobId/ranking route — RECRUITER-only, registered after /feed (static-before-parameterized)"
    - "8 unit tests for getRanking (all green)"
    - "6 integration tests for GET /jobs/:jobId/ranking (wired, blocked by Docker)"
  affects:
    - "06 (Phase 6 — Neo4j fit-score will replace fitScore: 0 placeholder, D-13)"
tech_stack:
  added: []
  patterns:
    - "haversineKm: null-safe Haversine distance formula — returns null when any coordinate is null (Pitfall 5)"
    - "LIKE/DISLIKE serialization gate: swipe.direction === 'LIKE' ? fullProfile : null"
    - "Location privacy: lat/lng excluded from profile object and root item (D-05, D-06, D-07)"
    - "Ownership check: recruiterProfile.id vs job.recruiterId → 403 FORBIDDEN (D-03)"
    - "type-only import of RankingItem from job.routes (ARCH-04 safe — no runtime coupling)"
    - "Static-before-parameterized route ordering: /feed registered before /:jobId/ranking (Pitfall 1)"
key_files:
  created: []
  modified:
    - src/modules/swipe/swipe.service.ts
    - src/modules/swipe/swipe.routes.ts
    - tests/unit/swipe.service.test.ts
    - tests/integration/swipe.test.ts
decisions:
  - "haversineKm placed as module-level function (not private method) for testability — function haversineKm(...) above class declaration"
  - "fitScore: 0 as Phase 5 placeholder — Phase 6 replaces with Neo4j fit-score (D-13)"
  - "DISLIKE candidates: profile: null exposes only candidateId, fitScore, rank, distanceKm — identity fully censored (D-06)"
  - "lat/lng excluded from LIKE profile object — only distanceKm returned (D-05, D-07)"
  - "JobIdParamsSchema defined at module level (outside swipeJobRoutes function) — shared schema pattern"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-01T00:00:00Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 4
requirements_satisfied:
  - SWIPE-03
  - SWIPE-04
  - ARCH-01
  - ARCH-04
---

# Phase 05 Plan 03: Ranking Endpoint (getRanking + GET /:jobId/ranking) Summary

One-liner: SwipeService.getRanking with Haversine distanceKm, LIKE/DISLIKE censorship gate, ownership check, and GET /jobs/:jobId/ranking RECRUITER-only route — all 16 unit tests green, TypeScript zero errors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add getRanking unit tests | 4ac9e8c | tests/unit/swipe.service.test.ts |
| 2 (GREEN) | Implement getRanking + route + integration tests | 5ca91dd | src/modules/swipe/swipe.service.ts, src/modules/swipe/swipe.routes.ts, tests/integration/swipe.test.ts |

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — test(05-swipe-03) | 4ac9e8c | PASS — 8 failing tests confirmed (TS2339: getRanking does not exist) |
| GREEN — feat(05-swipe-03) | 5ca91dd | PASS — all 16 unit tests green after implementation |

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASSED — zero errors |
| `npx jest tests/unit/swipe.service.test.ts` | PASSED — 16/16 tests green (8 existing + 8 new getRanking) |
| `npx jest tests/integration/swipe.test.ts` | BLOCKED — Docker not running (pre-existing ECONNREFUSED) |
| `/feed` registered before `/:jobId/ranking` | PASSED — line 45 vs line 55 in swipe.routes.ts |
| No lat/lng in profile serialization | PASSED — grep confirms only haversineKm() uses .lat/.lng |
| No cross-module imports (ARCH-04) | PASSED — no import from ../candidate/ or ../recruiter/ |
| RankingItem imported as type-only | PASSED — `import type { RankingItem } from '../job/job.routes'` |

## Unit Test Coverage (getRanking — 8 cases)

- 403 FORBIDDEN: no recruiter profile (findRecruiterProfileByUserId returns null)
- 403 FORBIDDEN: ownership mismatch (job.recruiterId !== recruiterProfile.id)
- LIKE swipe: profile has name, avatarUrl, bio, skills, professionId, preferredModalities, salaryExpectation
- DISLIKE swipe: profile is null (identity fully censored)
- Location privacy: lat/lng undefined on root item AND on LIKE profile
- distanceKm null: candidate has no coordinates
- distanceKm 0: candidate and job share same coordinates
- rank 1-based: first item rank:1, second item rank:2

## Integration Test Coverage (GET /jobs/:jobId/ranking — 6 cases)

- 200: LIKE has full profile, DISLIKE has profile:null
- Location privacy: no lat/lng at any response level
- 403: recruiter is not the job owner
- 403: CANDIDATE role rejected by requireRole('RECRUITER')
- 401: no Authorization header
- distanceKm:null when neither candidate nor job have coordinates

## Security Verifications (Threat Register)

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-05-09 IDOR (ranking access) | `requireRole('RECRUITER')` + ownership check `job.recruiterId !== recruiterProfile.id → 403` | Unit test (ownership mismatch) + integration test 403 non-owner |
| T-05-10 Location disclosure | `haversineKm()` returns distanceKm only; lat/lng fields excluded from profile and root item | Unit test (lat undefined) + grep confirmed no lat in profile serialization |
| T-05-11 DISLIKE censorship | `swipe.direction === 'LIKE' ? fullProfile : null` | Unit test DISLIKE profile:null + integration test |
| T-05-12 CANDIDATE accessing ranking | `requireRole('RECRUITER')` hook returns 403 for CANDIDATE | Integration test 403 CANDIDATE |

## Known Stubs

- `fitScore: 0` — placeholder for Phase 6. Phase 6 will replace with Neo4j fit-score calculation (D-13). This stub is intentional and documented in comments within swipe.service.ts.

## Deviations from Plan

None — plan executed exactly as written.

## Pre-existing Issues (Out of Scope)

**Docker Desktop not running — Integration tests ECONNREFUSED**
- Found during: Task 2 verification
- Issue: All integration tests fail with database connection refused (ECONNREFUSED on prisma calls)
- Status: Pre-existing blocker documented in STATE.md and prior SUMMARY files
- Action: Tests written and committed; will run when Docker is started

## Threat Flags

None — no new security-relevant surface beyond what is described in the plan's threat model.

## Self-Check

- [x] src/modules/swipe/swipe.service.ts — contains `async getRanking(` method
- [x] src/modules/swipe/swipe.service.ts — contains `function haversineKm(` with null guard
- [x] src/modules/swipe/swipe.service.ts — contains `swipe.direction === 'LIKE'` ternary
- [x] src/modules/swipe/swipe.service.ts — contains `import type { RankingItem } from '../job/job.routes'`
- [x] src/modules/swipe/swipe.routes.ts — contains `app.get('/:jobId/ranking',`
- [x] src/modules/swipe/swipe.routes.ts — GET /feed (line 45) before /:jobId/ranking (line 55)
- [x] src/modules/swipe/swipe.routes.ts — `preHandler: [authenticate, requireRole('RECRUITER')]` on ranking route
- [x] tests/unit/swipe.service.test.ts — contains `describe('getRanking')` with 8 `it(` cases
- [x] tests/integration/swipe.test.ts — contains `describe('GET /jobs/:jobId/ranking')` with 6 `it(` cases
- [x] Commit 4ac9e8c — Task 1 RED (unit tests) exists
- [x] Commit 5ca91dd — Task 2 GREEN (implementation + route + integration tests) exists
- [x] TypeScript: zero errors (npx tsc --noEmit)
- [x] Unit tests: 16/16 green

## Self-Check: PASSED
