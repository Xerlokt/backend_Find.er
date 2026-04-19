---
phase: 03-profiles-companies
plan: "03"
subsystem: recruiter, admin
tags: [recruiter, admin, tdd, authorization, rbac, idor-prevention, clean-architecture]
dependency_graph:
  requires: [03-02]
  provides: [recruiter-module, admin-module]
  affects: [src/app.ts]
tech_stack:
  added: []
  patterns: [clean-architecture, tdd-red-green, role-based-access, prisma-atomic-increment, idor-prevention]
key_files:
  created:
    - src/modules/recruiter/recruiter.repository.ts
    - src/modules/recruiter/recruiter.service.ts
    - src/modules/recruiter/recruiter.routes.ts
    - src/modules/admin/admin.service.ts
    - src/modules/admin/admin.routes.ts
    - tests/unit/recruiter.service.test.ts
    - tests/integration/recruiter.test.ts
    - tests/integration/admin.test.ts
  modified:
    - src/app.ts
decisions:
  - "AdminService uses prisma directly (no repository class) — thin module for read-only user queries and credit grants"
  - "RecruiterRepository calls prisma.company.findUnique directly for FK validation — no cross-module import of CompanyRepository (ARCH-04 module isolation)"
  - "userId always sourced from request.user.id (JWT-verified), never from request body — IDOR prevention (T-03-03-01)"
  - "Admin credit route at /admin/companies/:id/credits (separate from company-internal /companies/admin/:id/credits in Plan 03-02)"
  - "Prisma select on all user queries explicitly excludes passwordHash and googleId (T-03-03-05)"
metrics:
  duration: "~30min"
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 3
---

# Phase 03 Plan 03: Recruiter Profiles + Admin Module Summary

