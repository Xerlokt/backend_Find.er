# Phase 2: Authentication - Research

**Researched:** 2026-04-18
**Domain:** JWT authentication, refresh token rotation, Google OAuth2, Fastify rate limiting
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Persist refresh tokens in PostgreSQL via a new `RefreshToken` Prisma model. Fields: `id`, `tokenHash` (SHA-256 hash, not plaintext), `userId`, `expiresAt`, `revokedAt` (nullable), `createdAt`.
- **D-02:** Single-use rotation — each `/auth/refresh` revokes the presented token and issues a new one. Replay of a revoked token triggers revocation of the **entire token family** (security escalation).
- **D-03:** Refresh token TTL: **7 days**. Active sessions extend on each exchange.
- **D-04:** Token exchange pattern — `POST /auth/google` accepts `{ idToken: string, role: 'CANDIDATE' | 'RECRUITER' }`. Backend validates with `google-auth-library`, finds or creates User, returns JWT pair.
- **D-05:** Auto-create user on first Google login — if no user with that `googleId` exists, create one. Role required in request body.
- **D-06:** If Google account email matches existing email/password user, link `googleId` to existing account (upsert by email).
- **D-07:** Single endpoint `POST /auth/register` — body: `{ email, password, role: 'CANDIDATE' | 'RECRUITER' }`.
- **D-08:** Zod schema rejects `role: 'ADMIN'` with 422 Unprocessable Entity.
- **D-09:** `POST /auth/google` also rejects `role: 'ADMIN'` with 422.
- **D-10:** Per-endpoint rate limits via `@fastify/rate-limit` (keyed by IP):
  - `POST /auth/login`: 5 req/min
  - `POST /auth/register`: 3 req/min
  - `POST /auth/refresh`: 10 req/min
  - All other routes: 60 req/min (global default)
- **D-11:** Rate limit exceeded returns 429 with `{ error: 'Too Many Requests', retryAfter: N }`.
- **D-12:** Access token TTL: 15 min (already set in `src/shared/plugins/jwt.ts`).
- **D-13:** JWT payload: `{ id: string, role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN' }` (already typed in `authenticate.ts`).
- **D-14:** Auth errors use existing `AppError` → errorHandler pipeline with codes: `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`.

### Claude's Discretion
- Exact Prisma migration file naming and content.
- Whether to use `crypto.randomBytes` or `uuid` for refresh token generation before hashing (recommend `crypto.randomBytes(32)`).
- bcrypt vs SHA-256 for storing the refresh token hash (SHA-256 is fine for random tokens; bcrypt adds unnecessary overhead).

### Deferred Ideas (OUT OF SCOPE)
- Account linking UI (connect Google to existing email account) — v2 feature.
- Password reset / forgot password flow — not in Phase 2.
- Multi-device session management (list active sessions, revoke specific device) — v2.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can create account with email/password | `POST /auth/register` with Zod validation, bcrypt hash ≥ 12 rounds |
| AUTH-02 | User can login with email/password and receive JWT access + refresh token | `POST /auth/login`, bcrypt compare, sign JWT pair |
| AUTH-03 | User can authenticate via Google OAuth2 | `POST /auth/google`, `google-auth-library` verifyIdToken, user find-or-create |
| AUTH-04 | User can renew access token via refresh token | `POST /auth/refresh`, SHA-256 lookup, single-use rotation, family revocation on replay |
| AUTH-05 | User can logout (invalidate refresh token) | `POST /auth/logout`, mark token `revokedAt` in DB |
| AUTH-06 | Protected routes reject requests without valid JWT | `authenticate` preHandler already implemented in Phase 1 |
| SEC-04 | Passwords stored with bcrypt (salt rounds ≥ 12) | `bcryptjs` already installed, 12 rounds confirmed in factories.ts |
| SEC-05 | Rate limiting on sensitive routes (login, register, swipe) | `@fastify/rate-limit` 10.3.0 with per-route `config.rateLimit` override |
| SEC-06 | JWT short duration (access ≤ 15 min), refresh token with rotation | 15min already set; rotation with family revocation via DB |
</phase_requirements>

---

## Summary

