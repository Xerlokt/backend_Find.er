---
phase: 07-credits
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/modules/credits/credits.constants.ts
  - src/modules/credits/credits.repository.ts
  - src/modules/credits/credits.service.ts
  - src/shared/utils/haversine.ts
  - tests/unit/credit.service.test.ts
  - prisma/schema.prisma
  - tests/helpers/factories.ts
  - tests/helpers/setup.ts
  - src/modules/credits/credits.routes.ts
  - tests/integration/credits.test.ts
  - src/app.ts
  - src/modules/admin/admin.service.ts
  - src/modules/admin/admin.routes.ts
  - src/modules/swipe/swipe.repository.ts
  - src/modules/swipe/swipe.service.ts
  - tests/unit/swipe.service.test.ts
  - tests/integration/admin.test.ts
  - tests/integration/swipe.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-05-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Phase 7 implements the credits economy: unlock flow, audit log, AdminService refactor with `ICreditService` interface injection, and ranking reveal for unlocked DISLIKE candidates. The core logic is sound — atomic transactions, proper TOCTOU protection for duplicate unlocks, and the DISLIKE-reveal gate in `getRanking` are all implemented correctly. Security posture is good (Zod validation on all endpoints, no raw SQL, helmet/rate-limit in place, sensitive fields excluded from admin user endpoints).

Five warnings require attention before merging: a layer-isolation violation in `admin.routes.ts`, a direct Prisma call in `AdminService` that bypasses the injected service, a missing input-validation guard on the credit-grant amount, a TOCTOU window in the transaction, and an unsafe route param access pattern. Four info items flag code duplication and a missing pagination feature.

---

## Warnings

### WR-01: Module Isolation Violation — `admin.routes.ts` imports directly from `credits` module

**File:** `src/modules/admin/admin.routes.ts:6-7`
**Issue:** The file imports `CreditRepository` and `CreditService` from `../credits/` (a sibling module). The architecture rule states "modules must not import directly from other modules." The intent of the `ICreditService` interface on `AdminService` is precisely to avoid this coupling, but the routes file wires concrete credit classes directly, defeating the abstraction.
**Fix:** Move the wiring to `app.ts` or a dedicated composition-root factory, passing the pre-built `CreditService` instance to `AdminService`. The route file should only know about `AdminService`:
```typescript
// app.ts (or a factory)
const creditRepo = new CreditRepository()
const creditService = new CreditService(creditRepo)
const adminService = new AdminService(creditService)

// admin.routes.ts — receives adminService from outside, e.g. via closure or plugin options
export async function adminRoutes(app: FastifyInstance, opts: { adminService: AdminService }) { ... }
```
At minimum, the `CreditRepository`/`CreditService` imports in `admin.routes.ts` should be removed; if full DI is deferred, `AdminService` itself can create its own `CreditService` internally, keeping the cross-module import to a single entry point.

---

### WR-02: `AdminService.adjustCredits` bypasses the injected `ICreditService` for the `grantCredits` call, but `GET /admin/companies/:id/transactions` calls Prisma directly in the route handler

**File:** `src/modules/admin/admin.routes.ts:57`
**Issue:** The audit-log query `prisma.creditTransaction.findMany(...)` is executed directly inside the route handler, not via a service or repository method. This violates the clean-architecture rule (routes → service → repository) and means the query has no test coverage other than the integration test — logic bugs in ordering or filtering would not be caught by unit tests.
**Fix:** Move the query into `AdminService` (or a dedicated `AdminRepository`):
```typescript
// admin.service.ts
async getTransactions(companyId: string) {
  return prisma.creditTransaction.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  })
}

// admin.routes.ts handler
const transactions = await service.getTransactions(id)
return reply.status(200).send(transactions)
```

---

### WR-03: Credit-grant `amount` accepts zero and negative integers via `AdjustCreditsAdminSchema`

**File:** `src/modules/admin/admin.routes.ts:11`
**Issue:** `z.number().int().positive()` correctly rejects non-positive values, so this validation is actually fine for the HTTP layer — **however**, `CreditService.grantCredits` and `CreditRepository.grantCredits` accept any `number` with no validation, meaning an internal caller could pass `amount: 0` or a negative value without hitting the Zod guard. The `reason` parameter is also a free-form string with no length cap or allowlist, so a caller could write an arbitrarily long string to the `creditTransaction` table.
**Fix:** Add a guard in the service layer:
```typescript
// credits.service.ts
async grantCredits(companyId: string, amount: number, reason = 'admin_grant') {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError('Amount must be a positive integer', 400, 'INVALID_AMOUNT')
  }
  return this.repo.grantCredits(companyId, amount, reason)
}
```
For `reason`, consider an enum/allowlist or at minimum a `z.string().max(100)`.

---

### WR-04: TOCTOU window between `findUnlock` check and `executeUnlock` transaction in `CreditService.unlockCandidate`

