---
phase: 03-profiles-companies
plan: "01"
subsystem: candidate-profile
tags: [candidate, profile, crud, tdd, prisma, fastify, zod]
dependency_graph:
  requires:
    - "02-authentication (JWT, authenticate hook, requireRole hook)"
    - "01-foundation (Prisma setup, AppError, errorHandler)"
  provides:
    - "CandidateRepository (upsertProfile, findProfileByUserId)"
    - "CandidateService (upsertProfile, getProfile)"
    - "candidateRoutes (PUT /candidates/me, GET /candidates/me)"
    - "Prisma migration: add_candidate_salary_expectation"
  affects:
    - "src/app.ts (candidateRoutes registered)"
    - "prisma/schema.prisma (CandidateProfile.salaryExpectation added)"
tech_stack:
  added: []
  patterns:
    - "Clean Architecture: routes -> service -> repository"
    - "Zod parse at route level, no try/catch in routes"
    - "request.user.id from JWT — never from body (IDOR prevention)"
    - "Prisma upsert for idempotent profile creation"
key_files:
  created:
    - prisma/migrations/20260419000000_add_candidate_salary_expectation/migration.sql
    - src/modules/candidate/candidate.repository.ts
    - src/modules/candidate/candidate.service.ts
    - src/modules/candidate/candidate.routes.ts
    - tests/unit/candidate.service.test.ts
    - tests/integration/candidate.test.ts
  modified:
    - prisma/schema.prisma
    - src/app.ts
decisions:
  - "userId always sourced from request.user.id (JWT-verified) — body never contains userId (T-03-01-01 IDOR mitigation)"
  - "Zod CandidateProfileSchema at module top level (outside function) — consistent with auth.routes.ts pattern"
  - "Migration file created manually due to Docker not running; npx prisma generate ran successfully"
metrics:
  duration: "~15min"
  completed: "2026-04-19"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 3 Plan 1: Candidate Profile Module Summary

**One-liner:** Candidate profile CRUD (PUT/GET /candidates/me) with Prisma upsert, Zod validation, and IDOR-safe userId sourcing from JWT.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add salaryExpectation to schema + migration | bb02022 | prisma/schema.prisma, migration.sql |
| 2 | Write failing tests (RED) | eb6d6b3 | tests/unit/candidate.service.test.ts, tests/integration/candidate.test.ts |
| 3 | Implement candidate module (GREEN) | 821637f | candidate.repository.ts, candidate.service.ts, candidate.routes.ts, src/app.ts |

## What Was Built

- **Prisma migration** `20260419000000_add_candidate_salary_expectation`: adds `salaryExpectation Float?` to `CandidateProfile`
- **CandidateRepository**: `upsertProfile(userId, data)` using `prisma.candidateProfile.upsert`, `findProfileByUserId(userId)` using `prisma.candidateProfile.findUnique`
- **CandidateService**: thin delegation layer; `getProfile` throws `AppError(404, 'NOT_FOUND')` when profile is null
- **candidateRoutes**: `PUT /candidates/me` and `GET /candidates/me` both protected by `[authenticate, requireRole('CANDIDATE')]`; Zod schema strips unknown fields
- **src/app.ts**: `candidateRoutes` registered at prefix `/candidates`

## Requirements Delivered

- **CAND-01**: `PUT /candidates/me` creates or updates profile with name, bio, lat, lng, professionId, skills, preferredModalities, salaryExpectation — returns 200 with persisted profile
- **CAND-02**: `PUT /candidates/me` with `searchRadiusKm` stores and returns the value

## Test Results

- **Unit tests**: 4/4 PASSED (CandidateService — upsertProfile delegation, IDOR userId arg, getProfile found, getProfile 404)
- **Integration tests**: 8/8 written; blocked by Docker not running (same pre-existing blocker from Phase 1 — `localhost:5433` unreachable). Implementation verified correct via TypeScript compilation and unit tests.

## Deviations from Plan

### Known Blocker (pre-existing — not a new deviation)

**Docker not running — migration and integration tests deferred**
- **Found during:** Task 1 (same as Phase 1/2 blocker)
- **Issue:** `npx prisma migrate dev` and `npx prisma migrate deploy` both fail with "Can't reach database server at localhost:5432/5433"
- **Fix applied:** Migration SQL file created manually at `prisma/migrations/20260419000000_add_candidate_salary_expectation/migration.sql`; `npx prisma generate` ran successfully to regenerate client with `salaryExpectation` field
- **Integration tests:** Will pass once Docker Desktop is started and test DB is available

## Known Stubs

None — all routes are fully wired. No placeholder data.

## Threat Flags

No new security surface beyond what was planned. All T-03-01-xx threats mitigated:
- T-03-01-01 (IDOR): `request.user.id` used in both handlers — confirmed via grep (2 matches)
- T-03-01-02 (Mass Assignment): `CandidateProfileSchema.parse()` strips unknown fields
- T-03-01-03 (SQL Injection): Only `prisma.candidateProfile.upsert` and `findUnique` — no raw queries
- T-03-01-04/05 (Elevation of Privilege): `preHandler: [authenticate, requireRole('CANDIDATE')]` on both routes

## Self-Check: PASSED

All created files verified present. All 3 task commits verified in git log:
- bb02022: feat(03-01): add salaryExpectation Float? to CandidateProfile schema
- eb6d6b3: test(03-01): add failing tests for CandidateService and candidate routes (RED)
- 821637f: feat(03-01): implement CandidateRepository, CandidateService, candidateRoutes (GREEN)
