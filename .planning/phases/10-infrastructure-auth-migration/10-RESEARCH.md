# Phase 10: Infrastructure + Auth Migration - Research

**Researched:** 2026-05-07
**Domain:** Clean Architecture migration — infrastructure layer + auth module end-to-end
**Confidence:** HIGH (all findings derived from reading the actual codebase)

---

## Summary

Phase 10 performs the first concrete migration step of the v2.0 Clean Architecture refactor. It has two distinct scopes: (1) copying the shared infrastructure files (DB singletons, Fastify plugins) to their canonical `src/infrastructure/` locations, and (2) migrating the auth module end-to-end — splitting the current monolithic `AuthService` into five use cases, implementing `UserRepository` and `RefreshTokenRepository` adapters, implementing `BcryptAdapter` and `JwtAdapter`, and creating `AuthController` and a new `src/infrastructure/http/routes/auth.routes.ts`.

The migration is strictly additive for infrastructure (new files at new paths, old files untouched). For auth, `src/app.ts` is updated to import the new `authRoutes` from `src/infrastructure/http/routes/` instead of `src/modules/auth/auth.routes.ts`. The old `src/modules/auth/` files remain in place for now — they are deleted only in Phase 13.

The critical design constraint throughout is zero regressions: all 134 integration tests (expanded from 41 during Phase 9 verification) must remain green after every wave. The test harness calls `buildApp()` from `src/app.ts`, so swapping the auth route import in `app.ts` is the single seam that routes test traffic through the new wiring.

**Primary recommendation:** Build in three ordered waves — (W1) infrastructure file copies + directory scaffolding, (W2) adapter and use-case implementations, (W3) update `app.ts` import + verify tests green.

---

## Project Constraints (from CLAUDE.md)

- **Architecture:** routes → service → repository; no skipping layers. Phase 10 maps to: routes → controller → use-case → repository/adapter.
- **SOLID SRP:** one class per responsibility — each use case is its own file/class.
- **Module isolation:** modules do not import from other modules. `src/infrastructure/` imports all layers; `src/adapters/` imports only `application/` and `domain/`.
- **Security:** all queries via Prisma ORM — no raw SQL string interpolation.
- **Zod validation:** inputs validated with Zod in all endpoints — validation stays in controller or route, never in use case.
- **Atomic transactions:** refresh token rotation uses `prisma.$transaction` — must be preserved in the new wiring.
- **bcrypt salt >= 12** — `BcryptAdapter.hash()` must use 12 rounds.
- **Rate limiting:** register (3/min), login (5/min), refresh (10/min), google (5/min) — configured in route definitions.
- **JWT access token <= 15 min** — `JwtAdapter.signAccess()` must set `expiresIn: '15m'`.
- **@fastify/helmet** on all endpoints — helmet plugin must be registered before routes.
- **TDD:** test first, then implementation. Integration tests run against the real DB.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-09 | Controllers in `src/adapters/controllers/` orchestrate use cases and format HTTP responses without containing business logic | AuthController reads request body (Zod), calls use case, maps DomainError to HTTP status, returns response — no business logic inside |
| ARCH-10 | Repository implementations in `src/adapters/repositories/` implement the interfaces defined in `src/domain/interfaces/` | UserRepository implements IUserRepository; RefreshTokenRepository implements IRefreshTokenRepository; both map Prisma rows to domain entities |
| ARCH-11 | Service adapters in `src/adapters/services/` implement the ports defined in `src/application/ports/` | BcryptAdapter implements IHashPort; JwtAdapter implements ITokenPort |
| ARCH-12 | Routes in `src/infrastructure/http/routes/` only register endpoints and instantiate controllers — no business logic | auth.routes.ts only registers paths, rate limits, and delegates to AuthController — exactly matching the plan-architecture.md example |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DB singleton creation | Infrastructure (database/) | — | One place creates PrismaClient; all adapters import from there |
| Fastify plugin registration | Infrastructure (http/plugins/) | — | Plugins are framework wiring; no business logic |
| Input validation (Zod) | Adapters (controllers/) | Infrastructure (routes/) | Controller parses body before calling use case; route can also have schema |
| Business logic (register/login/etc.) | Application (use-cases/auth/) | — | Use cases are the only place where business rules live |
| Password hashing | Adapters (services/bcrypt.adapter.ts) | — | Implements IHashPort; use case never imports bcrypt directly |
| JWT signing/verification | Adapters (services/jwt.adapter.ts) | — | Implements ITokenPort; use case never imports @fastify/jwt directly |
| DB access (User, RefreshToken) | Adapters (repositories/) | — | Implements domain interfaces; maps Prisma rows to domain entities |
| Route registration | Infrastructure (http/routes/) | — | Registers paths, rate limits, delegates to controller |
| app.ts composition root | Infrastructure (http/app.ts) | — | Instantiates all concrete adapters; replaces auth import |
| authenticate hook | Infrastructure (http/plugins/) | — | Framework-level JWT verification; stays in infra layer |

---

## Standard Stack