**File:** `src/modules/credits/credits.service.ts:21-27`
**Issue:** The service calls `findUnlock` (line 21) and then — if `null` — proceeds to `executeUnlock` (line 27). Under concurrent requests, two requests can both observe `null` and both enter the transaction. The transaction does deduct credits and creates the `Unlock` row, so the unique constraint (`companyId_candidateId_jobId`) will reject the second writer with `P2002`, which is caught and translated to `409`. Credits, however, are decremented by the first writer **before** the second writer's insert fails — the second writer's `tx.company.update` (line 40-43 of the repository) also runs and decrements credits before the unique-constraint violation occurs on `tx.unlock.create` (line 44). Because this is inside a single `$transaction`, both the credit decrement and the failing insert will be rolled back atomically. So correctness is preserved.

The remaining risk is that the optimistic pre-check on line 21 (outside the transaction) is redundant with the in-transaction check at repository level — the service-layer check adds a round-trip but does not strengthen isolation. This is a minor inefficiency and a potential source of confusion, not a correctness bug. Flagged as warning because future maintainers may remove the in-transaction re-check thinking the service-layer check is sufficient.

**Fix:** Add a comment in `executeUnlock` making the re-check explicit and non-removable:
```typescript
// credits.repository.ts — executeUnlock
// NOTE: This in-transaction credit check is REQUIRED for correctness under concurrency.
// The service-layer findUnlock() pre-check is an optimistic fast-path only and does NOT
// guarantee exclusivity. Do not remove this check.
if (company.credits < creditsCost) throw new Error('INSUFFICIENT_CREDITS')
```

---

### WR-05: Unvalidated `id` path parameter in `GET /admin/users/:id` and `GET /admin/companies/:id/transactions`

**File:** `src/modules/admin/admin.routes.ts:37` and `src/modules/admin/admin.routes.ts:56`
**Issue:** Both handlers cast `request.params` directly: `const { id } = request.params as { id: string }`. Unlike the `UnlockParamsSchema` used in the credits route, there is no Zod parse here. If `id` is not a valid UUID, Prisma will attempt the query and return no result (for `findUnique`) or an empty array (for `findMany`) — no crash, but the validation rule "Inputs validated with Zod on all endpoints" is violated, and a malformed ID string passes into the DB layer.
**Fix:**
```typescript
const ParamIdSchema = z.object({ id: z.string().uuid() })

// In each handler:
const { id } = ParamIdSchema.parse(request.params)
```

---

## Info

### IN-01: `haversineKm` function is duplicated — defined in both `swipe.service.ts` and `shared/utils/haversine.ts`

**File:** `src/modules/swipe/swipe.service.ts:7-23`
**Issue:** The `haversineKm` function is copied verbatim (identical implementation) in `swipe.service.ts` (lines 7–23) and also exported from `src/shared/utils/haversine.ts`. The credits route already imports from the shared utility. The swipe service does not.
**Fix:** Remove the local copy from `swipe.service.ts` and import from the shared utility:
```typescript
import { haversineKm } from '../../shared/utils/haversine'
```

---

### IN-02: `GET /admin/companies/:id/transactions` has no pagination

**File:** `src/modules/admin/admin.routes.ts:57`
**Issue:** `prisma.creditTransaction.findMany({ where: { companyId: id } })` returns all transactions for a company with no `take`/`skip` limit. For companies with large transaction histories this will return an unbounded payload. Other list endpoints in the project use cursor or page-based pagination.
**Fix:** Add limit/cursor pagination consistent with the rest of the API, or at minimum a `take` cap (e.g., 100).

---

### IN-03: `SwipeRepository.createSwipe` wraps a single write in a `$transaction` unnecessarily

**File:** `src/modules/swipe/swipe.repository.ts:6-9`
**Issue:** `prisma.$transaction(async (tx) => tx.swipe.create({ data }))` is a transaction containing only one operation. This adds overhead (an extra round-trip for transaction management) without providing isolation benefits. Single Prisma writes are already atomic.
**Fix:**
```typescript
async createSwipe(data: { candidateId: string; jobId: string; direction: SwipeDirection }) {
  return prisma.swipe.create({ data })
}
```

---

### IN-04: Missing `grantCredits` test coverage for the negative-amount and zero-amount paths in unit tests

**File:** `tests/unit/credit.service.test.ts:133-139`
**Issue:** `describe('grantCredits')` has only one test — the happy path delegation. There are no tests for invalid inputs (e.g., `amount: 0`, `amount: -5`). If WR-03's fix is implemented (service-layer guard), these test cases become necessary to cover the new branch.
**Fix:** Add tests for `amount: 0` and `amount: -1` once the service-layer guard from WR-03 is implemented:
```typescript
it('lança 400 INVALID_AMOUNT quando amount é zero', async () => {
  await expect(service.grantCredits('company-1', 0))
    .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' })
  expect(repo.grantCredits).not.toHaveBeenCalled()
})
```

---

_Reviewed: 2026-05-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