Phase 2 delivers the complete authentication module for Job Tinder: email/password registration and login, Google OAuth2 token exchange, JWT access token issuance (15min TTL, already configured), and refresh token rotation with family-based replay attack detection stored in PostgreSQL.

The project already has all security infrastructure from Phase 1: `@fastify/jwt` registered at 15min TTL, the `authenticate` preHandler hook, `requireRole` guard, `AppError`/`errorHandler` pipeline, Zod, and bcryptjs. Phase 2 adds the new `auth` module (routes → service → repository), a Prisma migration for the `RefreshToken` model, the `@fastify/rate-limit` plugin registered globally in `app.ts`, and the `google-auth-library` package.

**Critical version note:** The project runs **Fastify 5.8.5** (not v4 as stated in CLAUDE.md — CLAUDE.md is outdated). All plugin versions in use (`@fastify/rate-limit` 10.x, `@fastify/jwt` 10.x) are built against Fastify `^5.0.0` and are fully compatible. The planner must use Fastify 5 API patterns, not Fastify 4.

**Primary recommendation:** Follow the established health module pattern (`routes.ts` + `service.ts` + `repository.ts`), register rate-limit globally in `app.ts` before routes, use `crypto.randomBytes(32)` + `crypto.createHash('sha256')` for refresh tokens, and `google-auth-library`'s `OAuth2Client.verifyIdToken()` for Google ID token validation.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email/password register | API / Backend | — | Server-side bcrypt hashing, DB write — never client-side |
| Email/password login | API / Backend | — | Credential verification, token issuance — must be server-side |
| Google ID token validation | API / Backend | — | Must use server-side `google-auth-library`; never trust client-side decode |
| JWT access token verification | API / Backend | — | `authenticate` preHandler already handles this |
| Refresh token storage | Database / Storage | API / Backend | PostgreSQL via Prisma; service layer owns rotation logic |
| Refresh token rotation | API / Backend | Database / Storage | Service decides, repository executes |
| Rate limiting | API / Backend | — | `@fastify/rate-limit` at Fastify plugin level, before route handler |
| Role-based route guards | API / Backend | — | `requireRole` preHandler already implemented |

---

## Standard Stack

### Core (all already installed)
| Library | Installed Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| `fastify` | 5.8.5 | HTTP server | Already in project |
| `@fastify/jwt` | 10.0.0 | JWT sign/verify | Already registered with 15min TTL |
| `@fastify/rate-limit` | 10.3.0 | Per-route rate limiting | Already installed; supports Fastify 5 |
| `bcryptjs` | 3.0.3 | Password hashing | Already installed, salt 12 confirmed |
| `zod` | 4.3.6 | Input validation | Already used across project |
| `@prisma/client` | 7.7.0 | Database ORM | Already used across project |
| `crypto` | built-in Node.js | Refresh token generation + SHA-256 hash | No install needed |

### To Install (not yet in package.json)
| Library | Latest Version | Purpose | Why Standard |
|---------|--------------|---------|--------------|
| `google-auth-library` | 10.6.2 [VERIFIED: npm registry] | Validate Google ID tokens | Official Google Node.js client; handles public key rotation automatically |

**Installation:**
```bash
npm install google-auth-library
```

**Version verification (run before planning):**
```bash
npm view google-auth-library version      # 10.6.2 as of 2026-04-18
npm view @fastify/rate-limit version      # 10.3.0 as of 2026-04-18
```

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
     │
     ▼
[@fastify/rate-limit] ── 429 Too Many Requests (if limit exceeded)
     │
     ▼
[Zod Validation] ── 422 / 400 Validation Error (if schema fails)
     │
     ▼
