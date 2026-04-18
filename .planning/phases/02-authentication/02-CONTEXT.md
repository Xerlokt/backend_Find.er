# Phase 2: Authentication - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver secure user authentication: email/password registration + login, Google OAuth2 (token exchange), JWT access tokens, refresh token rotation with revocation, and route guards. No profile creation — only the User record and auth token pair.

</domain>

<decisions>
## Implementation Decisions

### Refresh Token Storage
- **D-01:** Persist refresh tokens in PostgreSQL via a new `RefreshToken` Prisma model. Fields: `id`, `tokenHash` (store bcrypt/SHA-256 hash, not plaintext), `userId`, `expiresAt`, `revokedAt` (nullable), `createdAt`.
- **D-02:** Single-use rotation — each `/auth/refresh` call revokes the presented token and issues a new one. Replay of a revoked token triggers revocation of the entire token family (security escalation).
- **D-03:** Refresh token TTL: **7 days**. Active sessions extend on each exchange.

### Google OAuth2
- **D-04:** Token exchange pattern — `POST /auth/google` accepts `{ idToken: string, role: 'CANDIDATE' | 'RECRUITER' }` in body. Backend validates the Google ID token (using `google-auth-library`), finds or creates the User record, returns the same JWT pair as email/password login.
- **D-05:** Auto-create user on first Google login — if no user with that `googleId` exists, create one. Role is required in the request body for new users.
- **D-06:** If a Google account email matches an existing email/password user, link the `googleId` to the existing account (upsert by email).

### Registration & Role Assignment
- **D-07:** Single endpoint `POST /auth/register` — body: `{ email, password, role: 'CANDIDATE' | 'RECRUITER' }`.
- **D-08:** Zod schema rejects `role: 'ADMIN'` with 422 Unprocessable Entity. ADMIN role is seeded via DB migration or granted by existing admin in a future admin route.
- **D-09:** Same single-endpoint pattern applies to `POST /auth/google` — role in body, ADMIN rejected.

### Rate Limiting
- **D-10:** Per-endpoint rate limits via `@fastify/rate-limit`, keyed by IP:
  - `POST /auth/login`: 5 req/min
  - `POST /auth/register`: 3 req/min
  - `POST /auth/refresh`: 10 req/min
  - All other routes: 60 req/min (global default)
- **D-11:** Rate limit exceeded returns 429 with `{ error: 'Too Many Requests', retryAfter: N }`.

### Token Architecture (carried from Phase 1)
- **D-12:** Access token TTL: 15 min (already set in `src/shared/plugins/jwt.ts`).
- **D-13:** JWT payload: `{ id: string, role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN' }` (already typed in `authenticate.ts`).

### Error Responses
- **D-14:** Auth errors use existing `AppError` → errorHandler pipeline. Specific codes:
  - Invalid credentials: 401 `INVALID_CREDENTIALS`
  - Token expired: 401 `TOKEN_EXPIRED`
  - Token missing: 401 `UNAUTHORIZED`
  - Role forbidden: 403 `FORBIDDEN`
  - ADMIN role on register: 422 `VALIDATION_ERROR`

### Claude's Discretion
- Exact Prisma migration file naming and content
- `google-auth-library` vs manual JWT decode for Google ID token validation (recommend `google-auth-library` — handles key rotation)
- Whether to use `crypto.randomBytes` or `uuid` for refresh token generation before hashing
- bcrypt vs SHA-256 for storing the refresh token hash (SHA-256 is fine for random tokens; bcrypt adds unnecessary overhead)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specs
- `docs/superpowers/specs/2026-04-09-job-tinder-design.md` — Auth section: JWT + refresh token, OAuth2 Google, roles CANDIDATE | RECRUITER
- `docs/superpowers/plans/2026-04-09-backend-api.md` — Original backend plan with auth module detail

### Requirements
- `.planning/REQUIREMENTS.md` §Authentication — AUTH-01 through AUTH-06 (all in Phase 2)
- `.planning/REQUIREMENTS.md` §Security — SEC-04 (bcrypt salt ≥ 12), SEC-05 (rate limiting), SEC-06 (JWT ≤ 15min + refresh rotation), SEC-07 (helmet)

### Existing Auth Infrastructure
- `src/shared/plugins/jwt.ts` — JWT plugin, already registered, 15min expiry
- `src/shared/hooks/authenticate.ts` — JWT verification hook, reuse as-is
- `src/shared/hooks/requireRole.ts` — Role guard hook, reuse as-is
- `src/shared/errors/AppError.ts` — Error class used in all auth throws
- `prisma/schema.prisma` — User model with `passwordHash`, `googleId`, `role` fields already defined

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/plugins/jwt.ts`: JWT plugin already registered with 15min expiry — no changes needed, access token config is done
- `src/shared/hooks/authenticate.ts`: Ready to use as preHandler on protected routes — no changes needed
- `src/shared/hooks/requireRole.ts`: Ready for role-gated routes — no changes needed
- `src/shared/errors/AppError.ts` + `errorHandler.ts`: Use for all auth error throws
- `src/shared/db/prisma.ts`: Prisma client singleton — use in AuthRepository

### Schema Changes Required
- Add `RefreshToken` model to `prisma/schema.prisma` (new migration needed)
- No other schema changes — User model already has all required auth fields

### Integration Points
- New module: `src/modules/auth/` following routes → service → repository pattern (matches health module structure)
- Register auth routes in `src/app.ts` (same pattern as health routes)
- Rate limiting plugin registers globally in `src/shared/plugins/` before routes

### Established Patterns
- Module structure: `src/modules/{name}/{name}.routes.ts`, `{name}.service.ts`, `{name}.repository.ts`
- Error throwing: `throw new AppError(message, statusCode, code)` — do not return errors, throw them
- JWT typing: augment `@fastify/jwt` interface (already done in authenticate.ts — do not duplicate)

</code_context>

<specifics>
## Specific Ideas

- Google token validation: use `google-auth-library` npm package (`OAuth2Client.verifyIdToken`) — handles Google's public key rotation automatically
- Refresh token storage: store `SHA-256(token)` in DB, return raw random token to client — fast lookup without bcrypt overhead
- The `POST /auth/google` endpoint doubles as both "login" and "register" for Google users — no separate signup route needed

</specifics>

<deferred>
## Deferred Ideas

- Account linking UI (e.g., "connect Google to existing email account") — v2 feature, beyond Phase 2 scope
- Password reset / forgot password flow — not in Phase 2 requirements, belongs in a future phase or Phase 3 extension
- Multi-device session management (list active sessions, revoke specific device) — v2

</deferred>

---

*Phase: 02-authentication*
*Context gathered: 2026-04-18*
