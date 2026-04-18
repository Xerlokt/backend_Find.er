# Phase 2: Authentication - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 11 new/modified files
**Analogs found:** 10 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `prisma/schema.prisma` | model | CRUD | `prisma/schema.prisma` (existing User model) | exact |
| `src/shared/plugins/rate-limit.ts` | plugin/middleware | request-response | `src/shared/plugins/jwt.ts` | exact |
| `src/app.ts` | config | request-response | `src/app.ts` (existing) | exact |
| `src/modules/auth/auth.routes.ts` | route | request-response | `src/modules/health/health.routes.ts` | role-match |
| `src/modules/auth/auth.service.ts` | service | request-response | `src/shared/hooks/requireRole.ts` (logic pattern) | partial |
| `src/modules/auth/auth.repository.ts` | repository | CRUD | `src/modules/health/health.routes.ts` (Prisma usage) | partial |
| `src/shared/errors/errorHandler.ts` | middleware | request-response | `src/shared/errors/errorHandler.ts` (existing) | exact |
| `tests/unit/auth.service.test.ts` | test | request-response | `tests/unit/errorHandler.test.ts` | role-match |
| `tests/integration/auth.test.ts` | test | request-response | `tests/integration/health.test.ts` | exact |
| `tests/helpers/setup.ts` | test-helper | CRUD | `tests/helpers/setup.ts` (existing) | exact |
| `tests/helpers/factories.ts` | test-helper | CRUD | `tests/helpers/factories.ts` (existing) | exact |

---

## Pattern Assignments

### `prisma/schema.prisma` (model, CRUD)

**Analog:** `prisma/schema.prisma` — existing User model pattern

**Existing relation pattern** (lines 34-46):
```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?
  googleId     String?   @unique
  avatarUrl    String?
  role         Role
  createdAt    DateTime  @default(now())

  candidateProfile CandidateProfile?
  recruiterProfile RecruiterProfile?
  sentMessages     Message[]         @relation("SentMessages")
}
```

**Child model relation pattern** (lines 48-62 — CandidateProfile as example):
```prisma
model CandidateProfile {
  id     String @id @default(uuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}
```

**What to add:**
1. Append `refreshTokens RefreshToken[]` to the `User` model relation block (after `sentMessages`).
2. Add new `RefreshToken` model after the `User` model:
```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique
  familyId  String
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([familyId])
  @@index([userId])
}
```

---

### `src/shared/plugins/rate-limit.ts` (plugin, request-response)

**Analog:** `src/shared/plugins/jwt.ts` — canonical fp-wrapped plugin pattern

**Full analog** (`src/shared/plugins/jwt.ts`, lines 1-12):
```typescript
import fp from 'fastify-plugin'
import jwtPlugin from '@fastify/jwt'
import { FastifyInstance } from 'fastify'

export default fp(async function jwtSetup(app: FastifyInstance) {
  await app.register(jwtPlugin, {
    secret: process.env.JWT_SECRET!,
    sign: {
      expiresIn: '15m',
    },
  })
})
```

**Pattern to copy:**
- Import `fp` from `fastify-plugin` — mandatory to escape Fastify encapsulation
- Export default `fp(async function <pluginName>(app: FastifyInstance) { ... })`
- `await app.register(thirdPartyPlugin, options)` inside

**Also reference for environment config:** `src/shared/plugins/helmet.ts` (lines 1-11):
```typescript
import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { FastifyInstance } from 'fastify'

export default fp(async function helmetPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? undefined
      : false,
  })
})
```

**Rate-limit specific additions** (from RESEARCH.md — D-10, D-11):
```typescript
errorResponseBuilder: (_request, context) => ({
  error: 'Too Many Requests',
  retryAfter: Math.ceil(context.ttl / 1000),  // context.ttl is in milliseconds
})
```

---

### `src/app.ts` (config, request-response)

**Analog:** `src/app.ts` (existing, lines 1-29)

