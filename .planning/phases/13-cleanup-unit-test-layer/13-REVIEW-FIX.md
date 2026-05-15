---
phase: 13-cleanup-unit-test-layer
fixed_at: 2026-05-15T00:00:00Z
fix_scope: critical_warning
findings_in_scope: 7
fixed: 7
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-05-15T00:00:00Z
**Source review:** .planning/phases/13-cleanup-unit-test-layer/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixes Applied

### CR-01 — Remove dead `unlockCandidate()` from CreditService
**Status:** fixed
**Files:** `src/adapters/services/credit.service.ts`, `src/app.ts`
**Commit:** e65b77b
**Change:** Deleted `unlockCandidate()` method and its two unused imports (`ChatInitiator`, `UNLOCK_COST_BY_PLAN`) from `CreditService`. The constructor now takes only `ICreditRepository`. Updated `app.ts` composition root to match the single-argument constructor (removed `chatService` from the `new CreditService(...)` call).

---

### CR-02 — Use shared haversineKm in recommendation.repository.ts
**Status:** fixed
**Files:** `src/adapters/services/recommendation.repository.ts`
**Commit:** e2f7ba9
**Change:** Deleted the private `haversineKm` function (which lacked null-safety and `Math.round`). Added `import { haversineKm } from '../../application/utils/haversine'`. Updated the call site to handle the `number | null` return: `const distKmRaw = haversineKm(...); const distKm = distKmRaw ?? 0`.

---

### WR-01 — Move repo/use-case construction to CreditsController constructor
**Status:** fixed
**Files:** `src/adapters/controllers/credits.controller.ts`
**Commit:** c887935
**Change:** Added `private readonly creditRepo: CreditRepository` and `private readonly useCase: UnlockCandidateUseCase` fields. Moved `new CreditRepository()` and `new UnlockCandidateUseCase(...)` from inside `unlock()` into the constructor. Updated all references in `unlock()` from local variables to `this.creditRepo` / `this.useCase`.

---

### WR-02 — Remove redundant `job` null guard in credits.controller.ts
**Status:** fixed
**Files:** `src/adapters/controllers/credits.controller.ts`
**Commit:** c887935
**Change:** Removed the `&& job` condition from the `distanceKm` ternary. After a successful `useCase.execute()`, job cannot be null (the use case throws `NOT_FOUND` otherwise). Used `job!` non-null assertion to satisfy TypeScript at the call site. Note: included in same commit as WR-01 since both changes are in the same file and were applied together.

---

### WR-03 — Use generic error message in requireRole hook
**Status:** fixed
**Files:** `src/infrastructure/http/plugins/require-role.hook.ts`
**Commit:** 62ce990
**Change:** Added `request.log.error('requireRole invoked without prior authenticate hook')` before the throw, and changed the `DomainError` message from the diagnostic string to the generic `'Internal server error'`, preventing internal implementation details from being returned to API clients.

---

### WR-04 — Pass limit+1 for correct cursor pagination in ChatService
**Status:** fixed
**Files:** `src/adapters/services/chat.service.ts`
**Commit:** 13daf4d
**Change:** Changed `this.repo.findMessages(chatId, cursor, limit)` to `this.repo.findMessages(chatId, cursor, limit + 1)` so the standard "fetch N+1, check if extra" cursor pagination pattern works correctly. `hasNext` and `data.slice` logic was already correct and required no change.

---

### WR-05 — Replace `any` types in credit.repository.ts mapper methods
**Status:** fixed
**Files:** `src/adapters/repositories/credit.repository.ts`
**Commit:** b4c5549
**Change:** Changed `toJobDomain(row: any)` to `toJobDomain(row: Prisma.JobGetPayload<Record<string, never>>)` and `toCompanyDomain(row: any)` to `toCompanyDomain(row: Prisma.CompanyGetPayload<Record<string, never>>)`. The `Prisma` namespace was already imported. TypeScript now catches field renames in the Prisma schema at compile time.

---

## Skipped

None

---

_Fixed: 2026-05-15T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
