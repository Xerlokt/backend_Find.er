---
phase: 11-core-modules-migration
fixed_at: 2026-05-09T00:00:00Z
review_path: .planning/phases/11-core-modules-migration/11-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-05-09T00:00:00Z
**Source review:** .planning/phases/11-core-modules-migration/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

| Finding | Title | Files Modified | Commit | Status |
|---------|-------|----------------|--------|--------|
| CR-01 | Unvalidated path parameter `id` in CompanyController | `src/adapters/controllers/company.controller.ts` | `091a060` | fixed |
| WR-01 | Dual credit-adjustment routes with inconsistent behavior | `src/infrastructure/http/routes/company.routes.ts` | `53648c4` | fixed |
| WR-02 | TOCTOU race in UpsertRecruiterProfileUseCase | `src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts` | `2a913cf` | fixed |
| WR-03 | Scheduler cron interval too aggressive | `src/infrastructure/http/plugins/scheduler.plugin.ts` | `2fb9ff0` | fixed |
| WR-04 | getTransactions does not validate company existence | `src/application/use-cases/admin/get-transactions.use-case.ts` | `8a63ba3` | fixed |

### CR-01: Unvalidated path parameter `id` in CompanyController

**Files modified:** `src/adapters/controllers/company.controller.ts`
**Commit:** `091a060`
**Applied fix:** Added `CompanyParamsSchema = z.object({ id: z.string().uuid() })` alongside other schemas and replaced the two raw `request.params as { id: string }` casts in `getById` and `adjustCredits` with `CompanyParamsSchema.parse(request.params)`. Non-UUID values now produce a clean Zod validation error (400) instead of reaching Prisma.

### WR-01: Dual credit-adjustment routes with inconsistent behavior

**Files modified:** `src/infrastructure/http/routes/company.routes.ts`
**Commit:** `53648c4`
**Applied fix:** Removed the `PATCH /admin/:id/credits` route registration from `company.routes.ts`. Admin credit operations are exclusively handled via `PATCH /admin/companies/:id/credits` in `admin.routes.ts`, eliminating the dual code paths with different atomicity guarantees.

### WR-02: TOCTOU race in UpsertRecruiterProfileUseCase

**Files modified:** `src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts`
**Commit:** `2a913cf`
**Applied fix:** Wrapped the `this.repo.upsertProfile` call in a try/catch that intercepts Prisma error code `P2003` (foreign key constraint violation) and re-throws it as `DomainError('Company not found', 'NOT_FOUND', 404)`. This covers the race window between the existence check and the write where the company could be concurrently deleted.

### WR-03: Scheduler cron interval too aggressive

**Files modified:** `src/infrastructure/http/plugins/scheduler.plugin.ts`
**Commit:** `2fb9ff0`
**Applied fix:** Changed the cron expression from `'* * * * *'` (every minute) to `'0 * * * *'` (every hour at minute 0). Added a comment explaining the rationale. Job expiry operates on days/weeks granularity; per-minute bulk `updateMany` creates unnecessary DB write pressure.

### WR-04: getTransactions does not validate company existence

**Files modified:** `src/application/use-cases/admin/get-transactions.use-case.ts`
**Commit:** `8a63ba3`
**Applied fix:** Added `DomainError` import and a `this.repo.findById(companyId)` existence check at the start of `execute`. If the company does not exist, throws `DomainError('Company not found', 'NOT_FOUND', 404)` instead of silently returning an empty array. The controller already passes a full `CompanyRepository` (which implements `ICompanyRepository` including `findById`), so no controller change was needed.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-05-09T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
