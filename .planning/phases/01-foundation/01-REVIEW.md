---
phase: 01-foundation
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - .env.example
  - .gitignore
  - docker-compose.yml
  - jest.config.ts
  - package.json
  - prisma.config.ts
  - prisma/schema.prisma
  - src/app.ts
  - src/modules/health/health.routes.ts
  - src/server.ts
  - src/shared/db/neo4j.ts
  - src/shared/db/prisma.ts
  - src/shared/errors/AppError.ts
  - src/shared/errors/errorHandler.ts
  - src/shared/hooks/authenticate.ts
  - src/shared/hooks/requireRole.ts
  - src/shared/plugins/cors.ts
  - src/shared/plugins/helmet.ts
  - src/shared/plugins/jwt.ts
  - tests/helpers/factories.ts
  - tests/helpers/setup.ts
  - tests/integration/health.test.ts
  - tests/unit/appError.test.ts
  - tests/unit/errorHandler.test.ts
  - tsconfig.json
findings:
  critical: 4
  warning: 4
  info: 4
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

This review covers the full foundation layer of the Job Tinder backend: server bootstrap, Fastify plugins (helmet, CORS, JWT), shared DB clients (Prisma, Neo4j), error handling infrastructure, auth hooks, the health route, test helpers, and unit/integration tests.

The structural skeleton is sound — Clean Architecture layers are correctly separated, AppError and errorHandler are well-implemented, and the test setup pattern is sensible. However, four critical issues must be fixed before this foundation can be considered secure: tokens never expire, the CORS wildcard leaks in production, the JWT plugin silently falls back to a known weak secret, and the Neo4j driver swallows missing env vars.

---

## Critical Issues

### CR-01: JWT tokens never expire — access tokens are immortal

**File:** `src/shared/plugins/jwt.ts:6-8`
**Issue:** `@fastify/jwt` is registered with only a `secret`. No `sign.expiresIn` is configured. Every token issued by this server is valid indefinitely, directly violating the CLAUDE.md rule "JWT access token ≤ 15min + refresh token with rotation." An attacker who obtains any token has permanent access.
**Fix:**
```typescript
await app.register(jwtPlugin, {
  secret: process.env.JWT_SECRET!,
  sign: {
    expiresIn: '15m',
  },
})
```
The refresh-token rotation mechanism should be implemented in the auth service when that module is built.

---

### CR-02: JWT plugin silently falls back to a known weak secret

**File:** `src/shared/plugins/jwt.ts:7`
**Issue:** `secret: process.env.JWT_SECRET ?? 'dev-secret-change-me'` means if `JWT_SECRET` is absent in a production environment, the server starts normally using a publicly known string as the signing secret. All tokens become forgeable. There is no startup guard that prevents this.
**Fix:** Validate required env vars at startup and throw early if any are missing.
```typescript
// In src/server.ts, before buildApp(), add:
const requiredEnv = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD']
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
}
```
Then in `jwt.ts` remove the fallback:
```typescript
secret: process.env.JWT_SECRET!,
```

---

### CR-03: CORS falls back to wildcard `'*'` when ALLOWED_ORIGINS is not set

**File:** `src/shared/plugins/cors.ts:7`
**Issue:** `origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*'` — if `ALLOWED_ORIGINS` is not configured (which is the case in `.env.example`, where the variable does not exist), every origin is permitted. In production this disables the Same-Origin restriction entirely and enables cross-origin credential sharing.
**Fix:** Require `ALLOWED_ORIGINS` in production, or provide a safe default:
```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('ALLOWED_ORIGINS must be set in production') })()
    : ['http://localhost:3000']

await app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
})
```
Also add `ALLOWED_ORIGINS=` to `.env.example` so developers know the variable exists.

---

### CR-04: Neo4j driver silently accepts undefined env vars — broken driver, no crash

**File:** `src/shared/db/neo4j.ts:7-9`
**Issue:** `process.env.NEO4J_URI!`, `process.env.NEO4J_USER!`, and `process.env.NEO4J_PASSWORD!` use TypeScript's non-null assertion operator, which is erased at runtime. If any variable is undefined, `neo4j.driver()` receives the string `"undefined"` or calls `neo4j.auth.basic(undefined, undefined)`. The driver object is created successfully, but every session/query will fail at runtime with an obscure connection error instead of a clear startup failure.
**Fix:** Add runtime guards before creating the driver:
```typescript
export function getNeo4jDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI
    const user = process.env.NEO4J_USER
    const password = process.env.NEO4J_PASSWORD
    if (!uri || !user || !password) {
      throw new Error('NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD must all be set')
    }
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  }
  return driver
}
```

---

## Warnings

### WR-01: Helmet disables Content-Security-Policy globally with no environment guard

**File:** `src/shared/plugins/helmet.ts:7`
**Issue:** `contentSecurityPolicy: false` is applied unconditionally. The inline comment says "disabled in dev" but there is no `NODE_ENV` check — CSP is also disabled in production. Helmet's default CSP is a meaningful defence-in-depth measure and should not be omitted in production.
**Fix:**
```typescript
await app.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production'
    ? undefined  // use helmet defaults in production
    : false,     // disable in dev to allow Vite/HMR etc.
})
```

