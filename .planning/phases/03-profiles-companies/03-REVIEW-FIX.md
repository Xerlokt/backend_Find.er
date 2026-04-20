---
phase: 03-profiles-companies
fixed_at: 2026-04-20T00:00:00Z
review_path: .planning/phases/03-profiles-companies/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-04-20T00:00:00Z
**Source review:** .planning/phases/03-profiles-companies/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Race condition in `CompanyService.adjustCredits` — credits can go negative under concurrent load

**Files modified:** `src/modules/company/company.service.ts`, `src/modules/admin/admin.service.ts`
**Commit:** f5cd889
**Applied fix:** Both `CompanyService.adjustCredits` and `AdminService.adjustCredits` now wrap the entire guard + update sequence inside `prisma.$transaction(async (tx) => { ... })`. The balance check (`credits + delta < 0`) and the `company.update` call are executed in the same transaction, eliminating the race condition. A `reason` parameter (default `'admin_grant'`) was also added to both methods (see WR-03 below, handled in the same commit).

---

### WR-01: No upper bound on pagination `limit` parameter — allows unbounded DB scan

**Files modified:** `src/modules/admin/admin.routes.ts`
**Commit:** e93e165
**Applied fix:** Added `ListUsersQuerySchema` using `z.coerce.number().int().positive().max(100).default(20)` for `limit` and `z.coerce.number().int().positive().default(1)` for `page`. The handler now calls `ListUsersQuerySchema.parse(request.query)` instead of raw `Number(...)` extraction, capping `limit` at 100 and rejecting non-positive values via Zod.

---

### WR-02: `(request.query as any)` cast — `NaN` silently accepted by Prisma, empty results returned

**Files modified:** `src/modules/admin/admin.routes.ts`
**Commit:** e93e165
**Applied fix:** Resolved together with WR-01. The `(request.query as any)` casts on lines 18-19 were replaced by `ListUsersQuerySchema.parse(request.query)`, which uses `z.coerce.number()` to safely parse strings to numbers and rejects `undefined`/non-numeric input instead of silently producing `NaN`.

---

### WR-03: CreditTransaction audit record is never written when credits are adjusted

**Files modified:** `src/modules/company/company.service.ts`, `src/modules/admin/admin.service.ts`
**Commit:** f5cd889
**Applied fix:** A `tx.creditTransaction.create({ data: { companyId, amount: delta, reason } })` call was added inside the same `$transaction` block as the credit update in both service methods. Both methods now accept an optional `reason: string` parameter (default `'admin_grant'`), making the audit record available for all future call sites.

---

### WR-04: Integration tests do not cover unauthenticated access (missing 401 assertions)

**Files modified:** `tests/integration/company.test.ts`, `tests/integration/candidate.test.ts`, `tests/integration/recruiter.test.ts`
**Commit:** a9c8c92
**Applied fix:** Added one top-level `it('401 para requisição sem Authorization header', ...)` test to each of the three integration test files. Each test sends a GET request to the module's primary protected route without an `Authorization` header and asserts `response.status` equals `401`.

---

_Fixed: 2026-04-20T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