[auth.routes.ts] ── dispatches to service
     │
     ├─ POST /auth/register ──► [AuthService.register]
     │                                │
     │                         bcrypt.hash(password, 12)
     │                         prisma.user.create()
     │                         generateTokenPair()
     │                                │
     │                         ◄── { accessToken, refreshToken }
     │
     ├─ POST /auth/login ────► [AuthService.login]
     │                                │
     │                         prisma.user.findUnique(email)
     │                         bcrypt.compare(password, hash)
     │                         generateTokenPair()
     │                                │
     │                         ◄── { accessToken, refreshToken }
     │
     ├─ POST /auth/google ───► [AuthService.loginWithGoogle]
     │                                │
     │                         OAuth2Client.verifyIdToken(idToken)
     │                         prisma.user.upsert(email) [link googleId]
     │                         generateTokenPair()
     │                                │
     │                         ◄── { accessToken, refreshToken }
     │
     ├─ POST /auth/refresh ──► [AuthService.refresh]
     │                                │
     │                         SHA-256(rawToken) → DB lookup
     │                         if revoked → revoke family → 401
     │                         prisma.refreshToken.update (revokedAt)
     │                         generateTokenPair() (new family member)
     │                                │
     │                         ◄── { accessToken, refreshToken }
     │
     └─ POST /auth/logout ───► [AuthService.logout]
                                      │
                               SHA-256(rawToken) → DB lookup
                               prisma.refreshToken.update (revokedAt)
                                      │
                               ◄── 204 No Content

generateTokenPair():
  rawToken = crypto.randomBytes(32).hex()
  tokenHash = SHA-256(rawToken)
  app.jwt.sign({ id, role }) → accessToken
  prisma.refreshToken.create({ tokenHash, userId, familyId, expiresAt }) → stored
  return { accessToken, refreshToken: rawToken }
```

### Recommended Project Structure
```
src/
├── modules/
│   ├── health/                 # existing
│   │   └── health.routes.ts
│   └── auth/                   # NEW - Phase 2
│       ├── auth.routes.ts      # Fastify route plugin, registers /auth/* with prefix
│       ├── auth.service.ts     # Business logic: register, login, loginWithGoogle, refresh, logout
│       └── auth.repository.ts  # Prisma queries: findUserByEmail, createUser, createToken, etc.
├── shared/
│   ├── plugins/
│   │   ├── helmet.ts           # existing
│   │   ├── cors.ts             # existing
│   │   ├── jwt.ts              # existing
│   │   └── rate-limit.ts       # NEW - global rate-limit plugin wrapper
│   ├── hooks/
│   │   ├── authenticate.ts     # existing - reuse as-is
│   │   └── requireRole.ts      # existing - reuse as-is
│   ├── db/
│   │   └── prisma.ts           # existing
│   └── errors/
│       ├── AppError.ts         # existing
│       └── errorHandler.ts     # existing
prisma/
├── schema.prisma               # ADD RefreshToken model
└── migrations/
    └── YYYYMMDDHHMMSS_add_refresh_token/   # NEW migration
```

### Pattern 1: @fastify/rate-limit Global Registration with Per-Route Override

Register as a shared plugin using `fastify-plugin` (`fp`) wrapper so it is not encapsulated and applies to all routes. Then override per route using `config.rateLimit`.

```typescript
// src/shared/plugins/rate-limit.ts
// Source: https://github.com/fastify/fastify-rate-limit/blob/master/README.md [VERIFIED]
import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { FastifyInstance } from 'fastify'

export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      error: 'Too Many Requests',
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  })
})
```

```typescript
// src/modules/auth/auth.routes.ts — per-route override
// Source: https://github.com/fastify/fastify-rate-limit/blob/master/README.md [VERIFIED]
fastify.post('/login', {
  config: {
    rateLimit: { max: 5, timeWindow: '1 minute' },
  },
}, loginHandler)

fastify.post('/register', {
  config: {
    rateLimit: { max: 3, timeWindow: '1 minute' },
  },
}, registerHandler)

fastify.post('/refresh', {
  config: {
    rateLimit: { max: 10, timeWindow: '1 minute' },
  },
}, refreshHandler)
```

**Critical ordering in app.ts:** rate-limit plugin MUST be registered before routes.

```typescript
// src/app.ts additions
import rateLimitPlugin from './shared/plugins/rate-limit'

await app.register(helmetPlugin)
await app.register(corsPlugin)
await app.register(jwtPlugin)
await app.register(rateLimitPlugin)   // BEFORE routes