### Core (already installed — no new packages needed)
| Library | Version (verified) | Purpose | Note |
|---------|---------|---------|------|
| fastify | ^5.8.5 | HTTP framework | already installed |
| @fastify/jwt | ^10.0.0 | JWT plugin for signing/verifying | already installed — JwtAdapter wraps it |
| bcryptjs | ^3.0.3 | Password hashing | already installed |
| @prisma/client | ^7.7.0 | DB ORM | already installed |
| zod | ^4.3.2 | Input validation | already installed |
| google-auth-library | ^10.6.2 | Google OAuth2 token verification | already installed |
| crypto | Node.js built-in | randomBytes / createHash | no install needed |

[VERIFIED: reading package.json] No new dependencies are required for Phase 10.

### No New Installs
Phase 10 is purely a code migration. All required libraries are already installed.

---

## Architecture Patterns

### System Architecture Diagram — Auth Request Flow (New Wiring)

```
HTTP Request
     |
     v
src/infrastructure/http/routes/auth.routes.ts
     | (registers path, rate limit, delegates)
     v
src/adapters/controllers/auth.controller.ts
     | (Zod parse, catch DomainError → HTTP status)
     v
src/application/use-cases/auth/<use-case>.ts
     | (business rules; calls IUserRepository, IRefreshTokenRepository, IHashPort, ITokenPort)
     |
     +---> src/adapters/repositories/user.repository.ts (IUserRepository)
     |          |
     |          v
     |     src/infrastructure/database/prisma.ts (PrismaClient)
     |
     +---> src/adapters/repositories/refresh-token.repository.ts (IRefreshTokenRepository)
     |          |
     |          v
     |     src/infrastructure/database/prisma.ts (PrismaClient)
     |
     +---> src/adapters/services/bcrypt.adapter.ts (IHashPort)
     |
     +---> src/adapters/services/jwt.adapter.ts (ITokenPort)
     |          |
     |          v
     |     FastifyInstance.jwt (via constructor injection)
     |
     v
HTTP Response (status + JSON body)
```

### Recommended Project Structure (new directories this phase creates)

```
src/
├── infrastructure/
│   ├── database/
│   │   ├── prisma.ts          (copy of src/shared/db/prisma.ts)
│   │   └── neo4j.ts           (copy of src/shared/db/neo4j.ts)
│   └── http/
│       ├── plugins/
│       │   ├── helmet.plugin.ts    (copy of src/shared/plugins/helmet.ts)
│       │   ├── cors.plugin.ts      (copy of src/shared/plugins/cors.ts)
│       │   ├── jwt.plugin.ts       (copy of src/shared/plugins/jwt.ts)
│       │   ├── rate-limit.plugin.ts (copy of src/shared/plugins/rate-limit.ts)
│       │   ├── scheduler.plugin.ts  (copy — keeps src/modules/job/ import for now)
│       │   └── authenticate.hook.ts (copy — switches AppError → DomainError)
│       └── routes/
│           └── auth.routes.ts      (NEW — thin wrapper calling AuthController)
├── adapters/
│   ├── controllers/
│   │   └── auth.controller.ts     (NEW)
│   ├── repositories/
│   │   ├── user.repository.ts     (NEW — implements IUserRepository)
│   │   └── refresh-token.repository.ts (NEW — implements IRefreshTokenRepository)
│   └── services/
│       ├── bcrypt.adapter.ts      (NEW — implements IHashPort)
│       └── jwt.adapter.ts         (NEW — implements ITokenPort)
└── application/
    └── use-cases/
        └── auth/
            ├── register.use-case.ts
            ├── login.use-case.ts
            ├── refresh-token.use-case.ts
            ├── logout.use-case.ts
            └── login-with-google.use-case.ts
```

---

## Critical Design Questions — Resolved

### Q1: RefreshTokenUseCase and the `prisma.$transaction` pattern

**Current behavior:** `AuthService.refresh()` calls `prisma.$transaction` directly (bypassing `AuthRepository`) to atomically detect replay attacks. The pattern: `updateMany(where: {tokenHash, revokedAt: null})` and check `count === 0`. This is the only way to atomically detect a replay while also revoking.

**Problem:** `IRefreshTokenRepository` as defined in Phase 9 only has: `create`, `findByHash`, `revoke(id)`, `revokeFamily(familyId)`. There is no `revokeByHash` or method returning a count.

**Resolution:** Add `revokeByHash(tokenHash: string): Promise<number>` to `IRefreshTokenRepository`. This method returns the number of rows actually updated (0 = replay, 1 = success). The `RefreshTokenRepository` implementation uses `prisma.refreshToken.updateMany({where: {tokenHash, revokedAt: null}, data:{revokedAt: new Date()}})` and returns `result.count`.

With this, `RefreshTokenUseCase` orchestrates the replay-attack logic without importing Prisma:

```typescript
// In RefreshTokenUseCase.execute():
const count = await this.refreshTokenRepo.revokeByHash(tokenHash)  // atomic
const stored = await this.refreshTokenRepo.findByHash(tokenHash)    // get metadata
if (!stored) throw new DomainError('Invalid token', 'UNAUTHORIZED', 401)
if (count === 0) {
  await this.refreshTokenRepo.revokeFamily(stored.familyId)         // purge family
  throw new DomainError('Token revoked', 'TOKEN_EXPIRED', 401)
}
if (stored.expiresAt < new Date()) throw new DomainError('Token expired', 'TOKEN_EXPIRED', 401)
// ... generate new token pair
```

**Impact on IRefreshTokenRepository:** The interface defined in Phase 9 must be extended with `revokeByHash(tokenHash: string): Promise<number>`. This is a Phase 10 task — edit `src/domain/interfaces/refresh-token.repository.interface.ts`.

**Note:** This does NOT wrap the two calls in a `prisma.$transaction` inside the use case (use cases cannot import Prisma). The `revokeByHash` Prisma `updateMany` is itself atomic (single SQL UPDATE). The `findByHash` call after is a read for metadata only. This is equivalent behavior to the current code — the atomicity guarantee comes from `updateMany` returning count. The test for replay attack (`401 TOKEN_EXPIRED on re-use of revoked token`) will continue to pass.

### Q2: JwtAdapter — FastifyInstance vs raw jsonwebtoken

**Current behavior:** `AuthService` calls `this.app.jwt.sign({ id, role }, { expiresIn: '15m' })` where `app` is `FastifyInstance`. The JWT secret is registered via the `jwtPlugin` into the Fastify instance.

**ITokenPort:** defines `signAccess(payload): string`, `generateRefreshToken(): {raw, hashed}`, `verifyAccess(token): {id, role}`.

**Resolution:** `JwtAdapter` takes `FastifyInstance` in its constructor. This is the pattern shown in `plan-architecture.md` (`new JwtAdapter(request.server)`). Using the raw `jsonwebtoken` library would require duplicating secret management and would lose the benefit of the Fastify-registered plugin. Taking `FastifyInstance` is the pragmatic choice.

```typescript
// src/adapters/services/jwt.adapter.ts
import { FastifyInstance } from 'fastify'
import { randomBytes, createHash } from 'crypto'
import { ITokenPort } from '../../application/ports/token.port'

export class JwtAdapter implements ITokenPort {
  constructor(private readonly app: FastifyInstance) {}

  signAccess(payload: { id: string; role: string }): string {
    return this.app.jwt.sign(payload, { expiresIn: '15m' })
  }

  generateRefreshToken(): { raw: string; hashed: string } {
    const raw = randomBytes(32).toString('hex')
    const hashed = createHash('sha256').update(raw).digest('hex')
    return { raw, hashed }
  }

  verifyAccess(token: string): { id: string; role: string } {
    return this.app.jwt.verify(token)
  }
}
```

`JwtAdapter` is instantiated inside `AuthController` methods using `request.server` (available on any `FastifyRequest`).

### Q3: authenticate.hook.ts — AppError vs DomainError

**Current behavior:** `src/shared/hooks/authenticate.ts` imports `AppError` and throws `new AppError('Unauthorized', 401, 'UNAUTHORIZED')`.

**errorHandler.ts** handles both `AppError` (instanceof check) and objects with a `statusCode` field. `DomainError` is not yet handled by `errorHandler.ts`.

**Resolution:** The `authenticate.hook.ts` copy at `src/infrastructure/http/plugins/authenticate.hook.ts` should **continue to use `AppError`** from `src/shared/errors/AppError.ts`. Reason: `errorHandler.ts` already handles `AppError` correctly; adding `DomainError` handling to `errorHandler.ts` is a Phase 13 concern (when `AppError` is deleted). Switching to `DomainError` in the hook while `errorHandler.ts` doesn't handle it would break the 401 response for protected routes. The `declare module '@fastify/jwt'` augmentation block stays in the hook file.

**What imports authenticate.ts:** All 8 non-auth route files import it:
- `src/modules/candidate/candidate.routes.ts`
- `src/modules/company/company.routes.ts`
- `src/modules/recruiter/recruiter.routes.ts`
- `src/modules/job/job.routes.ts`
- `src/modules/swipe/swipe.routes.ts`
- `src/modules/credits/credits.routes.ts`
- `src/modules/chat/chat.routes.ts`
- `src/modules/admin/admin.routes.ts`

**These imports do NOT change in Phase 10.** All non-auth modules continue importing from `../../shared/hooks/authenticate`. Phase 10 only copies the file; it does not redirect existing imports. Old and new files coexist.

**However:** `errorHandler.ts` must be updated to also handle `DomainError` (since auth use cases now throw `DomainError`). This is the one existing file that must be touched.

### Q4: Migration strategy for app.ts — minimal change

**Current `src/app.ts` auth import:**
```typescript
import { authRoutes } from './modules/auth/auth.routes'
```

**Phase 10 change (only this line changes for auth):**
```typescript
import { authRoutes } from './infrastructure/http/routes/auth.routes'
```

