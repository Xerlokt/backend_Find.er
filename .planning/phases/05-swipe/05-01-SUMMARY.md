---
phase: 05-swipe
plan: "01"
subsystem: swipe
tags: [tdd, service, repository, swipe, cursor-pagination, idor-guard]
dependency_graph:
  requires:
    - "04-jobs (Job model, prisma.job, prisma.candidateProfile)"
    - "01-foundation (AppError, prisma client, Prisma client)"
  provides:
    - "SwipeRepository — 6 methods, zero cross-module imports"
    - "SwipeService — recordSwipe + getFeed with full guards"
    - "createSwipe factory in tests/helpers/factories.ts"
  affects:
    - "05-02 (swipe routes will import SwipeService)"
    - "05-03 (ranking service will use SwipeRepository.findSwipesByJobId)"
tech_stack:
  added: []
  patterns:
    - "TDD RED/GREEN — tests written before implementation"
    - "Constructor injection: new SwipeService(repo)"
    - "ARCH-04 module isolation — direct prisma calls, no cross-module imports"
    - "SEC-03 atomic write — prisma.$transaction in createSwipe"
    - "Cursor pagination — take limit+1, detect hasNext, return nextCursor"
    - "IDOR guard — candidateId always resolved from JWT userId via repo, never from body"
key_files:
  created:
    - tests/unit/swipe.service.test.ts
    - src/modules/swipe/swipe.repository.ts
    - src/modules/swipe/swipe.service.ts
  modified:
    - tests/helpers/factories.ts
decisions:
  - "candidateId resolved from JWT userId via repo.findCandidateProfileByUserId — never from request body (IDOR prevention, T-05-01)"
  - "Inactive or expired job returns 404 NOT_FOUND (not 400) to avoid information disclosure (D-14)"
  - "P2002 unique constraint caught explicitly and re-thrown as AppError 409 DUPLICATE_SWIPE (T-05-03)"
  - "prisma.$transaction wraps swipe.create for atomic write (SEC-03, T-05-02)"
  - "findFeedJobs excludes already-swiped jobs via NOT:swipes.some:candidateId at DB level"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-05-01T16:03:34Z"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
requirements_satisfied:
  - SWIPE-01
  - SWIPE-02
  - SEC-03
  - ARCH-01
  - ARCH-04
---

# Phase 05 Plan 01: SwipeService + SwipeRepository (TDD) Summary

One-liner: SwipeRepository and SwipeService implemented via TDD with IDOR guard, $transaction atomic write, P2002 duplicate detection, and cursor-pagination getFeed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Write failing unit tests + createSwipe factory | 7d5e86e | tests/unit/swipe.service.test.ts, tests/helpers/factories.ts |
| 2 (GREEN) | Implement SwipeRepository and SwipeService | 348ee5c | src/modules/swipe/swipe.repository.ts, src/modules/swipe/swipe.service.ts |

## Test Results

- **Suite:** tests/unit/swipe.service.test.ts
- **Tests:** 8 passed, 0 failed
- **Coverage:** recordSwipe (6 cases) + getFeed (2 cases)

### Test Cases

**recordSwipe:**
- 404 NOT_FOUND when candidate profile not found (repo.createSwipe NOT called)
- 404 NOT_FOUND when job not found (repo.createSwipe NOT called)
- 404 NOT_FOUND when job.isActive === false — D-14 (repo.createSwipe NOT called)
- 404 NOT_FOUND when job.expiresAt <= now — expired (repo.createSwipe NOT called)
- 409 DUPLICATE_SWIPE when repo.createSwipe rejects with PrismaClientKnownRequestError P2002
- IDOR guard: candidateId passed to repo.createSwipe equals profile.id from userId lookup, not any user-supplied value

**getFeed:**
- 404 NOT_FOUND when candidate profile not found (repo.findFeedJobs NOT called)
- Happy path: repo.findFeedJobs called with profile.id; returns { data, nextCursor }

## Security Verifications (Threat Register)

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-05-01 IDOR | candidateId from repo.findCandidateProfileByUserId(JWT userId) | Unit test IDOR guard — passes |
| T-05-02 Race condition | prisma.$transaction in createSwipe | grep confirmed in swipe.repository.ts:6 |
| T-05-03 Duplicate swipe | P2002 → AppError 409 DUPLICATE_SWIPE | Unit test + grep confirmed |
| T-05-04 Inactive job swipe | !job.isActive \|\| job.expiresAt <= new Date() → 404 | Unit tests D-14 + expired — both pass |

## Architecture Verifications (ARCH-04)

- swipe.repository.ts imports: only `../../shared/db/prisma` and `@prisma/client`
- No imports from `../candidate/`, `../recruiter/`, or `../job/`
- Profile lookups use direct Prisma calls with documented comments

## TDD Gate Compliance

- RED gate: commit `7d5e86e` — `test(05-swipe-01): add failing unit tests...` — tests failed with TS2307 Cannot find module
- GREEN gate: commit `348ee5c` — `feat(05-swipe-01): implement SwipeRepository and SwipeService...` — 8/8 tests pass
- TypeScript: `npx tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stubs, placeholders, or hardcoded empty values. All methods are fully implemented.

## Threat Flags

None — no new security-relevant surface beyond what is described in the plan's threat model.

## Self-Check

- [x] tests/unit/swipe.service.test.ts — exists, 8 test cases
- [x] src/modules/swipe/swipe.repository.ts — exists, exports SwipeRepository
- [x] src/modules/swipe/swipe.service.ts — exists, exports SwipeService
- [x] tests/helpers/factories.ts — contains createSwipe
- [x] Commit 7d5e86e — RED (test) commit exists
- [x] Commit 348ee5c — GREEN (feat) commit exists
- [x] TypeScript: zero errors
- [x] All 8 unit tests passing

## Self-Check: PASSED