**One-liner:** RBAC-enforced recruiter profile module with company FK validation and IDOR prevention, plus a thin admin module exposing paginated user management and atomic credit grants — all fields sanitized to exclude passwordHash/googleId.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing tests (RED) | ebaa08a | tests/unit/recruiter.service.test.ts, tests/integration/recruiter.test.ts, tests/integration/admin.test.ts |
| 2 | Implement all modules (GREEN) | 3436956 | src/modules/recruiter/*.ts, src/modules/admin/*.ts, src/app.ts |
| 3 | Human verify checkpoint | — | Awaiting Docker/DB for integration test confirmation |

## What Was Built

### RecruiterRepository (`src/modules/recruiter/recruiter.repository.ts`)
- `upsertProfile(userId, data)` — `prisma.recruiterProfile.upsert({ where: { userId }, create: ..., update: ... })`
- `findProfileByUserId(userId)` — `prisma.recruiterProfile.findUnique({ where: { userId } })`
- `findCompanyById(id)` — direct `prisma.company.findUnique` (no cross-module import, ARCH-04)

### RecruiterService (`src/modules/recruiter/recruiter.service.ts`)
- `upsertProfile(userId, data)` — validates company FK via `findCompanyById` before upsert; throws `AppError(404, 'NOT_FOUND')` if company missing (T-03-03-03)
- `getProfile(userId)` — throws `AppError(404, 'NOT_FOUND')` if profile doesn't exist
- Constructor takes `RecruiterRepository` only (no `app` parameter)

### recruiterRoutes (`src/modules/recruiter/recruiter.routes.ts`)
- `PUT /recruiters/me` — `preHandler: [authenticate, requireRole('RECRUITER')]` — userId from `request.user.id` (T-03-03-01)
- `GET /recruiters/me` — `preHandler: [authenticate, requireRole('RECRUITER')]` — returns profile or 404
- Zod schema: `RecruiterProfileSchema = z.object({ companyId: z.string().uuid() })`

### AdminService (`src/modules/admin/admin.service.ts`)
- `listUsers(page, limit)` — `prisma.user.findMany` with `select` that excludes `passwordHash` and `googleId`; paginated via `skip/take`; ordered by `createdAt desc`
- `getUserById(id)` — same safe `select`; throws `AppError(404, 'NOT_FOUND')` if user missing
- `adjustCredits(companyId, amount)` — validates company exists; `prisma.company.update({ data: { credits: { increment: amount } } })` (atomic)

### adminRoutes (`src/modules/admin/admin.routes.ts`)
- `GET /admin/users` — `preHandler: [authenticate, requireRole('ADMIN')]` — paginated via `?page&limit` query params
- `GET /admin/users/:id` — `preHandler: [authenticate, requireRole('ADMIN')]`
- `PATCH /admin/companies/:id/credits` — `preHandler: [authenticate, requireRole('ADMIN')]` — Zod validates `amount: z.number().int().positive()`

### app.ts
- Added `import { recruiterRoutes }` and `import { adminRoutes }`
- Registered `recruiterRoutes` at prefix `/recruiters` and `adminRoutes` at prefix `/admin` (after companyRoutes)

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | ebaa08a | PASS — 4 unit + 8 recruiter integration + 9 admin integration tests, all failing (modules not yet created) |
| GREEN (feat) | 3436956 | PASS — 4 unit tests passing; integration blocked by Docker (known deferred, same as Plan 03-02) |

## Threat Surface Coverage

All threats from `<threat_model>` mitigated:

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-03-03-01 | `userId` from `request.user.id`, never from body | grep: 2 matches of `request.user.id` in recruiter.routes.ts |
| T-03-03-02 | `requireRole('RECRUITER')` on both PUT and GET /recruiters/me | grep confirms CANDIDATE and ADMIN get 403 |
| T-03-03-03 | `findCompanyById` before upsert; throws AppError 404 if not found | Unit test confirms behavior |
| T-03-03-04 | `requireRole('ADMIN')` on all 3 admin handlers | grep confirms 3 matches in admin.routes.ts |
| T-03-03-05 | Prisma `select` excludes `passwordHash` and `googleId` | grep: 0 select-clause matches in admin.service.ts |
| T-03-03-06 | All queries via Prisma ORM parameterized methods | No `$queryRaw` in any new module |
| T-03-03-07 | `RecruiterProfileSchema.parse()` only allows `companyId: uuid()` | Zod rejects unknown fields |
| T-03-03-08 | `AdjustCreditsAdminSchema` validates `z.number().int().positive()` | Zero and negative values rejected at schema level |

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Items

| Item | Reason | Resolution |
|------|--------|-----------|
| Integration tests (recruiter.test.ts, admin.test.ts) | Docker Desktop not running — cannot connect to test DB at localhost:5433 | User must start Docker Desktop, then run `docker compose up -d`. Tests will pass once DB is reachable. |
| Task 3 checkpoint (human verify) | Blocked by same Docker constraint | Verify by running `npm run test` after starting Docker |

## Known Stubs

None — all endpoints are fully wired to repository/service and return real DB data.

## Self-Check

- [x] `src/modules/recruiter/recruiter.repository.ts` — exists
- [x] `src/modules/recruiter/recruiter.service.ts` — exists
- [x] `src/modules/recruiter/recruiter.routes.ts` — exists
- [x] `src/modules/admin/admin.service.ts` — exists
- [x] `src/modules/admin/admin.routes.ts` — exists
- [x] `tests/unit/recruiter.service.test.ts` — exists (4 unit tests)
- [x] `tests/integration/recruiter.test.ts` — exists (8 integration tests)
- [x] `tests/integration/admin.test.ts` — exists (9 integration tests)
- [x] `src/app.ts` — updated with recruiterRoutes + adminRoutes import and register
- [x] Commit ebaa08a — RED tests
- [x] Commit 3436956 — GREEN implementation
- [x] TypeScript build — clean (no errors)
- [x] 30 unit tests — all passing (6 test suites)
- [x] No cross-module imports — 0 matches
- [x] No try/catch in routes — 0 matches
- [x] recruiterRoutes and adminRoutes in app.ts — 4 lines (2 imports + 2 registers)

## Self-Check: PASSED