await app.register(healthRoutes)
await app.register(authRoutes, { prefix: '/auth' })  // prefix pattern
```

### Pattern 2: Google ID Token Validation

```typescript
// Source: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token [CITED]
import { OAuth2Client } from 'google-auth-library'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export async function verifyGoogleToken(idToken: string) {
  // Throws Error if token is invalid, expired, or audience mismatch
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  })
  const payload = ticket.getPayload()!
  return {
    googleId: payload.sub,         // unique, stable Google user ID
    email: payload.email!,
    name: payload.name,
    avatarUrl: payload.picture,
  }
}
```

**Error handling:** `verifyIdToken` throws a generic `Error` (not typed subclass) on failure. Catch it and throw `AppError('Invalid Google token', 401, 'INVALID_CREDENTIALS')`.

**GOOGLE_CLIENT_ID env var:** Already declared in `.env` and `.env.example` as `your-google-client-id`. The integration tests will require a real client ID or the test must mock `OAuth2Client.verifyIdToken`. For unit tests: mock the entire `google-auth-library` module.

### Pattern 3: Refresh Token Generation + SHA-256 Storage

```typescript
// Source: Node.js crypto docs [CITED: nodejs.org/api/crypto.html]
import { randomBytes, createHash } from 'crypto'

export function generateRefreshToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')  // 64 hex chars, 256 bits of entropy
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  return { rawToken, tokenHash }
}
```

**Why SHA-256 not bcrypt for refresh tokens:** Raw token is `crypto.randomBytes(32)` — 256 bits of entropy makes rainbow table attacks computationally infeasible. Bcrypt is designed for low-entropy user passwords. SHA-256 lookup is O(1) vs bcrypt's intentional slowness. [ASSUMED — this is a widely accepted pattern, not verified against a single authoritative source]

### Pattern 4: Token Family Revocation on Replay

The `familyId` field groups tokens issued from the same login session. Each rotation creates a new token in the same family. If a revoked token is presented again, revoke ALL tokens with that `familyId`.

```typescript
// auth.repository.ts
async findByHash(tokenHash: string) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } })
}

async revokeFamily(familyId: string) {
  return prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

async revoke(id: string) {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  })
}
```

```typescript
// auth.service.ts — refresh logic
async refresh(rawToken: string): Promise<TokenPair> {
  const tokenHash = sha256(rawToken)
  const stored = await this.repo.findByHash(tokenHash)

  if (!stored) {
    throw new AppError('Invalid token', 401, 'UNAUTHORIZED')
  }

  if (stored.revokedAt !== null) {
    // Replay attack — revoke entire family
    await this.repo.revokeFamily(stored.familyId)
    throw new AppError('Token revoked', 401, 'TOKEN_EXPIRED')
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError('Token expired', 401, 'TOKEN_EXPIRED')
  }

  // Rotate: revoke current, issue new in same family
  await this.repo.revoke(stored.id)
  return this.generateTokenPair(stored.userId, stored.familyId)
}
```

### Pattern 5: Prisma RefreshToken Model

```prisma
// prisma/schema.prisma — add to existing schema
model RefreshToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique
  familyId  String    // groups tokens from same login session
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([familyId])
  @@index([userId])
}
```

**User model addition required:** Add `refreshTokens RefreshToken[]` relation to existing `User` model.

### Pattern 6: Route Registration with Prefix (Fastify 5)

```typescript
// src/modules/auth/auth.routes.ts
// Source: https://fastify.dev/docs/latest/Reference/Routes/ [CITED]
import { FastifyInstance } from 'fastify'
import { AuthService } from './auth.service'
import { AuthRepository } from './auth.repository'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const repo = new AuthRepository()
  const service = new AuthService(repo, app)

  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    // parse with Zod, call service.register()
    return reply.status(201).send(result)
  })
  // ... other routes
}

