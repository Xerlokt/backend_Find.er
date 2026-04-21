---
phase: 04-jobs
plan: "01"
subsystem: job-data-layer
tags: [prisma, migration, repository, service, tdd, ownership-guard, idor-prevention]
dependency_graph:
  requires: [03-profiles]
  provides: [job-repository, job-service]
  affects: [04-02-expiry-scheduler, 04-03-job-routes]
tech_stack:
  added: []
  patterns: [clean-architecture, constructor-injection, tdd-red-green, ownership-guard]
key_files:
  created:
    - prisma/migrations/20260421195856_add_recruiter_to_job/migration.sql
    - src/modules/job/job.repository.ts
    - src/modules/job/job.service.ts
    - tests/unit/job.service.test.ts
    - tests/integration/job.test.ts
  modified:
    - prisma/schema.prisma
    - tests/helpers/factories.ts
decisions:
  - "JobRepository includes findRecruiterProfileByUserId via direct Prisma call — avoids importing RecruiterRepository (ARCH-04 module isolation)"
  - "deactivateJob delegates to updateJob(userId, jobId, { isActive: false }) to reuse ownership guard — no code duplication"
  - "Integration tests call service+repository directly (no HTTP) because routes are wired in plan 04-03"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 4 Plan 01: Job Data Layer Summary

JWT-backed JobService with Prisma-migrated recruiterId ownership guard and full TDD coverage (13 unit + 9 integration tests).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Prisma migration + JobRepository + JobService + unit tests | e90873e | schema.prisma, job.repository.ts, job.service.ts, tests/unit/job.service.test.ts, factories.ts |
| 2 | Integration tests for job CRUD (real DB) | c632100 | tests/integration/job.test.ts |

## What Was Built

### Prisma Schema Changes

- `Job` model: added `recruiterId String` + `recruiter RecruiterProfile @relation(...)` fields
- `RecruiterProfile` model: added `jobs Job[]` back-relation
- Migration `20260421195856_add_recruiter_to_job` applied to both dev and test databases

### JobRepository (`src/modules/job/job.repository.ts`)

Prisma-backed CRUD with these methods:
- `create(recruiterId, data)` — inserts job with recruiterId from profile (never from body)
- `findJobById(id)`
- `update(id, data)`
- `findByRecruiterId(recruiterId)` — ordered by `createdAt DESC`
- `findRecruiterProfileByUserId(userId)` — direct Prisma call (module isolation)
- `deactivateExpiredJobs()` — bulk `updateMany` where `isActive=true AND expiresAt < NOW()`

### JobService (`src/modules/job/job.service.ts`)

Business logic with ownership enforcement:
- `createJob(userId, data)` — resolves profile from userId (JWT), **never reads recruiterId from request body** (IDOR prevention, T-04-01-01)
- `updateJob(userId, jobId, data)` — resolves profile, fetches job, throws 403 if `job.recruiterId !== profile.id` (T-04-01-02)
- `deactivateJob(userId, jobId)` — delegates to `updateJob(..., { isActive: false })` — reuses ownership guard
- `listJobsByRecruiter(userId)` — returns only the authenticated recruiter's jobs
- `getJobById(jobId)` — returns job or throws 404

### factories.ts Update

`createJob(companyId, recruiterId, overrides?)` — added `recruiterId` as second required parameter to support the new schema constraint.

## Test Coverage

**Unit tests** (13 tests, no DB):
- createJob: 404 on missing profile, correct delegation to repo.create with profileId, IDOR proof
- updateJob: 404 non-existent job, 403 wrong owner, 200 correct owner
- deactivateJob: 404, 403, delegates with `{ isActive: false }`
- listJobsByRecruiter: 404 no profile, returns array from findByRecruiterId
- getJobById: 404, returns job

**Integration tests** (9 tests, real PostgreSQL via Docker):
- createJob persists recruiterId from profile lookup (not from body)
- updateJob: 200 own job / 403 other recruiter / 404 non-existent
- deactivateJob: persisted isActive=false / 403 cross-recruiter
- listJobsByRecruiter: scoped to requesting recruiter only
- deactivateExpiredJobs: marks past-expiry jobs inactive, leaves future jobs active

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Implemented

| Threat ID | Mitigation |
|-----------|-----------|
| T-04-01-01 | recruiterId always derived from `repo.findRecruiterProfileByUserId(userId)` — userId from JWT, never from request body |
| T-04-01-02 | IDOR guard `job.recruiterId !== profile.id` throws AppError 403 in updateJob/deactivateJob; covered by unit AND integration tests |
| T-04-01-04 | listByRecruiterId filtered by profile.id — recruiter cannot enumerate other recruiters' jobs |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced in this plan.

## Self-Check: PASSED

- [x] `src/modules/job/job.repository.ts` — exists
- [x] `src/modules/job/job.service.ts` — exists
- [x] `tests/unit/job.service.test.ts` — exists
- [x] `tests/integration/job.test.ts` — exists
- [x] `prisma/migrations/20260421195856_add_recruiter_to_job/migration.sql` — exists
- [x] Commit e90873e — exists
- [x] Commit c632100 — exists
- [x] 13 unit tests green
- [x] 9 integration tests green (with DATABASE_URL_TEST set)
- [x] `npx tsc --noEmit` — 0 errors
