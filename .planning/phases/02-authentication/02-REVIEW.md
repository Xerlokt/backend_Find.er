---
phase: 02-authentication
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - prisma/schema.prisma
  - src/app.ts
  - src/modules/auth/auth.repository.ts
  - src/modules/auth/auth.routes.ts
  - src/modules/auth/auth.service.ts
  - src/shared/db/prisma.ts
  - src/shared/errors/errorHandler.ts
  - src/shared/plugins/rate-limit.ts
  - tests/helpers/factories.ts
  - tests/helpers/setup.ts
  - tests/integration/auth.test.ts
  - tests/unit/auth.service.test.ts
  - tests/jest.setup-env.ts
  - jest.config.ts
findings:
  critical: 4
  warning: 4
  info: 3
  total: 11
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The authentication module is well-structured and satisfies the primary security requirements in the happy path: bcrypt-12, timing-safe login, JWT ≤ 15m, Zod validation on all endpoints, refresh token rotation with replay-detection, @fastify/helmet, and per-route rate limiting on register/login/refresh.

Four critical issues were found. The DUMMY_HASH constant used for timing-safe login is malformed — bcryptjs validates the hash structure before running the KDF, so the library throws instead of returning `false`, propagating a 500 and breaking the enumeration protection entirely. The three multi-step DB flows (findOrCreate for Google, token rotation in refresh, and email check-then-create in register) are non-atomic, each carrying a TOCTOU race condition that can emit duplicate tokens, unhandled P2002 errors, or silent data loss under concurrent requests. There is also a non-null assertion on the result of `findOrCreateGoogleUser` that the type signature does not guarantee to be non-null.

Four warnings cover a missing rate limit on `/auth/google`, an incomplete SEC-06 unit test that uses `expect.any(Object)` for the options argument and so cannot catch a wrong `expiresIn`, expired tokens not being revoked on detection, and logout only revoking a single token rather than the entire family.

---

## Critical Issues

### CR-01: `DUMMY_HASH` is malformed — `bcrypt.compare` throws instead of returning `false`

**File:** `src/modules/auth/auth.service.ts:17`

**Issue:** `'$2b$12$invalidhashpadding00000000000000000000000000000000000000'` is 57 characters long. A valid `$2b$12$` bcrypt hash is exactly 60 characters (prefix `$2b$12$` = 7, then 22-char base64url salt, then 31-char hash). `bcryptjs` validates the string length and character set before starting the Blowfish key schedule. A hash that is the wrong length causes `bcrypt.compare` to throw a synchronous `Error` instead of resolving to `false`. That error is not caught inside `login()`, so it propagates through `auth.routes.ts` to the global error handler as an unhandled error, returning HTTP 500. The timing-safe guarantee is also lost because the full KDF is never executed.

**Fix:** Replace with a valid pre-computed hash of a fixed throwaway plaintext (generated once, hard-coded):

```typescript
// Generated via: bcryptjs.hashSync('__dummy__', 12)
// Verify: length === 60 and starts with '$2b$12$'
const DUMMY_HASH = '$2b$12$LVfxFJGoT4lbSwHhLU8kCOy8xQpBLaIH5TNXLilzj5Wky3l2KBKP2'
```

Or generate it at module initialisation (adds ~300ms to startup, runs once):

```typescript
const DUMMY_HASH = bcrypt.hashSync('__dummy_constant__', 12)
```

---

### CR-02: `findOrCreateGoogleUser` is non-atomic — TOCTOU race condition

**File:** `src/modules/auth/auth.repository.ts:44-83`

**Issue:** The method executes three sequential Prisma calls outside any transaction: `findUnique(googleId)` (line 52), `findUnique(email)` (line 60), then `update` or `create` (lines 62-82). Two concurrent Google login requests for the same new email will both pass the `existing` check and both attempt `prisma.user.create`, with the second throwing a P2002 unique constraint error that surfaces as an unhandled 500. This also violates the project rule requiring atomic transactions for user-creation flows.

**Fix:** Wrap all three operations in a Prisma interactive transaction:

```typescript
async findOrCreateGoogleUser(data: {
  googleId: string; email: string; name?: string; avatarUrl?: string; role: 'CANDIDATE' | 'RECRUITER'
}): Promise<{ user: User; isNew: boolean }> {
  return prisma.$transaction(async (tx) => {
    const byGoogleId = await tx.user.findUnique({ where: { googleId: data.googleId } })
    if (byGoogleId) return { user: byGoogleId, isNew: false }

    const existing = await tx.user.findUnique({ where: { email: data.email } })
    if (existing) {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { googleId: data.googleId, avatarUrl: data.avatarUrl ?? existing.avatarUrl },
      })
      return { user: updated, isNew: false }
    }

    const created = await tx.user.create({
      data: { email: data.email, googleId: data.googleId, avatarUrl: data.avatarUrl, role: data.role as Role },
    })
    return { user: created, isNew: true }
  })
}
```