// In app.ts:
await app.register(authRoutes, { prefix: '/auth' })
// Results in: POST /auth/register, POST /auth/login, etc.
```

### Anti-Patterns to Avoid

- **Storing raw refresh tokens in DB:** Store only `SHA-256(rawToken)`. Return raw token to client once.
- **Using bcrypt for refresh token hashing:** Unnecessary overhead for high-entropy random tokens.
- **Signing refresh tokens as JWTs:** Refresh tokens here are opaque random values stored in DB. Do not sign them as JWTs — that would prevent server-side revocation.
- **Generating familyId inside JWT payload:** familyId is a DB-only concept. Keep it in the `RefreshToken` table.
- **Registering rate-limit without `fp` wrapper:** Without `fastify-plugin`, the plugin is encapsulated and will not apply to routes registered in sibling `register()` calls.
- **Registering rate-limit AFTER routes:** The plugin must be registered before any routes to apply limits.
- **Using `@fastify/oauth2` for Google:** D-04 decision uses token exchange pattern (`idToken` in POST body), not the redirect/callback OAuth2 flow. `@fastify/oauth2` is for the redirect flow. Do NOT use it here.
- **Mixing `authenticate` into auth routes:** `/auth/register`, `/auth/login`, `/auth/google` are public routes — no `authenticate` preHandler. `/auth/refresh` and `/auth/logout` receive the refresh token in body, not as JWT bearer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google public key rotation | Manual JWKS fetching | `google-auth-library` OAuth2Client | Google rotates signing keys; library handles this automatically |
| Rate limiting | Custom in-memory counter | `@fastify/rate-limit` | Handles distributed state, sliding window, headers, 429 response |
| JWT sign/verify | Manual JWT library | `@fastify/jwt` (already registered) | Already integrated with Fastify request lifecycle |
| Password hashing | Custom hash function | `bcryptjs` (already installed) | Timing-safe comparison via `bcrypt.compare` |
| Refresh token entropy | UUID v4 | `crypto.randomBytes(32)` | 256 bits vs UUID's 122 bits; cryptographically secure |
| Token cleanup | Manual scheduled job | Prisma query with `expiresAt < now()` | Simple DB query in repository; scheduler belongs in future phase |

**Key insight:** The hardest parts (Google key rotation, timing-safe password comparison, JWT lifecycle) are handled by well-tested libraries. Custom implementations of these are primary sources of authentication vulnerabilities.

---

## Common Pitfalls

### Pitfall 1: errorResponseBuilder Return Shape
**What goes wrong:** `@fastify/rate-limit` default 429 response is `{ statusCode, error, message }` — this does NOT match D-11 which requires `{ error: 'Too Many Requests', retryAfter: N }`.
**Why it happens:** Plugin has its own default shape; decision D-11 specifies a custom shape.
**How to avoid:** Use `errorResponseBuilder` in the rate-limit plugin registration to return the exact shape from D-11.
**Code:**
```typescript
errorResponseBuilder: (_request, context) => ({
  error: 'Too Many Requests',
  retryAfter: Math.ceil(context.ttl / 1000),  // context.ttl is in milliseconds
})
```

### Pitfall 2: Rate-limit Plugin Encapsulation
**What goes wrong:** Rate-limit registered without `fp` wrapper only applies to routes in the same `register()` scope.
**Why it happens:** Fastify's encapsulation model — plugins registered in a scope are not visible to sibling scopes.
**How to avoid:** Always wrap the rate-limit registration with `fastify-plugin` (`fp`). Confirmed: `fastify-plugin` is already in `dependencies`.
**Warning signs:** Rate limiting works on some routes but not others.

### Pitfall 3: Google `verifyIdToken` Error Type
**What goes wrong:** Code catches a specific error class that doesn't exist — `google-auth-library` throws a plain `Error`, not a typed subclass.
**Why it happens:** Library does not export custom error types for token verification failures.
**How to avoid:** Catch generic `Error`, then throw `AppError('Invalid Google token', 401, 'INVALID_CREDENTIALS')`.

### Pitfall 4: Replay Detection Race Condition
**What goes wrong:** Two concurrent `/auth/refresh` requests with the same token — both pass the "is revoked?" check simultaneously.
**Why it happens:** Non-atomic check-then-update pattern.
**How to avoid:** Use a Prisma transaction for the token lookup + revocation, or rely on the `@unique` constraint on `tokenHash` — a second `update` on an already-revoked token will simply find `revokedAt !== null` and trigger the family revocation.
**Note:** Given the 7-day TTL and single-device assumption, this edge case is low-risk but worth documenting for the planner.

### Pitfall 5: Missing `familyId` on Login
**What goes wrong:** Omitting `familyId` from the `RefreshToken` model means family-based revocation requires querying by `userId`, which would log out ALL sessions rather than just the compromised family.
**Why it happens:** D-02 (family revocation) is easy to under-implement.
**How to avoid:** Generate a new `familyId = crypto.randomUUID()` at login/register/google-login. Carry `familyId` on rotation.

### Pitfall 6: `GOOGLE_CLIENT_ID` Not Set in Test Environment
**What goes wrong:** Integration tests that call `POST /auth/google` will call real Google servers and require a real ID token.
**Why it happens:** `google-auth-library` makes network calls to fetch Google's public keys.
**How to avoid:** For unit tests — mock the `google-auth-library` module in Jest. For integration tests — mock `OAuth2Client.verifyIdToken` using `jest.spyOn` or skip the Google route in integration tests with a note.

### Pitfall 7: Prisma v7 Migration Behavior
**What goes wrong:** `prisma migrate dev` fails because `DATABASE_URL` is in `prisma.config.ts` (not `schema.prisma`) — the datasource URL must be available as an env var.
**Why it happens:** Phase 1 decision (01-01): Prisma v7 moved URL to `prisma.config.ts`. CLI commands still read from env var `DATABASE_URL`.
**How to avoid:** Always run migrations with `DATABASE_URL` set in the shell environment. Confirmed: `.env` has `DATABASE_URL` set.

### Pitfall 8: setup.ts AfterEach Missing RefreshToken Cleanup
**What goes wrong:** Integration tests leak `RefreshToken` rows between test cases, causing unique constraint violations on `tokenHash`.
**Why it happens:** `tests/helpers/setup.ts` `afterEach` only cleans known tables. `RefreshToken` is new.
**How to avoid:** Add `await prisma.refreshToken.deleteMany()` to `afterEach` in `setup.ts`, before `await prisma.user.deleteMany()` (FK order: child before parent).

---

## Code Examples

### Complete Refresh Token Generation Helper
```typescript
// Source: Node.js built-in crypto [CITED: nodejs.org/api/crypto.html]
import { randomBytes, createHash } from 'crypto'

