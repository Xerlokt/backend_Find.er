---
phase: 10-infrastructure-auth-migration
fixed_at: 2026-05-08T00:00:00Z
review_path: .planning/phases/10-infrastructure-auth-migration/10-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-05-08T00:00:00Z
**Source review:** .planning/phases/10-infrastructure-auth-migration/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01 + WR-01 through WR-04)
- Fixed: 4 (WR-01, WR-02, WR-03, WR-04)
- Skipped: 1 (CR-01 — already fixed in prior session)

## Fixed Issues

### WR-01: loginWithGoogle always returns 201 — incorrect for returning users

**Files modified:** `src/application/use-cases/auth/login-with-google.use-case.ts`, `src/adapters/controllers/auth.controller.ts`
**Commit:** b14ded6
**Applied fix:** Updated `LoginWithGoogleUseCase.execute` return type to include `isNew: boolean` and threaded the `isNew` flag from `findOrCreateGoogle` through to the return value. Updated `loginWithGoogle` handler in `AuthController` to destructure `{ isNew, ...tokens }` and return `reply.status(isNew ? 201 : 200).send(tokens)`.

### WR-02: prisma.ts silently accepts undefined DATABASE_URL — deferred crash at query time

**Files modified:** `src/infrastructure/database/prisma.ts`
**Commit:** 428228a
**Applied fix:** Added a runtime guard in `createPrismaClient()` — if `process.env.DATABASE_URL` is falsy, throws `Error('DATABASE_URL environment variable is required')` immediately before constructing `PrismaPg`.

### WR-03: Use-case dependencies instantiated on every request in AuthController

**Files modified:** `src/adapters/controllers/auth.controller.ts`
**Commit:** 56c7fe0
**Applied fix:** Added constructor to `AuthController` accepting optional `userRepo: IUserRepository`, `refreshTokenRepo: IRefreshTokenRepository`, and `hash: IHashPort` parameters with `?? new DefaultImpl()` fallbacks. Added imports for the three interfaces. All five handlers now use `this.userRepo`, `this.refreshTokenRepo`, and `this.hash` instead of constructing new instances per-request. `JwtAdapter` remains per-request inside handlers as it requires `request.server`.

### WR-04: JWT_SECRET missing at runtime silently produces insecure tokens

**Files modified:** `src/infrastructure/http/plugins/jwt.plugin.ts`
**Commit:** 326ca93
**Applied fix:** Replaced `process.env.JWT_SECRET!` non-null assertion with an explicit runtime guard: reads into `const secret`, throws `Error('JWT_SECRET environment variable is required')` if falsy, then passes `secret` to `app.register(jwtPlugin, { secret, ... })`.

## Skipped Issues

### CR-01: Infrastructure plugins are dead code — app.ts imports old shared/plugins copies

**File:** `src/app.ts:3-7`
**Reason:** Already fixed in prior session — commit `35fed86` updated `app.ts` to import from `./infrastructure/http/plugins/*`. Skipping to avoid duplicate work.
**Original issue:** `app.ts` imported helmet, cors, jwt, rate-limit, and scheduler from `./shared/plugins/*` instead of the newly created `./infrastructure/http/plugins/*`, making the Phase 10 infrastructure plugin files dead code.

---

_Fixed: 2026-05-08T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
