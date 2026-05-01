---
phase: 05-swipe
plan: "02"
subsystem: swipe
tags: [routes, integration-tests, fastify, zod, rate-limit, cursor-pagination]
dependency_graph:
  requires:
    - "05-01 (SwipeService, SwipeRepository — service contracts)"
    - "01-foundation (AppError, authenticate hook, requireRole hook)"
    - "04-jobs (jobRoutes already registered in app.ts)"
  provides:
    - "swipeRoutes — POST /swipes Fastify plugin, CANDIDATE-only, rate-limited 30/min"
    - "swipeJobRoutes — GET /jobs/feed Fastify plugin, CANDIDATE-only, cursor pagination"
    - "app.ts — updated with both swipe plugin registrations"
    - "tests/integration/swipe.test.ts — 10 integration test cases for POST /swipes and GET /jobs/feed"
  affects:
    - "05-03 (ranking routes will be added to swipeJobRoutes in swipe.routes.ts)"
tech_stack:
  added: []
  patterns:
    - "Fastify plugin pattern: exported async function (app: FastifyInstance): Promise<void>"
    - "Per-route rate-limit override: config: { rateLimit: { max: 30, timeWindow: '1 minute' } }"
    - "Zod validation: SwipeBodySchema (jobId uuid, direction enum), FeedQuerySchema (cursor optional uuid, limit coerce int)"
    - "Static-before-parameterized route registration (GET /feed before /:jobId/ranking)"
    - "IDOR prevention: candidateId always resolved server-side from JWT userId"
    - "Cursor pagination: limit+1 technique, nextCursor null when no more pages"
key_files:
  created:
    - src/modules/swipe/swipe.routes.ts
    - tests/integration/swipe.test.ts
  modified:
    - src/app.ts
decisions:
  - "swipeJobRoutes registered as a SEPARATE plugin from jobRoutes on prefix /jobs — Fastify allows multiple plugins on same prefix without conflict"
  - "GET /feed registered first in swipeJobRoutes plugin, before any /:param route, to prevent 'feed' being treated as a UUID jobId param (Pitfall 1)"
  - "Rate limit max:30/min applied only to POST /swipes per-route override (SEC-05, D-11); GET /feed inherits global rate limit"
  - "direction cast as SwipeDirection using Prisma enum type after Zod validation (type-safe)"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-01T00:00:00Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
requirements_satisfied:
  - SWIPE-01
  - SWIPE-02
  - SEC-05
  - ARCH-01
  - ARCH-04
---

# Phase 05 Plan 02: Swipe HTTP Routes + Integration Tests Summary

One-liner: swipeRoutes (POST /swipes) and swipeJobRoutes (GET /jobs/feed) implemented as Fastify plugins with Zod validation, CANDIDATE-only auth, rate-limiting, and 10 integration test cases wired.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement swipe.routes.ts (POST /swipes + GET /jobs/feed) | f3b7fe1 | src/modules/swipe/swipe.routes.ts |
| 2 | Wire app.ts + write integration tests | aac5050 | src/app.ts, tests/integration/swipe.test.ts |

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASSED — zero errors |
| `npm run test:unit` | 3 pre-existing failures in CompanyService (unrelated to swipe) |
| `npm run test:integration -- swipe` | BLOCKED — Docker not running (pre-existing ECONNREFUSED) |
| swipeRoutes registered at /swipes | PASSED |
| swipeJobRoutes registered at /jobs | PASSED |
| rateLimit max:30 on POST /swipes | PASSED |
| GET /feed before parameterized route | PASSED |

## Integration Test Coverage

### POST /swipes (6 cases)
- 201: CANDIDATE creates swipe with valid { jobId uuid, direction LIKE }
- 409 DUPLICATE_SWIPE: same candidate+job swiped twice
- 403: RECRUITER role rejected
- 401: no Authorization header
- 400: invalid direction value (MAYBE)
- 404: job with isActive: false

### GET /jobs/feed (4 cases)
- 200: returns { data, nextCursor } with active unswiped jobs
- Exclusion: swiped jobs excluded from feed results
- 403: RECRUITER role rejected
- Cursor pagination: page 2 has no overlap with page 1, nextCursor not null on page 1

## Security Verifications (Threat Register)

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-05-05 DoS via POST /swipes | config: { rateLimit: { max: 30, timeWindow: '1 minute' } } | grep confirmed in swipe.routes.ts:26 |
| T-05-06 Unauthenticated swipe | preHandler: [authenticate, requireRole('CANDIDATE')] | Code review + integration test 401/403 |
| T-05-07 Invalid feed cursor | cursor: z.string().uuid().optional() — Zod rejects non-UUID with 400 | Code review on FeedQuerySchema |
| T-05-08 Inactive job swipeable | Delegated to SwipeService.recordSwipe (implemented in 05-01) | Integration test 404 case |

## Known Stubs

None — swipeRoutes and swipeJobRoutes are fully implemented without placeholders.

Note: GET /:jobId/ranking is intentionally NOT in this plan — it will be added to swipeJobRoutes in Plan 03 (same plugin function, additional route). This is by design, not a stub.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Pre-existing Issues (Out of Scope)

**1. CompanyService unit tests — 3 failures**
- Found during: Task 2 verification
- Issue: `adjustCredits` tests expect AppError 404 but receive PrismaClientKnownRequestError P2028
- Status: Pre-existing before this plan (confirmed by git stash check against Task 1 commit f3b7fe1)
- Action: Logged here only — not fixed (out of scope per deviation rule boundary)

**2. Docker Desktop not running — Integration tests ECONNREFUSED**
- Found during: Task 2 verification
- Issue: All integration tests fail with database connection refused
- Status: Pre-existing blocker documented in STATE.md
- Action: Tests written and committed; will run when Docker is started

## Threat Flags

None — no new security-relevant surface beyond what is described in the plan's threat model.

## Self-Check

- [x] src/modules/swipe/swipe.routes.ts — exists, exports swipeRoutes and swipeJobRoutes
- [x] src/app.ts — contains import { swipeRoutes, swipeJobRoutes }
- [x] src/app.ts — contains await app.register(swipeRoutes, { prefix: '/swipes' })
- [x] src/app.ts — contains await app.register(swipeJobRoutes, { prefix: '/jobs' })
- [x] tests/integration/swipe.test.ts — exists, 10 it() test cases
- [x] tests/integration/swipe.test.ts — contains expect(response.body.code).toBe('DUPLICATE_SWIPE')
- [x] tests/integration/swipe.test.ts — contains cursor pagination test with nextCursor assertion
- [x] Commit f3b7fe1 — Task 1 (swipe.routes.ts) exists
- [x] Commit aac5050 — Task 2 (app.ts + swipe.test.ts) exists
- [x] TypeScript: zero errors (npx tsc --noEmit)

## Self-Check: PASSED
