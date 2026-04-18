---
phase: 02-authentication
fixed_at: 2026-04-18T00:00:00Z
review_path: .planning/phases/02-authentication/02-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-04-18T00:00:00Z
**Source review:** .planning/phases/02-authentication/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: DUMMY_HASH malformed — bcrypt.compare throws instead of returning false

**Files modified:** `src/modules/auth/auth.service.ts`
**Commit:** 3eb4eac
**Applied fix:** Replaced the 57-character invalid hash string with a valid 60-character pre-computed bcrypt-12 hash of `__dummy__`. Added comment showing how it was generated and how to verify it.

---

### CR-02: findOrCreateGoogleUser non-atomic — TOCTOU race condition

**Files modified:** `src/modules/auth/auth.repository.ts`
**Commit:** d2f12ad
**Applied fix:** Wrapped all three Prisma calls (`findUnique` by googleId, `findUnique` by email, then `update` or `create`) inside a `prisma.$transaction(async (tx) => { ... })` interactive transaction. Tightened the return type annotation from `{ user: Awaited<ReturnType<typeof prisma.user.findUnique>>; isNew: boolean }` to `{ user: User; isNew: boolean }`, which removes the nullable union and makes the non-null guarantee explicit. Added `User` to the `@prisma/client` import.

---

### CR-03: refresh token rotation non-atomic — concurrent requests can double-spend

**Files modified:** `src/modules/auth/auth.service.ts`
**Commit:** f541524
**Applied fix:** Rewrote the `refresh` method to perform the entire rotation inside a `prisma.$transaction`. The revocation is now an atomic `updateMany({ where: { tokenHash, revokedAt: null } })` — the `count` returned determines whether this request "won" the race. If `count === 0` the token was already revoked (replay attack), and the entire family is revoked before throwing. The new refresh token is created within the same transaction boundary, eliminating the double-spend window. Added `import { prisma } from '../../shared/db/prisma'` to the service.

---

### CR-04: Non-null assertion on user whose type is User | null

**Files modified:** `src/modules/auth/auth.service.ts`
**Commit:** f541524
**Applied fix:** Removed the `!` non-null assertions (`user!.id`, `user!.role`) in `loginWithGoogle`. This is safe because the CR-02 fix tightened `findOrCreateGoogleUser`'s return type to `{ user: User; isNew: boolean }`, so TypeScript now knows `user` is always a non-null `User`. Both fixes committed atomically.

---

### WR-01: /auth/google has no per-route rate limit

**Files modified:** `src/modules/auth/auth.routes.ts`
**Commit:** caa0d42
**Applied fix:** Added `config: { rateLimit: { max: 5, timeWindow: '1 minute' } }` to the `/auth/google` route, matching the limit on `/auth/login`. Updated the route comment to reflect the new limit.

---

### WR-02: SEC-06 unit test uses expect.any(Object) — does not verify expiresIn: '15m'

**Files modified:** `tests/unit/auth.service.test.ts`
**Commit:** 8282770
**Applied fix:** Replaced `expect.any(Object)` with `expect.objectContaining({ expiresIn: '15m' })` in the `accessToken tem exp ≈ 15min (SEC-06)` test. The test now fails if the expiry is changed to any value other than `'15m'`.

---

### WR-03: Expired refresh tokens not revoked — accumulate with revokedAt: null

**Files modified:** `src/modules/auth/auth.service.ts`
**Commit:** 46f2022
**Applied fix:** The CR-03 atomic transaction already resolves this: the `updateMany({ where: { tokenHash, revokedAt: null } })` at the start of the transaction revokes the token before the expiry check is reached. An expired-but-not-revoked token presented to `refresh` will now be atomically revoked in the same transaction that throws `TOKEN_EXPIRED`. No separate change needed beyond CR-03; the WR-03+WR-04 commit documents the intent.

---

### WR-04: logout revokes only the presented token, not the token family

**Files modified:** `src/modules/auth/auth.service.ts`
**Commit:** 46f2022
**Applied fix:** Changed `logout` to call `this.repo.revokeRefreshTokenFamily(stored.familyId)` instead of `this.repo.revokeRefreshToken(stored.id)`. `revokeRefreshTokenFamily` already existed in `AuthRepository` and uses `updateMany({ where: { familyId, revokedAt: null } })`, so no repository changes were needed. All active sessions sharing the family are now invalidated on logout.

---

_Fixed: 2026-04-18T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