Tighten the return type to `{ user: User; isNew: boolean }` since every code path returns a non-null user.

---

### CR-03: `refresh` token rotation is non-atomic — concurrent requests can each receive a valid new token

**File:** `src/modules/auth/auth.service.ts:81-108`

**Issue:** `revokeRefreshToken(stored.id)` (line 100) and `createRefreshToken` inside `generateTokenPair` (line 76) are separate DB calls. Two concurrent requests presenting the same refresh token will both read `revokedAt: null` (line 89), both pass the revocation guard, and both call `revokeRefreshToken` followed by `createRefreshToken`. The second `revokeRefreshToken` is a silent no-op (already set), but both `createRefreshToken` calls succeed, producing two valid refresh tokens from a single parent — a double-spend. Neither is flagged as a replay.

**Fix:** Perform an atomic find-and-revoke inside a transaction, and issue the new token within the same transaction boundary:

```typescript
async refresh(rawToken: string): Promise<TokenPair> {
  const tokenHash = hashToken(rawToken)

  return prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    const stored = await tx.refreshToken.findUnique({ where: { tokenHash } })
    if (!stored) throw new AppError('Invalid token', 401, 'UNAUTHORIZED')

    if (revoked.count === 0) {
      await tx.refreshToken.updateMany({ where: { familyId: stored.familyId }, data: { revokedAt: new Date() } })
      throw new AppError('Token revoked', 401, 'TOKEN_EXPIRED')
    }

    if (stored.expiresAt < new Date()) throw new AppError('Token expired', 401, 'TOKEN_EXPIRED')

    const user = await tx.user.findUnique({ where: { id: stored.userId } })
    if (!user) throw new AppError('User not found', 401, 'UNAUTHORIZED')

    const { rawToken: newRaw, tokenHash: newHash } = generateRefreshToken()
    await tx.refreshToken.create({
      data: { tokenHash: newHash, familyId: stored.familyId, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    })
    const accessToken = this.app.jwt.sign({ id: user.id, role: user.role }, { expiresIn: '15m' })
    return { accessToken, refreshToken: newRaw }
  })
}
```

---

### CR-04: Non-null assertion on `user` whose type is `User | null`

**File:** `src/modules/auth/auth.service.ts:154`

**Issue:** `findOrCreateGoogleUser` is declared to return `{ user: Awaited<ReturnType<typeof prisma.user.findUnique>>; isNew: boolean }`. `prisma.user.findUnique` resolves to `User | null`, so `user` has type `User | null`. Lines 154 uses `user!.id` and `user!.role` — a non-null assertion over a nullable type. If the repository ever returns `{ user: null }` (which the type permits), this crashes at runtime with `TypeError: Cannot read properties of null`.

**Fix:** Add an explicit guard, or (preferred) tighten the return type of `findOrCreateGoogleUser` to `{ user: User; isNew: boolean }` since all code paths inside the method return a real user object:

```typescript
// Option A: runtime guard
const { user } = await this.repo.findOrCreateGoogleUser({ ... })
if (!user) {
  throw new AppError('Failed to resolve Google user', 500, 'INTERNAL_ERROR')
}
return this.generateTokenPair(user.id, user.role as string, familyId)

// Option B: fix the return type in auth.repository.ts (cleaner)
// Change return type annotation to: Promise<{ user: User; isNew: boolean }>
// This also removes the !-assertions and the current nullable union in the type.
```

---

## Warnings

### WR-01: `/auth/google` has no per-route rate limit — global 60 req/min applies

**File:** `src/modules/auth/auth.routes.ts:67`

**Issue:** `/auth/register` (3/min), `/auth/login` (5/min), and `/auth/refresh` (10/min) each have per-route limits. `/auth/google` and `/auth/logout` rely solely on the global 60 req/min default. The project security rules require rate limiting on login. Google OAuth login is login-equivalent — it triggers external token verification plus DB writes — and 60 requests/minute is 12× more permissive than `/auth/login`. The comment on line 66 notes this intentionally, but the security policy does not carve out an exception.

**Fix:**

```typescript
app.post('/google', {
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
}, async (request, reply) => {
```

---

### WR-02: SEC-06 unit test uses `expect.any(Object)` — does not verify `expiresIn: '15m'`

**File:** `tests/unit/auth.service.test.ts:114-117`

**Issue:** The test named `accessToken tem exp ≈ 15min (SEC-06)` calls:

```typescript
expect(app.jwt.sign).toHaveBeenCalledWith(
  expect.objectContaining({ id: 'user-1', role: 'CANDIDATE' }),
  expect.any(Object)
)
```

`expect.any(Object)` matches any options object, including `{ expiresIn: '99y' }`. The test does not enforce the 15m constraint it is named for, so the SEC-06 requirement would remain green even if the expiry were changed to a dangerous value.

**Fix:**

```typescript
expect(app.jwt.sign).toHaveBeenCalledWith(
  expect.objectContaining({ id: 'user-1', role: 'CANDIDATE' }),
  expect.objectContaining({ expiresIn: '15m' })
)
```

---

### WR-03: Expired refresh tokens are not revoked — accumulate indefinitely with `revokedAt: null`

**File:** `src/modules/auth/auth.service.ts:95-97`

**Issue:** When `stored.expiresAt < new Date()` the service throws `TOKEN_EXPIRED` without setting `revokedAt`. The token row stays in the database with `revokedAt: null` and `expiresAt` in the past. Any future lookup by the same `tokenHash` will again follow the expiry branch — the token is effectively in a permanent "expired but not revoked" limbo that bypasses the replay-detection branch (`revokedAt !== null`). Over time these rows accumulate without a cleanup path.

**Fix:** Mark the token as revoked before throwing:

```typescript
if (stored.expiresAt < new Date()) {
  await this.repo.revokeRefreshToken(stored.id)
  throw new AppError('Token expired', 401, 'TOKEN_EXPIRED')
}
```

---

### WR-04: `logout` revokes only the presented token, not the token family

**File:** `src/modules/auth/auth.service.ts:110-120`

**Issue:** `logout` calls `revokeRefreshToken(stored.id)`, revoking only the single supplied token. If the same user has multiple active sessions (e.g., phone + laptop), each session holds a different refresh token in the same family chain. After logout from one device, all other sessions remain fully valid. A stolen refresh token from a different device is not invalidated when the user logs out. The replay-attack flow in `refresh` already treats family revocation as the correct response to a security event — the same principle applies to an explicit logout.

**Fix (recommended):** Revoke the full family on logout:

```typescript
async logout(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken)
  const stored = await this.repo.findRefreshTokenByHash(tokenHash)
  if (!stored || stored.revokedAt !== null) return
  await this.repo.revokeRefreshTokenFamily(stored.familyId)
}
```

If single-device logout is a deliberate product decision, document it explicitly.

---

## Info

### IN-01: `generateTokenPair` and `hashToken` are public but should be private / unexported

**File:** `src/modules/auth/auth.service.ts:25`, `src/modules/auth/auth.service.ts:67`

**Issue:** `hashToken` is exported as a free function and `generateTokenPair` is a public method on `AuthService`. Both are internal implementation details. Exporting them increases the API surface and allows callers to bypass authentication checks by calling `generateTokenPair` directly with arbitrary inputs. Additionally, `tests/helpers/factories.ts:83` duplicates the `createHash('sha256')` logic instead of importing the shared `hashToken`, indicating the export is not being used consistently.

**Fix:** Remove `export` from `hashToken`. Change `generateTokenPair` to `private`. Update `factories.ts` to use the project's shared hashing utility if needed, or keep the inline SHA-256 there (acceptable in test helpers).

---

### IN-02: `DATABASE_URL_TEST` used with non-null assertion in three places — no guard against missing env var

**File:** `tests/helpers/setup.ts:6`, `tests/jest.setup-env.ts:4`, `tests/jest.global-setup.ts:4`

**Issue:** All three files use `process.env.DATABASE_URL_TEST!`. When the variable is absent, `DATABASE_URL` is set to the string `"undefined"`, Prisma attempts to connect to a server named `undefined`, and the failure message is confusing. A missing `.env.test` in CI gives no indication that the environment variable is the root cause.

**Fix:** Add a guard in each location:

```typescript
const testDb = process.env.DATABASE_URL_TEST
if (!testDb) throw new Error('DATABASE_URL_TEST must be set before running tests')
process.env.DATABASE_URL = testDb
```

---

### IN-03: `console.error` in production error handler bypasses structured logging

**File:** `src/shared/errors/errorHandler.ts:55`

**Issue:** `console.error('[errorHandler] Unhandled error:', error)` writes outside Fastify's logging pipeline. In production this bypasses log-level control, structured JSON output, and request correlation (requestId, traceId). The `_request` parameter is already available in the handler.

**Fix:**

```typescript
// Replace:
console.error('[errorHandler] Unhandled error:', error)
// With:
_request.log.error({ err: error }, 'Unhandled error')
```

---

_Reviewed: 2026-04-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