All other module imports in `app.ts` remain unchanged:
- `./modules/candidate/candidate.routes` — unchanged
- `./modules/company/company.routes` — unchanged
- `./modules/job/job.routes` — unchanged
- etc.

Plugin imports in `app.ts` can optionally be updated to `./infrastructure/http/plugins/*` since those are pure copies. This is safe since plugins have no logic — it's just a path change. The planner may split this into two steps (plugin imports first, then auth routes).

**The scheduler** is a special case: it imports from `src/modules/job/job.repository.ts`. The copy at `src/infrastructure/http/plugins/scheduler.plugin.ts` will still contain this import. This is acceptable for Phase 10 — the scheduler import from `src/modules/job/` is not cleaned up until Phase 11 (when job module migrates).

### Q5: Integration tests — do they need changes?

**No changes required to integration tests.** The integration tests call `buildApp()` from `src/app.ts` and then issue HTTP requests via Supertest. The test assertions are against HTTP responses (status codes, body shapes). After updating `app.ts` to import auth routes from the new location, the test traffic flows through the new wiring transparently. The tests do not import from module directories directly.

**One exception:** `tests/helpers/factories.ts` imports `prisma` from `src/shared/db/prisma`. This continues to work because `src/shared/db/prisma.ts` is not deleted in Phase 10 — it's just copied. Factories are untouched.

**One exception for setup.ts:** Same — imports `prisma` from `src/shared/db/prisma`. Also untouched.

### Q6: errorHandler.ts — must be updated to handle DomainError

`DomainError` is thrown by the new auth use cases. Without an `instanceof DomainError` branch in `errorHandler.ts`, those errors fall through to the final 500 catch-all. The errorHandler must be updated to add:

```typescript
import { DomainError } from '../application/errors/domain.error'

// In errorHandler function, before the AppError check:
if (error instanceof DomainError) {
  reply.status(error.statusCode).send({ error: error.message, code: error.code })
  return
}
```

`DomainError` and `AppError` have the same wire format (`{error, code}` + status code), so the response shape is identical. Tests asserting `response.body.code === 'INVALID_CREDENTIALS'` etc. continue to pass.

**This is the only existing file outside `src/app.ts` that must be modified in Phase 10.**

### Q7: IUserRepository — `updateGoogleId` vs `findOrCreateGoogle`

The existing `AuthRepository.findOrCreateGoogleUser()` uses a `prisma.$transaction` internally (try find by googleId → try find by email → create). `IUserRepository.findOrCreateGoogle()` (as defined in Phase 9) maps to this method.

`UserRepository.findOrCreateGoogle()` should contain the full transaction logic using `prisma.$transaction`. The use case (`LoginWithGoogleUseCase`) simply calls `this.userRepo.findOrCreateGoogle(data)` and does not need to know about the internal transaction.

`IUserRepository.updateGoogleId` is not called by any auth use case in the current code. It was included in the interface to match the shape seen in `plan-architecture.md`. It will be implemented in `UserRepository` but not used by any auth use case in Phase 10.

---

## File-by-File Implementation Guide

### Wave 1: Infrastructure Copies (no logic changes)

| Source | Destination | Change |
|--------|------------|--------|
| `src/shared/db/prisma.ts` | `src/infrastructure/database/prisma.ts` | Exact copy |
| `src/shared/db/neo4j.ts` | `src/infrastructure/database/neo4j.ts` | Exact copy |
| `src/shared/plugins/helmet.ts` | `src/infrastructure/http/plugins/helmet.plugin.ts` | Exact copy |
| `src/shared/plugins/cors.ts` | `src/infrastructure/http/plugins/cors.plugin.ts` | Exact copy |
| `src/shared/plugins/jwt.ts` | `src/infrastructure/http/plugins/jwt.plugin.ts` | Exact copy |
| `src/shared/plugins/rate-limit.ts` | `src/infrastructure/http/plugins/rate-limit.plugin.ts` | Exact copy |
| `src/shared/plugins/scheduler.ts` | `src/infrastructure/http/plugins/scheduler.plugin.ts` | Exact copy (keeps `src/modules/job/` import) |
| `src/shared/hooks/authenticate.ts` | `src/infrastructure/http/plugins/authenticate.hook.ts` | Exact copy (keeps AppError import) |

None of the source files are deleted. No imports in other files change at Wave 1.

### Wave 2: New Files (adapters + use cases)

**`src/domain/interfaces/refresh-token.repository.interface.ts`** — MODIFY (add `revokeByHash`):
```typescript
revokeByHash(tokenHash: string): Promise<number>
```

**`src/adapters/repositories/user.repository.ts`** — implements `IUserRepository`:
- `findByEmail` → `prisma.user.findUnique({ where: { email } })` + `toDomain()`
- `findById` → `prisma.user.findUnique({ where: { id } })` + `toDomain()`
- `create` → `prisma.user.create({ data })` + `toDomain()`
- `updateGoogleId` → `prisma.user.update(...)` + `toDomain()`
- `findOrCreateGoogle` → `prisma.$transaction(...)` — copy from `AuthRepository.findOrCreateGoogleUser` + map results with `toDomain()`
- Imports: `prisma` from `../../infrastructure/database/prisma`; `IUserRepository` from `../../domain/interfaces/user.repository.interface`; `User` from `../../domain/entities/user.entity`

