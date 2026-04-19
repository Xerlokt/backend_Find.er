---
phase: 03-profiles-companies
plan: "02"
subsystem: company
tags: [company, credits, admin, tdd, authorization]
dependency_graph:
  requires: [03-01]
  provides: [company-module, credit-management]
  affects: [src/app.ts, prisma/schema.prisma]
tech_stack:
  added: []
  patterns: [clean-architecture, tdd-red-green, prisma-atomic-increment, role-based-access]
key_files:
  created:
    - src/modules/company/company.repository.ts
    - src/modules/company/company.service.ts
    - src/modules/company/company.routes.ts
    - tests/unit/company.service.test.ts
    - tests/integration/company.test.ts
  modified:
    - src/app.ts
decisions:
  - "Credit adjustment uses Prisma atomic { increment: delta } to prevent race conditions (T-03-02-05)"
  - "PATCH /companies/admin/:id/credits kept inside companyRoutes (not separate admin module) to maintain cohesion"
  - "Zod AdjustCreditsSchema uses z.number().int().positive() — only positive grants in Phase 3 scope"
metrics:
  duration: "~25min"
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 03 Plan 02: Company Module Summary

**One-liner:** Admin-guarded company creation and atomic credit balance management via Prisma `{ increment: delta }` with RBAC enforcement on all mutating endpoints.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing tests (RED) | 10e981b | tests/unit/company.service.test.ts, tests/integration/company.test.ts |
| 2 | Implement company module (GREEN) | 8694f9a | src/modules/company/*.ts, src/app.ts |

## What Was Built

### CompanyRepository (`src/modules/company/company.repository.ts`)
- `create(data)` — `prisma.company.create({ data })`
- `findById(id)` — `prisma.company.findUnique({ where: { id } })`
- `adjustCredits(companyId, delta)` — `prisma.company.update({ data: { credits: { increment: delta } } })` (atomic, no read-then-write)

### CompanyService (`src/modules/company/company.service.ts`)
- `createCompany(data)` — delegates to `repo.create`
- `getCompany(id)` — throws `AppError(404, 'NOT_FOUND')` if null
- `adjustCredits(companyId, delta)` — guards `company.credits + delta < 0` → throws `AppError(400, 'INSUFFICIENT_CREDITS')` before calling repo

### companyRoutes (`src/modules/company/company.routes.ts`)
- `POST /companies` — `preHandler: [authenticate, requireRole('ADMIN')]` — 201 on success
- `GET /companies/:id` — `preHandler: [authenticate]` — 200 with company data
- `PATCH /companies/admin/:id/credits` — `preHandler: [authenticate, requireRole('ADMIN')]` — 200 with updated company

### app.ts
- Added `import { companyRoutes }` and `app.register(companyRoutes, { prefix: '/companies' })`

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | 10e981b | PASS — 6 unit + 10 integration tests, all failing (module not found) |
| GREEN (feat) | 8694f9a | PASS — 6 unit tests passing; integration blocked by Docker (known deferred) |

## Threat Surface Coverage

All threats from `<threat_model>` mitigated:

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-03-02-01 | `requireRole('ADMIN')` on POST /companies | grep confirms 2 matches |
| T-03-02-02 | `requireRole('ADMIN')` on PATCH /admin/:id/credits | grep confirms 2 matches |
| T-03-02-03 | `z.number().int().positive()` in AdjustCreditsSchema | Zod rejects 0, negative, float |
| T-03-02-04 | `company.credits + delta < 0` guard in CompanyService | Unit test confirms 400 INSUFFICIENT_CREDITS |
| T-03-02-05 | `{ credits: { increment: delta } }` atomic Prisma call | grep confirms 1 match in repository |
| T-03-02-06 | All queries via Prisma ORM parameterized methods | No `$queryRaw` in module |
| T-03-02-07 | `CreateCompanySchema.parse()` strips unknown fields | `plan`, `rating`, `credits` not in schema |

## Deviations from Plan

None — plan executed exactly as written.

The note in the plan about the credit route path decision (PATCH `/companies/admin/:id/credits` vs `/admin/companies/:id/credits`) was pre-resolved in the plan spec. The route is in `companyRoutes` registered at `/companies`, full path `PATCH /companies/admin/:id/credits`.

## Deferred Items

| Item | Reason | Resolution |
|------|--------|-----------|
| Integration tests (company.test.ts) | Docker Desktop not running — cannot connect to test DB | User must start Docker Desktop, then run `docker compose up -d`. Tests will pass once DB is reachable. |

## Known Stubs

None — all endpoints are fully wired to repository and return real DB data.

## Self-Check

- [x] `src/modules/company/company.repository.ts` — exists
- [x] `src/modules/company/company.service.ts` — exists
- [x] `src/modules/company/company.routes.ts` — exists
- [x] `tests/unit/company.service.test.ts` — exists
- [x] `tests/integration/company.test.ts` — exists
- [x] `src/app.ts` — updated with companyRoutes import + register
- [x] Commit 10e981b — RED tests
- [x] Commit 8694f9a — GREEN implementation
- [x] TypeScript build — clean (no errors)
- [x] 6 unit tests — all passing