**Full existing file:**
```typescript
import Fastify, { FastifyInstance } from 'fastify'
import helmetPlugin from './shared/plugins/helmet'
import corsPlugin from './shared/plugins/cors'
import jwtPlugin from './shared/plugins/jwt'
import { errorHandler } from './shared/errors/errorHandler'
import { healthRoutes } from './modules/health/health.routes'

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: !opts.testing,
  })

  // Security plugins registered first (SEC-07)
  await app.register(helmetPlugin)
  await app.register(corsPlugin)
  await app.register(jwtPlugin)

  // Global error handler
  app.setErrorHandler(errorHandler)

  // Routes
  await app.register(healthRoutes)

  return app
}
```

**What to add:**
- Import `rateLimitPlugin` from `'./shared/plugins/rate-limit'`
- Import `authRoutes` from `'./modules/auth/auth.routes'`
- Register `await app.register(rateLimitPlugin)` after `jwtPlugin`, before routes (critical ordering per RESEARCH.md Pitfall 2)
- Register `await app.register(authRoutes, { prefix: '/auth' })` after `healthRoutes`

---

### `src/modules/auth/auth.routes.ts` (route, request-response)

**Analog:** `src/modules/health/health.routes.ts` (lines 1-14)

**Full analog:**
```typescript
import { FastifyInstance } from 'fastify'
import { prisma } from '../../shared/db/prisma'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return reply.status(200).send({ status: 'ok', db: 'connected' })
    } catch {
      return reply.status(503).send({ status: 'error', db: 'disconnected' })
    }
  })
}
```

**Pattern to copy:**
- Named async function export (not default), typed `FastifyInstance` parameter, returns `Promise<void>`
- Route handlers as inline async functions with `(request, reply)` signature
- `return reply.status(N).send(payload)` pattern

**Auth-specific additions** (no preHandler in public auth routes — RESEARCH.md anti-patterns):
```typescript
// Per-route rate limit override pattern (RESEARCH.md Pattern 1)
app.post('/login', {
  config: {
    rateLimit: { max: 5, timeWindow: '1 minute' },
  },
}, async (request, reply) => {
  // parse body with Zod, call service, reply
})
```

**Zod validation pattern** (inline in handler, matching existing codebase style):
```typescript
// No Fastify schema — use Zod.parse() directly in handler
const body = RegisterBodySchema.parse(request.body)
```

**Service instantiation pattern** (dependency injection via constructor — not singleton):
```typescript
const repo = new AuthRepository()
const service = new AuthService(repo, app)  // app passed for jwt.sign access
```

---

### `src/modules/auth/auth.service.ts` (service, request-response)

**Analog:** `src/shared/hooks/requireRole.ts` (logic pattern) + `src/shared/hooks/authenticate.ts` (AppError usage)

**AppError throw pattern** (`src/shared/hooks/authenticate.ts`, lines 19-23):
```typescript
try {
  await request.jwtVerify()
} catch {
  throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
}
```

**AppError throw pattern** (`src/shared/hooks/requireRole.ts`, lines 15-20):
```typescript
if (!request.user) {
  throw new AppError('authenticate hook missing before requireRole', 500, 'INTERNAL')
}
if (!roles.includes(request.user.role)) {
  throw new AppError('Forbidden', 403, 'FORBIDDEN')
}
```

**Key patterns to copy:**
- Always `throw new AppError(message, statusCode, code)` — never return errors, never `next(err)`
- Error codes are the third argument: `'UNAUTHORIZED'`, `'FORBIDDEN'`, `'INVALID_CREDENTIALS'`, `'TOKEN_EXPIRED'`
- Import path: `import { AppError } from '../../shared/errors/AppError'`

**No existing service analog** — closest is the repository pattern used inline in health.routes.ts (via `prisma` directly). Auth service is the first formal service class in the codebase.

**Class constructor pattern to use** (from RESEARCH.md Pattern 6):
```typescript
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly app: FastifyInstance,  // for app.jwt.sign()
  ) {}
}
```

---

### `src/modules/auth/auth.repository.ts` (repository, CRUD)

**Analog:** Prisma usage in `src/shared/db/prisma.ts` (singleton) + `tests/helpers/factories.ts` (Prisma create patterns)

**Prisma singleton import** (`src/shared/db/prisma.ts`, lines 1-13):
```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
```

**Prisma create pattern** (`tests/helpers/factories.ts`, lines 6-17):
```typescript
return prisma.user.create({
  data: {
    email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    role: overrides.role ?? 'CANDIDATE',
    passwordHash: overrides.passwordHash ?? await bcrypt.hash('password123', 12),
  },
})
```