**`src/adapters/repositories/refresh-token.repository.ts`** — implements `IRefreshTokenRepository`:
- `create` → `prisma.refreshToken.create({ data })` + `toDomain()`
- `findByHash` → `prisma.refreshToken.findUnique({ where: { tokenHash } })` + `toDomain() | null`
- `revoke(id)` → `prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } })`
- `revokeFamily(familyId)` → `prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })`
- `revokeByHash(tokenHash)` → `prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })` returns `result.count`
- Imports: `prisma` from `../../infrastructure/database/prisma`; `IRefreshTokenRepository` from `../../domain/interfaces/refresh-token.repository.interface`; `RefreshToken` from `../../domain/entities/refresh-token.entity`

**`src/adapters/services/bcrypt.adapter.ts`** — implements `IHashPort`:
```typescript
import bcrypt from 'bcryptjs'
import { IHashPort } from '../../application/ports/hash.port'

export class BcryptAdapter implements IHashPort {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12)
  }
  async compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed)
  }
}
```

**`src/adapters/services/jwt.adapter.ts`** — implements `ITokenPort`: as shown in Q2 above.

**`src/application/use-cases/auth/register.use-case.ts`**:
- Injects: `IUserRepository`, `IRefreshTokenRepository`, `IHashPort`, `ITokenPort`
- Logic: check email exists (CONFLICT 409) → hash password → create user → signAccess → generateRefreshToken → create refresh token → return `{accessToken, refreshToken: raw}`
- familyId: `randomBytes(16).toString('hex')` — import `randomBytes` from `'crypto'`
- expiresAt: `new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)`

**`src/application/use-cases/auth/login.use-case.ts`**:
- Injects: `IUserRepository`, `IRefreshTokenRepository`, `IHashPort`, `ITokenPort`
- DUMMY_HASH constant for timing-safe: `'$2b$12$LVfxFJGoT4lbSwHhLU8kCOy8xQpBLaIH5TNXLilzj5Wky3l2KBKP2'` (copy from auth.service.ts)
- Logic: findByEmail → bcrypt.compare (or dummy hash if no user) → INVALID_CREDENTIALS if mismatch → signAccess + createRefreshToken → return tokens

**`src/application/use-cases/auth/refresh-token.use-case.ts`**:
- Injects: `IUserRepository`, `IRefreshTokenRepository`, `ITokenPort`
- Logic: hash raw token (SHA-256) → revokeByHash → findByHash → UNAUTHORIZED if not found → TOKEN_EXPIRED if count===0 (replay, also revokeFamily) → TOKEN_EXPIRED if expired → findById user → signAccess + create new refresh token → return tokens

**`src/application/use-cases/auth/logout.use-case.ts`**:
- Injects: `IRefreshTokenRepository`
- Logic: hash raw token → findByHash → if not found or already revoked, return (idempotent) → revokeFamily

**`src/application/use-cases/auth/login-with-google.use-case.ts`**:
- Injects: `IUserRepository`, `IRefreshTokenRepository`, `ITokenPort`
- Also uses `OAuth2Client` directly (Google verification stays in use case for Phase 10 — it is not abstracted behind a port yet; IGraphPort has nothing to do with Google. A future phase could create an `IGoogleAuthPort` if desired, but that is out of scope)
- Logic: verifyIdToken → INVALID_CREDENTIALS on error → findOrCreateGoogle → signAccess + createRefreshToken → return tokens

**`src/adapters/controllers/auth.controller.ts`**:
- Has methods: `register`, `login`, `refresh`, `logout`, `loginWithGoogle`
- Each method: parse body (Zod) → instantiate use case with concrete adapters → call use case → reply.status(X).send(result)
- Error mapping: `if (error instanceof DomainError) { reply.status(error.statusCode).send({ error: error.message, code: error.code }); return }` — then rethrow for other errors
- Instantiation inside each handler: `new JwtAdapter(request.server)`
- Zod schemas stay identical to those in `auth.routes.ts` (RegisterBodySchema, LoginBodySchema, etc.)

