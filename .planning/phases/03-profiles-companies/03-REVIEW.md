---
phase: 03-profiles-companies
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/modules/company/company.service.ts
  - src/modules/company/company.repository.ts
findings:
  critical: 1
  warning: 1
  info: 1
  total: 3
status: issues_found
---

# Phase 03: Code Review Report (Gap-Closure Re-Review — 03-04)

**Reviewed:** 2026-05-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

This is a targeted re-review of the two files modified by the Phase 3 gap-closure plan (03-04), which fixed a Clean Architecture violation where `CompanyService.adjustCredits` previously imported `prisma` directly and ran `$transaction` at the service layer.

**What the fix did:** The `$transaction` call and the `CreditTransaction` audit record write were moved entirely into `CompanyRepository.adjustCredits`. The service now only imports `CompanyRepository` and `AppError` — no direct DB client imports remain. This correctly satisfies the Clean Architecture rule ("Services must not import DB clients directly").

**What remains broken:** The balance guard (`company.credits + delta < 0`) in the service still reads a credit snapshot via a separate `findById` call, then delegates to the repository. These are two separate database round-trips with no enclosing transaction, so the race condition from the original CR-01 finding is not resolved. Additionally, the `reason` field on `CreditTransaction` is hardcoded to `'admin_grant'`, making the audit log inaccurate for all non-admin callers of this method.

---

## Critical Issues

### CR-01: TOCTOU race condition in `adjustCredits` — credits can still go negative under concurrent load

**File:** `src/modules/company/company.service.ts:19-26`

**Issue:** The balance guard reads the current credit snapshot via `this.repo.findById(companyId)` (line 20), checks `company.credits + delta < 0` (line 22), then calls `this.repo.adjustCredits(companyId, delta)` (line 25) in a separate round-trip. The two operations are not wrapped in an enclosing transaction. Under concurrent load, two requests can both call `findById` simultaneously, both read the same balance (e.g., `credits: 1`), both pass the guard for `delta: -1`, and both writes will succeed — driving credits to `-1`.

Moving `$transaction` into the repository (the goal of 03-04) is architecturally correct, but it does not fix the race condition because the guard still executes outside that transaction. The fix requires that the guard and the write execute within the same atomic boundary.

The schema has no `CHECK (credits >= 0)` database constraint to serve as a safety net.

**Fix:** Move the balance guard into `CompanyRepository.adjustCredits` so it executes inside the `$transaction` block, where it reads a consistent (locked) snapshot before writing:

```typescript
// src/modules/company/company.repository.ts
async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant') {
  return prisma.$transaction(async (tx) => {
    // Read inside transaction so no other concurrent write can change this between
    // the guard check and the update.
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    if (company.credits + delta < 0) {
      throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS')
    }
    const updated = await tx.company.update({
      where: { id: companyId },
      data: { credits: { increment: delta } },
    })
    await tx.creditTransaction.create({
      data: { companyId, amount: delta, reason },
    })
    return updated
  })
}
```

```typescript
// src/modules/company/company.service.ts
async adjustCredits(companyId: string, delta: number) {
  // Guard and write are now atomic inside the repository transaction.
  // The service no longer needs to pre-fetch the company for the guard.
  return this.repo.adjustCredits(companyId, delta)
}
```

Note: The service-layer existence check (`Company not found`) is now handled inside the repository, which is acceptable because it is part of the same atomic operation. If a clean separation is preferred, the repository can re-throw or the service can retain the `findById` only for the existence error message — but it must not use that result for the balance check.

---

## Warnings

### WR-01: `reason` hardcoded to `'admin_grant'` — audit log is inaccurate for all non-admin callers

**File:** `src/modules/company/company.repository.ts:19`

**Issue:** `CreditTransaction.reason` is hardcoded to the string `'admin_grant'` inside `adjustCredits`. This method is the single repository-layer entry point for all credit adjustments across the entire system (admin grants, future unlock deductions, subscription purchases, etc.). Every non-admin operation will be recorded with the incorrect reason `'admin_grant'`, producing a permanently incorrect audit trail that cannot be corrected after the fact.

**Fix:** Accept `reason` as a parameter with a safe default:

```typescript
// src/modules/company/company.repository.ts
async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant') {
  return prisma.$transaction(async (tx) => {
    // ...
    await tx.creditTransaction.create({
      data: { companyId, amount: delta, reason },
    })
    // ...
  })
}
```

```typescript
// src/modules/company/company.service.ts
async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant') {
  return this.repo.adjustCredits(companyId, delta, reason)
}
```

Callers (e.g., a future `UnlockService`) can then pass `'unlock'` or `'purchase'` as appropriate.

---

## Info

### IN-01: Service `adjustCredits` existence check is now redundant and misleading

**File:** `src/modules/company/company.service.ts:20-21`

**Issue:** After the 03-04 fix, the service pre-fetches the company with `this.repo.findById(companyId)` solely to throw `'Company not found'` if it is null. However, `this.repo.adjustCredits` will also fail with a Prisma `P2025` ("Record to update not found") error if the company does not exist — producing an unhandled Prisma exception rather than a clean `AppError`. This creates two divergent error paths for the same condition: one clean `AppError` (if `findById` is fast) and one raw Prisma error (if the company is deleted between the two calls). Once the balance guard is moved into the repository (see CR-01 fix), the repository method can throw `AppError 404` directly, making this pre-fetch entirely unnecessary.

**Fix:** After applying the CR-01 fix (guard moved into repository), remove the redundant `findById` call from the service:

```typescript
// src/modules/company/company.service.ts
async adjustCredits(companyId: string, delta: number) {
  return this.repo.adjustCredits(companyId, delta)
}
```

The repository will surface `AppError 404` or `AppError 400` as needed, and the service passes them through naturally.

---

_Reviewed: 2026-05-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
