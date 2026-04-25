---
phase: 04-jobs
plan: "04"
subsystem: jobs
tags: [gap-closure, access-control, type-safety, security-regression]
dependency_graph:
  requires: [04-03]
  provides: [RankingItem-export, GET-jobs-id-open-access, POST-jobs-role-regression]
  affects: [phase-05-swipe, phase-06-fit-score]
tech_stack:
  added: []
  patterns: [authenticate-only-preHandler, TypeScript-interface-export]
key_files:
  created: []
  modified:
    - src/modules/job/job.routes.ts
    - tests/integration/job-routes.test.ts
decisions:
  - "GET /jobs/:id uses [authenticate] only — any authenticated role (CANDIDATE, RECRUITER, ADMIN) can read job details; this is intentional per swipe flow spec (Phase 5 dependency)"
  - "RankingItem interface exported from job.routes.ts as Phase 6 contract — shape fixed at candidateId/fitScore/profile to establish trust boundary early"
metrics:
  duration: "~15min"
  completed_date: "2026-04-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 04 Plan 04: Gap Closure — Access Control Fix + RankingItem Export Summary

Fix GET /jobs/:id access control (was RECRUITER-only, now any authenticated user), export RankingItem interface for Phase 6, and add ADMIN 403 + CANDIDATE 200 regression tests to close the 3 verification gaps from 04-VERIFICATION.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix job.routes.ts — remove requireRole from GET /:id + export RankingItem | 3e8e97a | src/modules/job/job.routes.ts |
| 2 | Extend job-routes.test.ts — CANDIDATE 200 on GET /:id + ADMIN 403 on POST /jobs | c942a11 | tests/integration/job-routes.test.ts |

## What Was Built

**Task 1 — job.routes.ts (2 changes + 1 addition):**
- Added `export interface RankingItem { candidateId: string; fitScore: number; profile: Record<string, unknown> | null }` after imports
- Removed `requireRole('RECRUITER')` from GET /:id preHandler — now `[authenticate]` only
- Typed rankings placeholder as `[] as RankingItem[]` instead of implicit `never[]`

**Task 2 — job-routes.test.ts (2 new test cases):**
- `GET /jobs/:id` — CANDIDATE token returns 200 with `{ id, rankings: [] }` (confirms access control fix)
- `POST /jobs` — ADMIN token returns 403 (closes security regression coverage gap; CANDIDATE was already tested)

## Verification Results

All 7 plan verification checks passed:
1. `export interface RankingItem` — 1 match at line 8
2. `requireRole` — 4 route usages (POST, GET /mine, PATCH, DELETE) + 1 import; GET /:id clean
3. `preHandler: [authenticate]` — GET /:id line 69, no requireRole
4. `RankingItem[]` — 1 match in GET /:id handler body
5. `admin-post-403` — present in test file
6. `candidate-get-id-200` — present in test file
7. `npx tsc --noEmit` — exit 0

Integration test run blocked by Docker not running (pre-existing infrastructure blocker documented in STATE.md). TypeScript compilation confirms test code is syntactically and type-correct.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `rankings: [] as RankingItem[]` in GET /:id handler — intentional placeholder per plan spec. Phase 6 will populate with real fit-score data from Neo4j. Not a blocker for Phase 4 goal completion; Phase 5 (swipe) only needs the endpoint to return 200 with job data.

## Threat Flags

No new threat surface beyond what was documented in the plan's `<threat_model>`. All three threats (T-04-04-01, T-04-04-02, T-04-04-03) were accepted/mitigated per plan.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/modules/job/job.routes.ts | FOUND |
| tests/integration/job-routes.test.ts | FOUND |
| .planning/phases/04-jobs/04-04-SUMMARY.md | FOUND |
| Commit 3e8e97a (Task 1) | FOUND |
| Commit c942a11 (Task 2) | FOUND |