---

### WR-02: Test setup overrides DATABASE_URL after Prisma client is already instantiated

**File:** `tests/helpers/setup.ts:6`
**Issue:** `process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!` is executed in `beforeAll`, which runs after all module imports are resolved. `src/shared/db/prisma.ts` creates the `PrismaClient` at module-import time (line 5-9), reading `DATABASE_URL` from the environment when the module is first loaded — before `beforeAll` fires. The Prisma singleton may therefore connect to the production/development database rather than the test database, silently running destructive `deleteMany` operations against the wrong DB.
**Fix:** The `DATABASE_URL` override must happen before the Prisma client is instantiated. The cleanest solution is a Jest `globalSetup` file:
```typescript
// jest.global-setup.ts
export default async function () {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!
}
```
Add to `jest.config.ts`:
```typescript
globalSetup: '<rootDir>/tests/jest.global-setup.ts',
```
Alternatively, use a Jest `--env` environment file or ensure `DATABASE_URL_TEST` is the value of `DATABASE_URL` in the `.env` used during test runs.

---

### WR-03: `requireRole` has no type-level enforcement that `authenticate` ran first

**File:** `src/shared/hooks/requireRole.ts:11-13`
**Issue:** The guard `if (!request.user)` throws a 401 when `authenticate` was not registered as a preceding `preHandler`. A developer who registers `requireRole(...)` on a route without `authenticate` will get a 401 (Unauthorized) response rather than a 403 (Forbidden), masking the configuration error and potentially creating a route that is auth-checked at the role level but whose JWT is never verified.
**Fix:** Document the required usage clearly with a JSDoc comment and consider asserting the user is non-null more loudly:
```typescript
/**
 * MUST be used after the `authenticate` preHandler.
 * Example: preHandler: [authenticate, requireRole('RECRUITER')]
 */
export function requireRole(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      // This means authenticate was not run — programming error, not a client error
      throw new AppError('authenticate hook missing before requireRole', 500, 'INTERNAL')
    }
    if (!roles.includes(request.user.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}
```

---

### WR-04: `prisma/schema.prisma` datasource has no `url` field — relies solely on external config

**File:** `prisma/schema.prisma:5-7`
**Issue:** The `datasource db` block contains only `provider = "postgresql"` with no `url` field. The database URL is only supplied via `prisma.config.ts`. Running any `prisma` CLI command (e.g., `prisma studio`, `prisma db pull`) without the config file being picked up will fail with an unclear error. More critically, `prisma.config.ts` passes `process.env["DATABASE_URL"]` which can be `undefined` at runtime with no validation.
**Fix:** Add an `env()` reference in the schema as the standard Prisma pattern:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
This makes the schema self-documenting and enables standard Prisma tooling to work without the custom config file.

---

## Info

### IN-01: `console.log` used in server entry point instead of structured logger

**File:** `src/server.ts:9`
**Issue:** `console.log(\`Server running on port ${port}\`)` bypasses the Fastify logger. In production, structured JSON logs are expected; this line will emit unstructured text that won't be parsed by log aggregators.
**Fix:**
```typescript
async function main() {
  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`Server running on port ${port}`)
}
```

---

### IN-02: `errorHandler` uses `console.error` instead of Fastify request logger

**File:** `src/shared/errors/errorHandler.ts:49`
**Issue:** `console.error('[errorHandler] Unhandled error:', error)` writes an unstructured log. Fastify provides `request.log.error()` which includes the request ID, route, and other correlation metadata automatically, making production debugging significantly easier.
**Fix:**
```typescript
// Replace:
console.error('[errorHandler] Unhandled error:', error)
// With:
_request.log.error({ err: error }, 'Unhandled error')
// Also rename _request parameter to request in the function signature
```

---

### IN-03: `authenticate` silently discards the original JWT error

**File:** `src/shared/hooks/authenticate.ts:21-23`
**Issue:** The catch block `catch { throw new AppError('Unauthorized', 401, 'UNAUTHORIZED') }` discards the original error from `request.jwtVerify()`. Distinguishing between an expired token, a malformed token, and a wrong-secret error becomes impossible without server-side logs. This makes security incident investigation harder.
**Fix:**
```typescript
} catch (err) {
  // Log the specific JWT failure for server-side observability
  request.log.warn({ err }, 'JWT verification failed')
  throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
}
```
The public response still returns only the generic "Unauthorized" message (no info leakage), but the cause is recorded in logs.

---

### IN-04: `health.routes.ts` imports Prisma client directly — bypasses architecture layers

**File:** `src/modules/health/health.routes.ts:2`
**Issue:** `import { prisma } from '../../shared/db/prisma'` in a route file directly accesses the database client. CLAUDE.md enforces "routes → service → repository" with no layer skipping. This is a minor violation in the health route specifically (which has no domain logic), but it sets a precedent that should not be followed in feature modules.
**Fix:** For Phase 1 this is acceptable as the health route has no domain logic. Add a comment to signal intentional exception:
```typescript
// Health route intentionally calls prisma directly — no domain logic warrants a service layer.
// Feature modules MUST use routes → service → repository pattern.
```
Alternatively, extract to a `HealthService.check()` method to establish the pattern.

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