**`src/infrastructure/http/routes/auth.routes.ts`**:
- Exact pattern from `plan-architecture.md`:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { AuthController } from '../../../adapters/controllers/auth.controller'

  export async function authRoutes(app: FastifyInstance): Promise<void> {
    const ctrl = new AuthController()
    app.post('/register', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, ctrl.register.bind(ctrl))
    app.post('/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, ctrl.login.bind(ctrl))
    app.post('/refresh', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, ctrl.refresh.bind(ctrl))
    app.post('/logout', ctrl.logout.bind(ctrl))
    app.post('/google', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, ctrl.loginWithGoogle.bind(ctrl))
  }
  ```

### Wave 3: Seam Update + Test Verification

**`src/shared/errors/errorHandler.ts`** — MODIFY (add DomainError branch):
```typescript
import { DomainError } from '../application/errors/domain.error'
// Add before AppError check:
if (error instanceof DomainError) {
  reply.status(error.statusCode).send({ error: error.message, code: error.code })
  return
}
```

**`src/app.ts`** — MODIFY (two changes):
1. Replace: `import { authRoutes } from './modules/auth/auth.routes'`
   With: `import { authRoutes } from './infrastructure/http/routes/auth.routes'`
2. (Optional, clean) Replace plugin imports with `./infrastructure/http/plugins/*` variants.

**Run test suite:** `npm run test:integration` — all tests must remain green.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Token generation (opaque refresh token) | Custom CSPRNG | `crypto.randomBytes(32).toString('hex')` from Node.js built-in |
| Token hashing | Custom hash | `createHash('sha256').update(token).digest('hex')` from Node.js built-in |
| Replay attack detection | Distributed lock / Redis | Prisma `updateMany` returning `count` — atomic in PostgreSQL |
| Timing-safe login | Constant-time compare | Bcrypt compare with DUMMY_HASH when user not found |
| JWT verification | Hand-decode JWT | `@fastify/jwt` — `request.jwtVerify()` in authenticate hook |

---

## Common Pitfalls

### Pitfall 1: Use case imports Prisma directly
**What goes wrong:** `refresh-token.use-case.ts` imports `prisma` to call `$transaction`, violating ARCH-07.
**Why it happens:** The transaction pattern looks like it needs Prisma to be atomic.
**How to avoid:** `revokeByHash` in `IRefreshTokenRepository` returns `count`. The use case calls `revokeByHash` (atomic at the DB level) then `findByHash` (metadata read). No Prisma in use case.
**Warning signs:** Any `import { prisma }` in `src/application/use-cases/`

### Pitfall 2: JwtAdapter not receiving FastifyInstance
**What goes wrong:** `JwtAdapter` is instantiated without `request.server`, so `this.app.jwt.sign()` throws "Cannot read property 'sign' of undefined".
**Why it happens:** Forgetting that `@fastify/jwt` decorates the FastifyInstance; it is not a standalone module.
**How to avoid:** Always construct `new JwtAdapter(request.server)` inside controller handlers.
**Warning signs:** TypeScript error on `this.app.jwt` if `app` is not `FastifyInstance`

### Pitfall 3: authenticate.hook.ts switches to DomainError prematurely
**What goes wrong:** The hook throws `DomainError` but `errorHandler.ts` (at time of the hook copy) only handles `AppError`. Protected routes return 500 instead of 401.
**Why it happens:** DomainError handling in errorHandler must be added before the hook uses DomainError.
**How to avoid:** Keep `AppError` in the hook copy for Phase 10. Add DomainError to errorHandler only for the auth use-case path.
**Warning signs:** Test `AUTH-06` returning 500 instead of 401

### Pitfall 4: Missing `revokeByHash` on IRefreshTokenRepository
**What goes wrong:** `RefreshTokenUseCase` cannot atomically detect replay attacks. It must call `findByHash` + check `revokedAt` separately — which is a TOCTOU race condition.
**Why it happens:** The Phase 9 interface was derived from current repository methods; `revokeByHash` did not exist as a named method.
**How to avoid:** Edit `src/domain/interfaces/refresh-token.repository.interface.ts` in Wave 1 or early Wave 2 before writing the use case.
**Warning signs:** RefreshTokenUseCase failing to detect replay attack in the integration test `401 TOKEN_EXPIRED on re-use of revoked token`

### Pitfall 5: Forgetting expiresAt in RefreshToken.create
**What goes wrong:** Refresh tokens never expire.
**Why it happens:** `IRefreshTokenRepository.create()` signature includes `expiresAt: Date` — must pass it.
**How to avoid:** `new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)` computed in the use case (business rule) and passed to `refreshTokenRepo.create()`.

### Pitfall 6: App.ts plugin imports updated before infrastructure files exist
**What goes wrong:** TypeScript cannot resolve the new plugin paths during a partial Wave 1 update.
**Why it happens:** Updating `app.ts` imports before creating the target files.
**How to avoid:** Create all Wave 1 infrastructure files first, then update `app.ts` imports at the end.

### Pitfall 7: toDomain() mapping misses a field
**What goes wrong:** Domain entity type mismatch — TypeScript complains or runtime has undefined fields.
**Why it happens:** Prisma model has more fields than the domain entity; forgetting to map a nullable field.
**How to avoid:** Check domain entity shape against Prisma schema: `User` needs `id, email, passwordHash, googleId, avatarUrl, role, createdAt`; `RefreshToken` needs `id, tokenHash, familyId, userId, expiresAt, revokedAt, createdAt`.

---

## Code Examples

### RegisterUseCase
[VERIFIED: plan-architecture.md — canonical example]

```typescript
// src/application/use-cases/auth/register.use-case.ts
import { randomBytes } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../ports/hash.port'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

interface RegisterInput {
  email: string
  password: string
  role: 'CANDIDATE' | 'RECRUITER'
}

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly hash: IHashPort,
    private readonly token: ITokenPort,
  ) {}

  async execute(input: RegisterInput): Promise<{ accessToken: string; refreshToken: string }> {
    const existing = await this.userRepo.findByEmail(input.email)
    if (existing) throw new DomainError('Email already in use', 'CONFLICT', 409)

    const passwordHash = await this.hash.hash(input.password)
    const user = await this.userRepo.create({ email: input.email, passwordHash, role: input.role })

    const accessToken = this.token.signAccess({ id: user.id, role: user.role })
    const { raw, hashed } = this.token.generateRefreshToken()
    const familyId = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })

    return { accessToken, refreshToken: raw }
  }
}
```

### RefreshTokenUseCase (replay attack pattern)
[VERIFIED: derived from current auth.service.ts refresh() method]

```typescript
// src/application/use-cases/auth/refresh-token.use-case.ts
import { createHash } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly token: ITokenPort,
  ) {}

  async execute(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    // Atomic revoke — returns count of rows updated (0 = already revoked = replay)
    const count = await this.refreshTokenRepo.revokeByHash(tokenHash)
    const stored = await this.refreshTokenRepo.findByHash(tokenHash)

    if (!stored) throw new DomainError('Invalid token', 'UNAUTHORIZED', 401)

    if (count === 0) {
      await this.refreshTokenRepo.revokeFamily(stored.familyId)
      throw new DomainError('Token revoked', 'TOKEN_EXPIRED', 401)
    }

    if (stored.expiresAt < new Date()) throw new DomainError('Token expired', 'TOKEN_EXPIRED', 401)

    const user = await this.userRepo.findById(stored.userId)
    if (!user) throw new DomainError('User not found', 'UNAUTHORIZED', 401)

    const accessToken = this.token.signAccess({ id: user.id, role: user.role })
    const { raw, hashed } = this.token.generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({ tokenHash: hashed, familyId: stored.familyId, userId: user.id, expiresAt })

    return { accessToken, refreshToken: raw }
  }
}
```

### AuthController (handler pattern)
[VERIFIED: derived from plan-architecture.md example]

```typescript
// src/adapters/controllers/auth.controller.ts (register handler excerpt)
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { RegisterUseCase } from '../../application/use-cases/auth/register.use-case'
import { UserRepository } from '../repositories/user.repository'
import { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import { BcryptAdapter } from '../services/bcrypt.adapter'
import { JwtAdapter } from '../services/jwt.adapter'
import { DomainError } from '../../application/errors/domain.error'

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

export class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterBodySchema.parse(request.body)
    const useCase = new RegisterUseCase(
      new UserRepository(),
      new RefreshTokenRepository(),
      new BcryptAdapter(),
      new JwtAdapter(request.server),
    )
    try {
      const tokens = await useCase.execute(body)
      reply.status(201).send(tokens)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
  // ... login, refresh, logout, loginWithGoogle follow the same pattern
}
```

### errorHandler.ts update
[VERIFIED: derived from current errorHandler.ts + DomainError shape]

```typescript
// Add at top of errorHandler.ts:
import { DomainError } from '../application/errors/domain.error'

// Add as first branch inside errorHandler function:
if (error instanceof DomainError) {
  reply.status(error.statusCode).send({ error: error.message, code: error.code })
  return
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest + Supertest |
| Config file | `jest.config.ts` (or root jest config in package.json) |
| Quick run (auth only) | `npm run test:integration -- --testPathPattern=auth` |
| Full suite | `npm run test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-09 | AuthController has no business logic | Code review (static) | `npx tsc --noEmit` | Wave 2 |
| ARCH-10 | UserRepository implements IUserRepository | TypeScript compiler | `npx tsc --noEmit` | Wave 2 |
| ARCH-11 | BcryptAdapter implements IHashPort | TypeScript compiler | `npx tsc --noEmit` | Wave 2 |
| ARCH-12 | auth.routes.ts has no business logic | Code review (static) | `npx tsc --noEmit` | Wave 2 |
| AUTH-01 through AUTH-06 | All auth behaviors preserved | Integration | `npm run test:integration -- --testPathPattern=auth` | Exists |
| SEC-05 | Rate limiting works | Integration (rate limit test) | `npm run test:integration -- --testPathPattern=auth` | Exists |
| All existing | Zero regressions | Integration | `npm run test:integration` | All exist |

### Sampling Rate
- **Per wave commit:** `npm run test:integration -- --testPathPattern=auth`
- **Per wave merge (Wave 3):** `npm run test:integration` (full suite)
- **Phase gate:** Full suite green before closing phase

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. The auth integration tests in `tests/integration/auth.test.ts` cover register, login, refresh (including replay attack), logout, Google OAuth, rate limiting, and AUTH-06 protected route rejection.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond already-installed packages; Docker Compose + test DB are already operational from prior phases).

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | BcryptAdapter (salt=12), timing-safe compare with DUMMY_HASH |
| V3 Session Management | yes | Refresh token rotation; revokeFamily on logout; replay detection via revokeByHash count |
| V4 Access Control | yes | authenticate.hook.ts guards protected routes |
| V5 Input Validation | yes | Zod in AuthController for all endpoints |
| V6 Cryptography | yes | bcryptjs for passwords; `crypto.randomBytes` for refresh tokens; SHA-256 hash for storage |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Refresh token replay | Spoofing | `revokeByHash` returns count; count=0 → revokeFamily (token theft detection) |
| Brute force login | Denial of Service | Rate limit: 5 req/min on `/auth/login` |
| SQL injection via email/password | Tampering | Prisma ORM parameterized queries — no raw SQL |
| Timing oracle on login | Information Disclosure | bcrypt.compare always runs (DUMMY_HASH when user not found) |
| Short-lived access tokens | — | JWT expiresIn: '15m' enforced in JwtAdapter.signAccess |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 134-test count mentioned in STATE.md supersedes the 41-test count in REQUIREMENTS.md; the planner should verify with `npm run test:integration` | All test counts | Plans might set wrong baseline |
| A2 | `request.server` is available on `FastifyRequest` in Fastify 5.x (required by JwtAdapter instantiation pattern) | Q2, Code Examples | JwtAdapter pattern breaks; need different FastifyInstance injection |
| A3 | `loginWithGoogle` use case does not need an `IGoogleAuthPort` — Google client stays in use case for Phase 10 | Q4 / use-case design | Minor ARCH violation; deferred to Phase 13 cleanup |

---

## Open Questions

1. **Test count baseline**
   - What we know: STATE.md says "134 integration tests green" but REQUIREMENTS.md says "41 existing integration tests". Phase 9 research used "41" — the count was 41 before Phase 9 added tests during 09-03 execution (the plan added none, so likely still 41).
   - What's unclear: Did the 09-03 plan or code review report add integration tests? The git commit message says "134 integration tests green" which may include unit tests in the count.
   - Recommendation: Run `npm run test:integration` before starting Phase 10 to confirm the baseline count; record in plan.

2. **AuthController error handling — rethrow or let Fastify handle?**
   - What we know: The controller catches `DomainError` and maps it; other errors are rethrown.
   - What's unclear: Should the controller let `errorHandler` handle all errors (no try/catch in controller), or catch and map explicitly?
   - Recommendation: Use explicit try/catch in controller for DomainError, rethrow others. This makes the error mapping explicit and testable. But since `errorHandler.ts` is updated to handle DomainError anyway, the controller's try/catch is defensive redundancy — acceptable.

---

## Sources

### Primary (HIGH confidence — all verified by reading actual source files)
- `src/modules/auth/auth.service.ts` — current auth business logic, refresh transaction pattern, Google OAuth flow
- `src/modules/auth/auth.repository.ts` — current DB methods, findOrCreateGoogleUser transaction
- `src/modules/auth/auth.routes.ts` — current route registration, Zod schemas, rate limits
- `src/shared/hooks/authenticate.ts` — current hook implementation, AppError dependency
- `src/shared/db/prisma.ts`, `src/shared/db/neo4j.ts` — exact content to copy
- `src/shared/plugins/*.ts` — all five plugin files read
- `src/shared/errors/AppError.ts`, `src/shared/errors/errorHandler.ts` — error handling chain
- `src/app.ts` — composition root, all imports, buildApp structure
- `src/domain/interfaces/user.repository.interface.ts` — Phase 9 output
- `src/domain/interfaces/refresh-token.repository.interface.ts` — Phase 9 output (missing `revokeByHash`)
- `src/application/ports/token.port.ts`, `src/application/ports/hash.port.ts` — Phase 9 output
- `src/application/errors/domain.error.ts` — Phase 9 output
- `src/domain/entities/user.entity.ts`, `src/domain/entities/refresh-token.entity.ts` — Phase 9 output
- `tests/integration/auth.test.ts` — all integration test cases verified
- `tests/helpers/factories.ts`, `tests/helpers/setup.ts` — test infrastructure verified
- `plan-architecture.md` — canonical architecture reference, AuthController example, route example
- `.planning/REQUIREMENTS.md` — ARCH-09 through ARCH-12 requirements
- `.planning/ROADMAP.md` — Phase 10 success criteria
- `.planning/STATE.md` — accumulated context and decisions

---

## Metadata

**Confidence breakdown:**
- Infrastructure file copies: HIGH — files read directly; content is exact copy
- Auth use-case design: HIGH — derived from actual auth.service.ts; all edge cases (DUMMY_HASH, replay, Google) traced
- IRefreshTokenRepository gap (revokeByHash): HIGH — confirmed by comparing current prisma.$transaction pattern with existing interface
- JwtAdapter pattern: HIGH — confirmed by plan-architecture.md example `new JwtAdapter(request.server)`
- Test preservation: HIGH — tests use buildApp() + Supertest; only app.ts import changes

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (stable refactor; no external API changes expected)
