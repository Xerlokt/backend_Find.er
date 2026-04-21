---
phase: 04-jobs
plan: "03"
subsystem: job-http-routes
tags: [fastify, routes, zod, integration-tests, idor-prevention, ownership-guard, tdd]
dependency_graph:
  requires: [04-01-job-data-layer, 04-02-expiry-scheduler]
  provides: [job-http-routes]
  affects: [phase-05-swipes, phase-06-recommendations]
tech_stack:
  added: []
  patterns: [clean-architecture, zod-validation, requireRole-guard, ownership-idor-guard, fastify-route-plugin]
key_files:
  created:
    - src/modules/job/job.routes.ts
    - tests/integration/job-routes.test.ts
  modified:
    - src/app.ts
decisions:
  - "GET /jobs/mine registered before GET /jobs/:id to prevent Fastify matching 'mine' as a UUID parameter"
  - "userId always sourced from request.user.id (JWT) — never from body or URL params — IDOR-safe by design"
  - "rankings: [] returned as placeholder in GET /jobs/:id — Phase 6 will populate with fit-scored candidates"
  - "expiresAt coerced from ISO8601 string to Date before reaching service layer (T-04-03-06)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 4 Plan 03: Job HTTP Routes Summary

Fastify job routes plugin with Zod validation, 5 endpoints, JWT ownership guards, and 14 HTTP integration tests covering auth, IDOR, and rankings placeholder.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | job.routes.ts — 5 routes with Zod + IDOR guards + app.ts wiring | f0f7e60 | src/modules/job/job.routes.ts, src/app.ts |
| 2 | HTTP integration tests for all job routes | b611a38 | tests/integration/job-routes.test.ts |

## What Was Built

### job.routes.ts (`src/modules/job/job.routes.ts`)

Fastify plugin exporting `jobRoutes` registered at `/jobs` prefix:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | / | RECRUITER | Create job — Zod CreateJobSchema, userId from JWT |
| GET | /mine | RECRUITER | List recruiter's own jobs (before /:id to avoid param conflict) |
| GET | /:id | RECRUITER | Job detail + `rankings: []` placeholder for Phase 6 |
| PATCH | /:id | RECRUITER | Update job — Zod UpdateJobSchema, ownership via service |
| DELETE | /:id/deactivate | RECRUITER | Soft deactivation — delegates to service.deactivateJob |

**Zod schemas:**
- `CreateJobSchema`: title, description, professionId, companyId (UUID), modality (enum), requiredSkills (min 1), expiresAt (ISO datetime), optional salary/lat/lng
- `UpdateJobSchema`: all fields optional, same constraints, no companyId

### app.ts update (`src/app.ts`)

Added import and registration:
```typescript
import { jobRoutes } from './modules/job/job.routes'
// ...
await app.register(jobRoutes, { prefix: '/jobs' })
```

### Integration test suite (`tests/integration/job-routes.test.ts`)

14 HTTP-level tests against real PostgreSQL:

**POST /jobs (5 tests):** 201 create with recruiterId, 400 missing title, 400 empty skills, 401 no token, 403 CANDIDATE role

**GET /jobs/mine (2 tests):** 200 scoped to recruiter (2 of 3 jobs), 200 empty array

**GET /jobs/:id (2 tests):** 200 with `rankings: []` placeholder, 404 not found

**PATCH /jobs/:id (3 tests):** 200 update title, 403 IDOR guard (recruiter2), 404 not found

**DELETE /jobs/:id/deactivate (2 tests):** 200 isActive=false, 403 IDOR guard (recruiter2)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Implemented

| Threat ID | Mitigation |
|-----------|-----------|
| T-04-03-01 | companyId from body used as provided; recruiterId always from JWT profile lookup in service layer |
| T-04-03-02 | IDOR tested: PATCH and DELETE 403 when recruiter2 attempts to modify recruiter1's job (2 tests each) |
| T-04-03-03 | requireRole('RECRUITER') on all 5 routes; 401 and 403 CANDIDATE tests in suite |
| T-04-03-04 | rankings: [] reveals no candidate data — placeholder only |
| T-04-03-05 | All body fields validated via Zod; lat/lng bounded to valid ranges; 400 tests for missing/invalid fields |
| T-04-03-06 | expiresAt: z.string().datetime() + `new Date(body.expiresAt)` coercion in POST and PATCH |

## Known Stubs

- `rankings: []` in GET /jobs/:id response — intentional placeholder; Phase 6 (recommendation engine) will populate with fit-scored candidates via Neo4j.

## Threat Flags

None — no new trust boundaries beyond what was planned. All endpoints are gated by authenticate + requireRole('RECRUITER').

## Self-Check: PASSED

- [x] `src/modules/job/job.routes.ts` — exists, exports `jobRoutes`
- [x] `src/app.ts` — updated with import + register at /jobs prefix
- [x] `tests/integration/job-routes.test.ts` — exists, 14 tests
- [x] Commit f0f7e60 (feat routes + app.ts) — exists
- [x] Commit b611a38 (test integration) — exists
- [x] `npx tsc --noEmit` — 0 errors
- [x] `grep -n "jobRoutes" src/app.ts` — 2 matches (import + register)
- [x] `grep -n "rankings.*\\[\\]" src/modules/job/job.routes.ts` — 1 match in GET /:id
- [x] `grep -c "requireRole.*RECRUITER" src/modules/job/job.routes.ts` — 5 matches
- [x] 14 integration tests pass against real PostgreSQL
