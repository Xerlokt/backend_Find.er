---
phase: 07-credits
fixed_at: 2026-05-02T00:00:00Z
review_path: .planning/phases/07-credits/07-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-05-02T00:00:00Z
**Source review:** .planning/phases/07-credits/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-04: TOCTOU comment missing in transaction

**Files modified:** `src/modules/credits/credits.repository.ts`
**Commit:** 6288628
**Applied fix:** Added a 3-line comment block above the `company.credits < creditsCost` check inside `executeUnlock`'s `$transaction` callback, explicitly stating the check is required for correctness under concurrency and that the service-layer `findUnlock()` pre-check is an optimistic fast-path only.

---

### WR-03: Credit-grant `amount` accepts zero and negative integers

**Files modified:** `src/modules/credits/credits.service.ts`, `tests/unit/credit.service.test.ts`
**Commit:** 1ec9ec2
**Applied fix:** Added a guard at the start of `CreditService.grantCredits` that throws `AppError('Amount must be a positive integer', 400, 'INVALID_AMOUNT')` when `amount` is not a positive integer. Also added two unit tests covering `amount: 0` and `amount: -5` to validate the new guard branch.

---

### WR-01: Module isolation violation + WR-02: Direct Prisma call in route handler

**Files modified:** `src/modules/admin/admin.routes.ts`, `src/modules/admin/admin.service.ts`, `src/app.ts`
**Commit:** 760104d
**Applied fix (WR-01):** Moved the `CreditRepository` / `CreditService` / `AdminService` construction from `admin.routes.ts` to `app.ts` as the composition root. `adminRoutes` now accepts `opts: { service: AdminService }` and receives the pre-built service instance via Fastify plugin options. The cross-module imports (`../credits/credits.repository`, `../credits/credits.service`) were removed from `admin.routes.ts` entirely; they now live only in `app.ts`.
**Applied fix (WR-02):** Added `AdminService.getTransactions(companyId: string)` method that executes the `prisma.creditTransaction.findMany` query through the service layer. The `GET /admin/companies/:id/transactions` route handler now calls `service.getTransactions(id)` and the direct `prisma` import was removed from `admin.routes.ts`.

---

### WR-05: Unvalidated `id` path parameter in admin routes

**Files modified:** `src/modules/admin/admin.routes.ts`
**Commit:** a248c9c
**Applied fix:** Added `const ParamIdSchema = z.object({ id: z.string().uuid() })` schema at module level. Replaced all three `request.params as { id: string }` unsafe casts in `GET /admin/users/:id`, `PATCH /admin/companies/:id/credits`, and `GET /admin/companies/:id/transactions` with `ParamIdSchema.parse(request.params)`. Malformed or non-UUID `id` values now return a 400 validation error before reaching the service layer.

---

_Fixed: 2026-05-02T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