export function generateRefreshToken() {
  const rawToken = randomBytes(32).toString('hex')   // return to client
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')  // store in DB
  return { rawToken, tokenHash }
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}
```

### Zod Schema for Register (rejects ADMIN)
```typescript
import { z } from 'zod'

export const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),  // ADMIN deliberately excluded → 422 on attempt
})

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const GoogleBodySchema = z.object({
  idToken: z.string().min(1),
  role: z.enum(['CANDIDATE', 'RECRUITER']),  // ADMIN excluded per D-09
})

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})
```

**Note:** Zod v4.3.6 is installed. In Zod v4, `z.enum(['A', 'B'])` takes an array (same as v3). No API change needed.

### errorHandler Update for VALIDATION_ERROR Code
The current `errorHandler` sends `{ error: message }` for `AppError`. D-14 requires code `VALIDATION_ERROR` for 422 ADMIN rejection. The code is in `AppError.code` but the current `errorHandler` does not include `code` in the response body. **Decision needed for planner:** Either update `errorHandler` to include `code` in the response body, or accept current behavior where code is internal only.

**Recommendation:** Update `errorHandler` to include `code` in `AppError` responses:
```typescript
reply.status(error.statusCode).send({ error: error.message, code: error.code })
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Refresh tokens as JWTs | Opaque random tokens stored in DB | ~2021 (industry shift) | Server-side revocation becomes possible |
| Bcrypt for all token hashing | SHA-256 for high-entropy random tokens | N/A | Performance; bcrypt still required for passwords |
| Per-user token revocation | Token family revocation on replay | ~2020 (RFC 6819 guidance) | Revokes only the compromised session, not all sessions |
| `@fastify/oauth2` for Google | `google-auth-library` verifyIdToken | N/A (different use case) | Token exchange pattern avoids redirect flow complexity |

**Fastify 4 vs 5 (critical for this project):**
- The installed version is **Fastify 5.8.5** [VERIFIED: node_modules/fastify/package.json]
- CLAUDE.md states "Fastify 4" — this is outdated
- All installed plugins (`@fastify/rate-limit` 10.x, `@fastify/jwt` 10.x) target Fastify `^5.0.0` [VERIFIED: devDependency on fastify@^5.0.0]
- Fastify 5 removed `done()` callback pattern — all plugins must use `async/await` (already the pattern in this codebase)

