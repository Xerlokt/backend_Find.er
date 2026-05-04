---
phase: 03-profiles-companies
fixed_at: 2026-05-04T00:00:00Z
review_path: .planning/phases/03-profiles-companies/03-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-05-04T00:00:00Z
**Source review:** .planning/phases/03-profiles-companies/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (CR-01, WR-01; IN-01 excluded by fix_scope=critical_warning)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: TOCTOU race condition in `adjustCredits` — credits can still go negative under concurrent load

**Files modified:** `src/modules/company/company.repository.ts`, `src/modules/company/company.service.ts`, `tests/unit/company.service.test.ts`
**Commit:** 21a3a72
**Applied fix:** Moved the balance guard (`company.credits + delta < 0`) and the NOT_FOUND check from the service layer into the body of `prisma.$transaction` inside `CompanyRepository.adjustCredits`. The guard now reads a consistent snapshot via `tx.company.findUnique` within the same transaction, so no concurrent write can interleave between the read and the update. The service's `adjustCredits` was simplified to a single delegation call, removing the separate `findById` pre-fetch that created the TOCTOU window.

### WR-01: `reason` hardcoded to `'admin_grant'` — audit log is inaccurate for all non-admin callers

**Files modified:** `src/modules/company/company.repository.ts`, `src/modules/company/company.service.ts`, `tests/unit/company.service.test.ts`
**Commit:** 21a3a72
**Applied fix:** Added `reason: string = 'admin_grant'` parameter to both `CompanyRepository.adjustCredits` and `CompanyService.adjustCredits`. The `CreditTransaction` record now uses the passed-in reason rather than the hardcoded literal. Existing callers (`company.routes.ts` and `admin.routes.ts` via `AdminService.adjustCredits`) continue to work without changes — `AdminService` already passes `'admin_grant'` explicitly, and the default value covers all remaining call sites. Unit tests were updated to assert the three-argument call to `repo.adjustCredits`, cover the new `reason` forwarding behaviour, and verify that errors thrown by the repository propagate cleanly through the service; all 7 tests pass.

---

_Fixed: 2026-05-04T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
