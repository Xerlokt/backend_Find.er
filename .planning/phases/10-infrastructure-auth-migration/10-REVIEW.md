---
phase: 10-infrastructure-auth-migration
reviewed: 2026-05-07T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/adapters/controllers/auth.controller.ts
  - src/adapters/repositories/refresh-token.repository.ts
  - src/adapters/repositories/user.repository.ts
  - src/adapters/services/bcrypt.adapter.ts
  - src/adapters/services/jwt.adapter.ts
  - src/app.ts
  - src/application/use-cases/auth/login-with-google.use-case.ts
  - src/application/use-cases/auth/login.use-case.ts
  - src/application/use-cases/auth/logout.use-case.ts
  - src/application/use-cases/auth/refresh-token.use-case.ts
  - src/application/use-cases/auth/register.use-case.ts
  - src/domain/interfaces/refresh-token.repository.interface.ts
  - src/infrastructure/database/neo4j.ts
  - src/infrastructure/database/prisma.ts
  - src/infrastructure/http/plugins/authenticate.hook.ts
  - src/infrastructure/http/plugins/cors.plugin.ts
  - src/infrastructure/http/plugins/helmet.plugin.ts
  - src/infrastructure/http/plugins/jwt.plugin.ts
  - src/infrastructure/http/plugins/rate-limit.plugin.ts
  - src/infrastructure/http/plugins/scheduler.plugin.ts
  - src/infrastructure/http/routes/auth.routes.ts
  - src/shared/errors/errorHandler.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 10 migrated auth infrastructure to Clean Architecture. The separation of concerns is well-executed: domain interfaces, application use cases, adapter implementations, and infrastructure plugins are all properly layered. The timing-safe login (constant-time dummy hash comparison) and refresh token rotation with replay-attack detection are solid security implementations.

Three issues require attention before this phase is considered complete: the `app.ts` still imports plugins from the old `./shared/plugins/*` path instead of the new `./infrastructure/http/plugins/*` path, meaning the newly created infrastructure plugin files are dead code that is never loaded. The `loginWithGoogle` handler always returns HTTP 201, even for returning users. The `prisma.ts` singleton fails silently when `DATABASE_URL` is undefined. Additionally, the controller instantiates all use-case dependencies on every request, which is a structural anti-pattern worth fixing.

## Critical Issues

### CR-01: Infrastructure plugins are dead code — app.ts imports old shared/plugins copies

**File:** `src/app.ts:3-7`
**Issue:** `app.ts` imports helmet, cors, jwt, rate-limit, and scheduler from `./shared/plugins/*`, not from the newly created `./infrastructure/http/plugins/*`. The five files created in Phase 10 under `src/infrastructure/http/plugins/` are never loaded. Any changes made to the infrastructure copies (e.g., configuration tuning) have no effect on the running server.
**Fix:**
```typescript
// src/app.ts — replace shared/plugins imports with infrastructure/http/plugins
import helmetPlugin from './infrastructure/http/plugins/helmet.plugin'
import corsPlugin from './infrastructure/http/plugins/cors.plugin'
import jwtPlugin from './infrastructure/http/plugins/jwt.plugin'
import rateLimitPlugin from './infrastructure/http/plugins/rate-limit.plugin'
import { schedulerPlugin } from './infrastructure/http/plugins/scheduler.plugin'
```
Once `app.ts` is updated, the five files under `src/shared/plugins/` become redundant and should be deleted (or kept as the canonical location, with the infrastructure copies removed instead — the team should decide which layer owns these plugins).

## Warnings

### WR-01: loginWithGoogle always returns 201 — incorrect for returning users

**File:** `src/adapters/controllers/auth.controller.ts:125`
**Issue:** `reply.status(201).send(tokens)` is returned unconditionally for the Google login flow. HTTP 201 means "resource created." For existing users authenticating via Google (the common case after first sign-in), the correct status is 200. The `findOrCreateGoogle` method returns an `isNew` boolean that makes the intent distinguishable.
**Fix:**
```typescript
async loginWithGoogle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = GoogleBodySchema.parse(request.body)
  const useCase = new LoginWithGoogleUseCase(
    new UserRepository(),
    new RefreshTokenRepository(),
    new JwtAdapter(request.server),
  )
  try {
    const { tokens, isNew } = await useCase.execute(body)   // use-case must return isNew
    reply.status(isNew ? 201 : 200).send(tokens)
  } catch (err) {
    if (err instanceof DomainError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code })
      return
    }
    throw err
  }
}
```
This requires `LoginWithGoogleUseCase.execute` to return `{ tokens, isNew }` instead of `tokens` alone — the `isNew` flag from `findOrCreateGoogle` must be threaded through.

### WR-02: prisma.ts silently accepts undefined DATABASE_URL — deferred crash at query time