---

## Runtime State Inventory

> This is not a rename/refactor/migration phase — no legacy strings to replace. This section is not applicable.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Integration tests (real DB) | Installed but NOT running | 29.2.0 | None — must start Docker Desktop before integration tests |
| PostgreSQL (via Docker) | Prisma migrations, integration tests | Not running (Docker stopped) | 16 (via compose) | None — required for DB tests |
| Node.js | All | Assumed ✓ | 20.x assumed | — |
| `google-auth-library` | AUTH-03 | NOT INSTALLED [VERIFIED] | — | Must install before implementation |
| `GOOGLE_CLIENT_ID` env var | AUTH-03 | Set to placeholder `your-google-client-id` | — | Unit tests: mock the library; integration tests: skip or use jest.spyOn |

**Missing dependencies with no fallback:**
- Docker Desktop must be started before running `npm run test:integration` or `npx prisma migrate dev`.
- `google-auth-library` must be installed: `npm install google-auth-library`.

**Missing dependencies with fallback:**
- `GOOGLE_CLIENT_ID` real value: Unit tests can mock `OAuth2Client.verifyIdToken`. Integration tests should `jest.spyOn` on the client method.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.9 |
| Config file | `jest.config.ts` |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm test` (runs in band) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | POST /auth/register creates user with hashed password | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| AUTH-01 | AuthService.register hashes password, throws on duplicate email | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ Wave 0 |
| AUTH-02 | POST /auth/login returns JWT pair on valid credentials | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| AUTH-02 | AuthService.login throws INVALID_CREDENTIALS on wrong password | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ Wave 0 |
| AUTH-03 | AuthService.loginWithGoogle calls verifyIdToken and upserts user | unit (mocked) | `npm run test:unit -- --testPathPattern=auth.service` | ❌ Wave 0 |
| AUTH-04 | POST /auth/refresh rotates token, returns new pair | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| AUTH-04 | POST /auth/refresh with replayed revoked token revokes family | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| AUTH-05 | POST /auth/logout marks token revokedAt in DB | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| AUTH-06 | Protected route with no JWT returns 401 UNAUTHORIZED | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| SEC-04 | Registered user passwordHash starts with $2b$ (bcrypt round 12) | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ Wave 0 |
| SEC-05 | POST /auth/login 6th request in 1 minute returns 429 | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ Wave 0 |
| SEC-06 | Access token payload exp is ~15min from issuance | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --testPathPattern=auth.service`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/auth.service.test.ts` — covers AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, SEC-04, SEC-06
- [ ] `tests/integration/auth.test.ts` — covers all AUTH-* + SEC-05 (rate limit), AUTH-06 (route guard)
- [ ] Update `tests/helpers/setup.ts` `afterEach` to add `prisma.refreshToken.deleteMany()` before `prisma.user.deleteMany()`
- [ ] Update `tests/helpers/factories.ts` to add `createRefreshToken()` factory helper

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | bcryptjs ≥ 12 rounds; constant-time compare via `bcrypt.compare` |
| V3 Session Management | yes | Refresh token single-use rotation; family revocation on replay; 7-day TTL |
| V4 Access Control | yes | `requireRole` preHandler; ADMIN role blocked from self-registration |
| V5 Input Validation | yes | Zod schemas on all auth endpoints |
| V6 Cryptography | yes | `crypto.randomBytes(32)` for tokens; SHA-256 for storage; never hand-rolled |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Brute-force login | Tampering | `@fastify/rate-limit` 5 req/min on `/auth/login`; bcrypt timing resistance |
| Refresh token theft + replay | Elevation of Privilege | Single-use rotation; family revocation on replay detection |
| JWT secret exposure | Information Disclosure | `JWT_SECRET` in env var; never hardcoded; ≤15min TTL limits blast radius |
| Google ID token spoofing | Spoofing | `google-auth-library` verifies signature + audience + expiry |
| SQL injection via email | Tampering | Prisma ORM parameterized queries; never raw SQL with interpolation |
| ADMIN self-registration | Elevation of Privilege | Zod enum excludes ADMIN role; returns 422 |
| Timing attacks on email enumeration | Information Disclosure | Return same error (`INVALID_CREDENTIALS`) for both wrong email and wrong password |

**Timing attack on email enumeration:** `AuthService.login` must always call `bcrypt.compare` even when user is not found, to prevent timing-based user enumeration:
```typescript
// If user not found, still run bcrypt to prevent timing leak
const dummyHash = '$2b$12$invalidhashpadding000000000000000000000000000000000000'
await bcrypt.compare(password, user?.passwordHash ?? dummyHash)
if (!user || !passwordMatch) {
  throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
}
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SHA-256 is sufficient for refresh token storage (vs bcrypt) because tokens are cryptographically random | Standard Stack / Code Examples | Low — 256 bits entropy makes preimage attacks infeasible regardless of hash algorithm |
| A2 | `google-auth-library` v10 `OAuth2Client.verifyIdToken` API is unchanged from v9 | Code Examples | Low — Google Auth Library maintains stable API; check package changelog if errors occur |
| A3 | Integration tests will mock `verifyIdToken` rather than use real Google credentials | Validation Architecture | Medium — if project requires real OAuth flow in integration tests, a test Google account is needed |
| A4 | `errorHandler` will be updated to include `code` in AppError responses | Code Examples | Medium — without the `code` field in responses, clients cannot distinguish error types |