**Import pattern for repository:**
```typescript
import { prisma } from '../../shared/db/prisma'
```

**Class pattern:**
```typescript
export class AuthRepository {
  // No constructor needed — uses prisma singleton directly
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } })
  }
}
```

---

### `src/shared/errors/errorHandler.ts` (middleware, request-response)

**Analog:** `src/shared/errors/errorHandler.ts` (existing, lines 1-51)

**Existing AppError branch** (lines 12-15):
```typescript
if (error instanceof AppError) {
  reply.status(error.statusCode).send({ error: error.message })
  return
}
```

**What to change** (D-14 from CONTEXT.md — add `code` to AppError responses):
```typescript
// BEFORE:
reply.status(error.statusCode).send({ error: error.message })

// AFTER (include code field for client error discrimination):
reply.status(error.statusCode).send({ error: error.message, code: error.code })
```

All other branches (ZodError, Prisma, FastifyError, unknown) remain unchanged.

---

### `tests/unit/auth.service.test.ts` (test, request-response)

**Analog:** `tests/unit/errorHandler.test.ts` (lines 1-47)

**Full analog structure:**
```typescript
import { AppError } from '../../src/shared/errors/AppError'
import { errorHandler } from '../../src/shared/errors/errorHandler'
import { ZodError, z } from 'zod'
import { FastifyRequest, FastifyReply } from 'fastify'

function mockReply() {
  const reply = { statusCode: 0, body: null as unknown } as { ... }
  reply.status = (code: number) => { reply.statusCode = code; return reply }
  reply.send = (body: unknown) => { reply.body = body; return reply }
  return reply
}

describe('errorHandler', () => {
  it('handles AppError with correct status and message', () => {
    const err = new AppError('Not found', 404)
    const reply = mockReply()
    errorHandler(err, fakeRequest, reply as unknown as FastifyReply)
    expect(reply.statusCode).toBe(404)
    expect((reply.body as { error: string }).error).toBe('Not found')
  })
})
```

**Patterns to copy:**
- `describe('<ClassName>', () => { it('<behavior>', () => { ... }) })` structure
- No `beforeEach`/`afterEach` for unit tests (no DB — use mocks)
- Mock external dependencies inline with `jest.fn()` or `jest.mock('module')`
- Cast mocks as `unknown as RealType` for TypeScript satisfaction

**Auth service unit test specifics:**
```typescript
// Mock google-auth-library at module level
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}))

// Mock AuthRepository with jest.fn() stubs
const mockRepo = {
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  // ...
} as unknown as AuthRepository
```

---

### `tests/integration/auth.test.ts` (test, request-response)

**Analog:** `tests/integration/health.test.ts` (lines 1-18)

**Full analog:**
```typescript
import '../helpers/setup' // registers beforeAll/afterAll/afterEach hooks
import { buildApp } from '../../src/app'
import supertest from 'supertest'

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server).get('/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
    expect(response.headers['content-type']).toMatch(/application\/json/)

    await app.close()
  })
})
```

**Patterns to copy:**
- First line always: `import '../helpers/setup'` — registers DB cleanup hooks
- `buildApp({ testing: true })` — disables logger in tests
- `await app.ready()` before supertest requests
- `await app.close()` at end of each `it` block (or in `afterEach`)
- `supertest(app.server).post('/auth/login').send(payload)` for POST requests

**Auth-specific additions:**
```typescript
// Factory usage for pre-seeded data
import { createUser, createRefreshToken } from '../helpers/factories'

// Google route spy pattern (RESEARCH.md Pitfall 6)
import { OAuth2Client } from 'google-auth-library'
jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
  getPayload: () => ({
    sub: 'google-uid-123',
    email: 'test@gmail.com',
    name: 'Test User',
    picture: undefined,
  }),
} as any)
```

---

### `tests/helpers/setup.ts` (test-helper, CRUD)

**Analog:** `tests/helpers/setup.ts` (existing, lines 1-28)