**File:** `src/infrastructure/database/prisma.ts:7-8`
**Issue:** `process.env.DATABASE_URL` is assigned to `connectionString` without a guard. If the variable is absent, `undefined` is passed to `PrismaPg({ connectionString: undefined })`. Prisma/PrismaPg may accept the constructor call without throwing, deferring the failure to the first query during a request — producing a confusing runtime error far from the source of misconfiguration. `server.ts` validates env vars at startup, but `prisma.ts` is a singleton that can be imported in test contexts before `server.ts` runs.
**Fix:**
```typescript
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}
```

### WR-03: Use-case dependencies instantiated on every request in AuthController

**File:** `src/adapters/controllers/auth.controller.ts:41-46, 61-66, 81-85, 100-102, 117-120`
**Issue:** `new UserRepository()`, `new RefreshTokenRepository()`, `new BcryptAdapter()`, and `new JwtAdapter(request.server)` are all constructed inside each handler on every HTTP request. This allocates new objects per-request and makes the controller impossible to unit-test without calling through Fastify. `JwtAdapter` must receive `request.server` at construction time, but the other three have no per-request state.
**Fix:** Accept dependencies via the controller constructor. Pass `request.server` (or a `JwtAdapter` factory) only where needed:
```typescript
export class AuthController {
  private readonly userRepo: IUserRepository
  private readonly refreshTokenRepo: IRefreshTokenRepository
  private readonly hash: IHashPort

  constructor(
    userRepo?: IUserRepository,
    refreshTokenRepo?: IRefreshTokenRepository,
    hash?: IHashPort,
  ) {
    this.userRepo = userRepo ?? new UserRepository()
    this.refreshTokenRepo = refreshTokenRepo ?? new RefreshTokenRepository()
    this.hash = hash ?? new BcryptAdapter()
  }

  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterBodySchema.parse(request.body)
    const useCase = new RegisterUseCase(
      this.userRepo,
      this.refreshTokenRepo,
      this.hash,
      new JwtAdapter(request.server),   // JwtAdapter still per-request (needs app instance)
    )
    // ...
  }
}
```

### WR-04: JWT_SECRET missing at runtime silently produces insecure tokens

**File:** `src/infrastructure/http/plugins/jwt.plugin.ts:7`
**Issue:** `process.env.JWT_SECRET!` uses a non-null assertion that TypeScript trusts at compile time. If `JWT_SECRET` is absent at runtime, `@fastify/jwt` receives the string `"undefined"` (coerced from `undefined`) as the signing secret, producing structurally valid but trivially forgeable JWTs. The non-null assertion bypasses the TypeScript safety check without providing an actual runtime guard.
**Fix:**
```typescript
export default fp(async function jwtSetup(app: FastifyInstance) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  await app.register(jwtPlugin, {
    secret,
    sign: { expiresIn: '15m' },
  })
})
```
The same pattern applies to `src/shared/plugins/jwt.ts` (the currently active copy — see CR-01).

## Info

### IN-01: console.error in production errorHandler — should use Fastify logger

**File:** `src/shared/errors/errorHandler.ts:62`
**Issue:** `console.error('[errorHandler] Unhandled error:', error)` bypasses the structured Fastify logger. In production, this produces unstructured output that cannot be correlated with request IDs, log aggregators, or JSON logging pipelines.
**Fix:**
```typescript
// Pass _request as request (remove underscore prefix) to access logger
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // ...
  request.log.error({ err: error }, 'Unhandled error')
  reply.status(500).send({ error: 'Internal server error' })
}
```

### IN-02: OAuth2Client instantiated at module scope in application use case

**File:** `src/application/use-cases/auth/login-with-google.use-case.ts:9`
**Issue:** `const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)` executes at module import time. This is a side effect in the application layer and breaks testability — any test that imports this file triggers a network-capable object construction even if `GOOGLE_CLIENT_ID` is undefined. The comment on line 8 acknowledges this is deferred but it should be noted as a pending refactor.
**Fix (short-term):** Move instantiation inside `execute`:
```typescript
async execute(input: LoginWithGoogleInput) {
  const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  // ...
}
```
**Fix (long-term):** Introduce an `IGoogleAuthPort` and inject a `GoogleAuthAdapter`, as noted in the existing comment.

### IN-03: Duplicate plugin files — shared/plugins and infrastructure/http/plugins are identical

**File:** `src/infrastructure/http/plugins/` (all 5 files)
**Issue:** Each file in `src/infrastructure/http/plugins/` is an exact copy of its counterpart in `src/shared/plugins/`. After resolving CR-01 (updating `app.ts` imports), one set must be deleted to avoid future drift. Until then, any maintenance change must be applied to both copies.
**Fix:** After updating `app.ts` to import from `infrastructure/http/plugins/`, delete the five files under `src/shared/plugins/` (helmet.ts, cors.ts, jwt.ts, rate-limit.ts, scheduler.ts) if no other code references them.

---

_Reviewed: 2026-05-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