---

## Open Questions

1. **errorHandler `code` field in response**
   - What we know: Current `errorHandler` sends `{ error: message }` for `AppError` — `code` is internal only.
   - What's unclear: D-14 specifies error codes (`INVALID_CREDENTIALS`, etc.) — should these appear in the HTTP response body?
   - Recommendation: Yes — update `errorHandler` to `{ error: message, code: error.code }`. This is a small change to an existing shared file. Planner should include this as a task.

2. **Google integration test strategy**
   - What we know: `GOOGLE_CLIENT_ID` is placeholder; Docker is not running.
   - What's unclear: Should integration tests for `/auth/google` use `jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')` or skip entirely?
   - Recommendation: Use `jest.spyOn` in integration tests — this tests the full HTTP path (routing, Zod validation, repository writes) without real Google credentials. Document that in production the `GOOGLE_CLIENT_ID` must be set.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/fastify/package.json` — confirmed Fastify 5.8.5 installed [VERIFIED]
- `node_modules/@fastify/rate-limit/package.json` — confirmed v10.3.0, devDep on fastify ^5.0.0 [VERIFIED]
- `node_modules/bcryptjs/package.json` — confirmed v3.0.3 installed [VERIFIED]
- `node_modules/@fastify/jwt/package.json` — confirmed v10.0.0 installed [VERIFIED]
- `npm view google-auth-library version` — 10.6.2, NOT installed in project [VERIFIED]
- `https://github.com/fastify/fastify-rate-limit/blob/master/README.md` — global registration, per-route config.rateLimit, errorResponseBuilder [CITED]
- `https://developers.google.com/identity/gsi/web/guides/verify-google-id-token` — verifyIdToken signature, payload fields [CITED]
- `https://nodejs.org/api/crypto.html` — randomBytes + createHash usage [CITED]
- `https://fastify.dev/docs/latest/Reference/Routes/` — register with prefix pattern [CITED]
- Existing codebase: `src/app.ts`, `src/shared/plugins/*.ts`, `src/modules/health/health.routes.ts`, `tests/helpers/setup.ts`, `tests/helpers/factories.ts` [VERIFIED]
- `prisma/schema.prisma` — User model fields, confirmed no RefreshToken model yet [VERIFIED]

### Secondary (MEDIUM confidence)
- `https://github.com/fastify/fastify-rate-limit` — per-route rate limit, global:false option, keyGenerator [CITED]

### Tertiary (LOW confidence)
- WebSearch results on token family revocation pattern — corroborated against multiple sources, pattern is well-established in industry [LOW: no single authoritative RFC citation]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions verified via npm registry and node_modules
- Architecture: HIGH — based on existing codebase patterns + verified library docs
- Pitfalls: HIGH — based on direct code inspection + library docs + known security patterns
- Google OAuth integration: MEDIUM — library docs verified, test strategy is assumed

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable libraries; google-auth-library API is stable)