**Full existing file:**
```typescript
import { execSync } from 'child_process'
import { prisma } from '../../src/shared/db/prisma'

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST! },
    stdio: 'inherit',
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  // Delete in FK-safe order: children before parents
  await prisma.message.deleteMany()
  await prisma.chat.deleteMany()
  await prisma.swipe.deleteMany()
  await prisma.creditTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.recruiterProfile.deleteMany()
  await prisma.company.deleteMany()
  await prisma.candidateProfile.deleteMany()
  await prisma.user.deleteMany()
})
```

**What to add** (RESEARCH.md Pitfall 8 — FK order: child before parent):
```typescript
afterEach(async () => {
  // RefreshToken must be deleted BEFORE User (FK constraint)
  await prisma.refreshToken.deleteMany()   // ADD THIS — before user.deleteMany()
  await prisma.message.deleteMany()
  // ... rest unchanged
  await prisma.user.deleteMany()
})
```

---

### `tests/helpers/factories.ts` (test-helper, CRUD)

**Analog:** `tests/helpers/factories.ts` (existing, lines 1-17 — `createUser` function)

**Existing factory pattern** (lines 5-17):
```typescript
export async function createUser(overrides: Partial<{
  email: string
  role: Role
  passwordHash: string
}> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      role: overrides.role ?? 'CANDIDATE',
      passwordHash: overrides.passwordHash ?? await bcrypt.hash('password123', 12),
    },
  })
}
```

**Pattern to copy for `createRefreshToken`:**
- Same `overrides: Partial<{...}> = {}` signature
- Sensible defaults for all fields using `??`
- Import from `'@prisma/client'` for enum types
- `Date.now()` for unique string fields

**New factory to add:**
```typescript
import { createHash, randomBytes } from 'crypto'

export async function createRefreshToken(userId: string, overrides: Partial<{
  tokenHash: string
  familyId: string
  expiresAt: Date
  revokedAt: Date | null
}> = {}) {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = overrides.tokenHash
    ?? createHash('sha256').update(rawToken).digest('hex')

  const stored = await prisma.refreshToken.create({
    data: {
      tokenHash,
      familyId: overrides.familyId ?? randomBytes(16).toString('hex'),
      userId,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: overrides.revokedAt ?? null,
    },
  })
  return { stored, rawToken }  // rawToken for use in HTTP requests
}
```

---

## Shared Patterns

### AppError Throw
**Source:** `src/shared/hooks/authenticate.ts` lines 19-23 and `src/shared/hooks/requireRole.ts` lines 15-20
**Apply to:** `auth.service.ts`, `auth.repository.ts` (never return errors — always throw)
```typescript
throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
throw new AppError('Token revoked', 401, 'TOKEN_EXPIRED')
throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
throw new AppError('Forbidden', 403, 'FORBIDDEN')
```

### fp Plugin Wrapper
**Source:** `src/shared/plugins/jwt.ts` lines 1-12
**Apply to:** `src/shared/plugins/rate-limit.ts` only
```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

export default fp(async function pluginName(app: FastifyInstance) {
  await app.register(thirdPartyPlugin, options)
})
```

### Prisma Singleton Import
**Source:** `src/shared/db/prisma.ts`
**Apply to:** `auth.repository.ts`, updated `tests/helpers/setup.ts`, `tests/helpers/factories.ts`
```typescript
import { prisma } from '../../shared/db/prisma'   // from src/modules/auth/
import { prisma } from '../../src/shared/db/prisma' // from tests/
```

### Test Setup Import
**Source:** `tests/integration/health.test.ts` line 1
**Apply to:** `tests/integration/auth.test.ts`
```typescript
import '../helpers/setup' // registers beforeAll/afterAll/afterEach hooks
```

### buildApp Testing Pattern
**Source:** `tests/integration/health.test.ts` lines 5-17
**Apply to:** `tests/integration/auth.test.ts`
```typescript
const app = await buildApp({ testing: true })
await app.ready()
// ... supertest calls ...
await app.close()
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/modules/auth/auth.service.ts` | service | request-response | No service class exists yet — codebase uses inline Prisma calls in routes. Pattern is established in RESEARCH.md (class with constructor injection). |

---

## Metadata

**Analog search scope:** `src/modules/`, `src/shared/`, `tests/`, `prisma/`
**Files scanned:** 14
**Pattern extraction date:** 2026-04-18
