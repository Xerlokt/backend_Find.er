# Phase 10: Infrastructure + Auth Migration - Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 20 (11 new, 3 modified, 8 infrastructure copies)
**Analogs found:** 20 / 20

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/infrastructure/database/prisma.ts` | config | — | `src/shared/db/prisma.ts` | exact copy |
| `src/infrastructure/database/neo4j.ts` | config | — | `src/shared/db/neo4j.ts` | exact copy |
| `src/infrastructure/http/plugins/helmet.plugin.ts` | middleware | request-response | `src/shared/plugins/helmet.ts` | exact copy |
| `src/infrastructure/http/plugins/cors.plugin.ts` | middleware | request-response | `src/shared/plugins/cors.ts` | exact copy |
| `src/infrastructure/http/plugins/jwt.plugin.ts` | middleware | request-response | `src/shared/plugins/jwt.ts` | exact copy |
| `src/infrastructure/http/plugins/rate-limit.plugin.ts` | middleware | request-response | `src/shared/plugins/rate-limit.ts` | exact copy |
| `src/infrastructure/http/plugins/scheduler.plugin.ts` | middleware | event-driven | `src/shared/plugins/scheduler.ts` | exact copy |
| `src/infrastructure/http/plugins/authenticate.hook.ts` | middleware | request-response | `src/shared/hooks/authenticate.ts` | exact copy (keep AppError) |
| `src/adapters/services/bcrypt.adapter.ts` | utility | transform | `src/application/ports/hash.port.ts` (interface) | implements port |
| `src/adapters/services/jwt.adapter.ts` | utility | request-response | `src/application/ports/token.port.ts` (interface) | implements port |
| `src/adapters/repositories/user.repository.ts` | model | CRUD | `src/modules/auth/auth.repository.ts` + `src/domain/interfaces/user.repository.interface.ts` | role-match |
| `src/adapters/repositories/refresh-token.repository.ts` | model | CRUD | `src/modules/auth/auth.repository.ts` + `src/domain/interfaces/refresh-token.repository.interface.ts` | role-match |
| `src/application/use-cases/auth/register.use-case.ts` | service | request-response | `src/modules/auth/auth.service.ts` (register method) | role-match |
| `src/application/use-cases/auth/login.use-case.ts` | service | request-response | `src/modules/auth/auth.service.ts` (login method) | role-match |
| `src/application/use-cases/auth/refresh-token.use-case.ts` | service | request-response | `src/modules/auth/auth.service.ts` (refresh method) | role-match |
| `src/application/use-cases/auth/logout.use-case.ts` | service | request-response | `src/modules/auth/auth.service.ts` (logout method) | role-match |
| `src/application/use-cases/auth/login-with-google.use-case.ts` | service | request-response | `src/modules/auth/auth.service.ts` (loginWithGoogle method) | role-match |
| `src/adapters/controllers/auth.controller.ts` | controller | request-response | `src/modules/auth/auth.routes.ts` (inline handlers) | role-match |
| `src/infrastructure/http/routes/auth.routes.ts` | route | request-response | `src/modules/auth/auth.routes.ts` | role-match |
| `src/domain/interfaces/refresh-token.repository.interface.ts` | model | CRUD | existing file (add revokeByHash) | modify |
| `src/shared/errors/errorHandler.ts` | middleware | request-response | existing file (add DomainError branch) | modify |
| `src/app.ts` | config | — | existing file (swap auth import) | modify |

---

## Pattern Assignments

### Wave 1: Infrastructure Copies

---

### `src/infrastructure/database/prisma.ts` (config)

**Analog:** `src/shared/db/prisma.ts` — exact copy, no changes.

**Full file content** (lines 1-19):
```typescript
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

**Note for planner:** `adapters/repositories/user.repository.ts` and `refresh-token.repository.ts` import from `../../infrastructure/database/prisma` (not from `../../shared/db/prisma`). This is the canonical import path after Wave 1.

---

### `src/infrastructure/database/neo4j.ts` (config)

**Analog:** `src/shared/db/neo4j.ts` — exact copy, no changes.

**Full file content** (lines 1-22):
```typescript
import neo4j, { Driver } from 'neo4j-driver'

let driver: Driver

export function getNeo4jDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI
    const user = process.env.NEO4J_USER
    const password = process.env.NEO4J_PASSWORD
    if (!uri || !user || !password) {
      throw new Error('NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD must all be set')
    }
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { disableLosslessIntegers: true })
  }
  return driver
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close()
  }
}
```

---

### `src/infrastructure/http/plugins/helmet.plugin.ts` (middleware)

**Analog:** `src/shared/plugins/helmet.ts` — exact copy, no changes.

**Full file content** (lines 1-11):
```typescript
import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { FastifyInstance } from 'fastify'

export default fp(async function helmetPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
      ? undefined  // use helmet defaults in production
      : false,     // disabled in dev to allow Vite/HMR etc.
  })
})
```

---

### `src/infrastructure/http/plugins/cors.plugin.ts` (middleware)

**Analog:** `src/shared/plugins/cors.ts` — exact copy, no changes.

**Full file content** (lines 1-17):
```typescript
import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'

export default fp(async function corsPlugin(app: FastifyInstance) {
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
})
```

---

### `src/infrastructure/http/plugins/jwt.plugin.ts` (middleware)

**Analog:** `src/shared/plugins/jwt.ts` — exact copy, no changes.

**Full file content** (lines 1-12):
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

---

### `src/infrastructure/http/plugins/rate-limit.plugin.ts` (middleware)

**Analog:** `src/shared/plugins/rate-limit.ts` — exact copy, no changes.

**Full file content** (lines 1-17):
```typescript
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
      statusCode: context.statusCode ?? 429,
      error: 'Too Many Requests',
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  })
})
```

---

### `src/infrastructure/http/plugins/scheduler.plugin.ts` (middleware, event-driven)

**Analog:** `src/shared/plugins/scheduler.ts` — exact copy, no changes.

**Full file content** (lines 1-30):
```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import cron from 'node-cron'
import { JobRepository } from '../../modules/job/job.repository'
import { runExpiryCheck } from '../../modules/job/job.scheduler'

async function plugin(app: FastifyInstance): Promise<void> {
  const repo = new JobRepository()

  const task = cron.schedule('* * * * *', async () => {
    try {
      const count = await runExpiryCheck(repo)
      if (count > 0) {
        app.log.info({ deactivated: count }, 'Job expiry check: deactivated expired jobs')
      }
    } catch (err) {
      app.log.error({ err }, 'Job expiry check failed')
    }
  })

  task.start()

  app.addHook('onClose', async () => {
    task.stop()
  })
}

export const schedulerPlugin = fp(plugin)
```

**Note for planner:** The import `../../modules/job/job.repository` is intentionally kept in Phase 10. The scheduler import is cleaned up when the job module migrates (Phase 11). The copy's relative path depth changes — verify `../../modules/` resolves correctly from `src/infrastructure/http/plugins/`. It does: `src/infrastructure/http/plugins/` → `../../..` = `src/`, so `../../../modules/` is the correct path at the new location. The planner must adjust this one path in the copy.

---

### `src/infrastructure/http/plugins/authenticate.hook.ts` (middleware, request-response)

**Analog:** `src/shared/hooks/authenticate.ts` — exact copy, keep `AppError` import (NOT DomainError).

**Full file content** (lines 1-24):
```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../errors/AppError'

// Augment FastifyJWT to type the JWT payload (user property on request)
// @fastify/jwt maps FastifyJWT.user → FastifyRequest.user
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string
      role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN'
    }
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }
}
```

**Critical path difference:** The copy at `src/infrastructure/http/plugins/authenticate.hook.ts` imports `AppError` from `'../errors/AppError'`. At the new location `src/infrastructure/http/plugins/`, `../errors/` resolves to `src/infrastructure/http/errors/` which does not exist. The correct relative path from the new location back to `src/shared/errors/AppError.ts` is `'../../../shared/errors/AppError'`. The planner must update this one import path in the copy.

---

## Wave 2: New Files

---

### `src/domain/interfaces/refresh-token.repository.interface.ts` (modify — add revokeByHash)

**Current file** (`src/domain/interfaces/refresh-token.repository.interface.ts`, lines 1-13):
```typescript
import { RefreshToken } from '../entities/refresh-token.entity'

export interface IRefreshTokenRepository {
  create(data: {
    tokenHash: string
    familyId: string
    userId: string
    expiresAt: Date
  }): Promise<RefreshToken>
  findByHash(tokenHash: string): Promise<RefreshToken | null>
  revoke(id: string): Promise<void>
  revokeFamily(familyId: string): Promise<void>
}
```

**Required addition** — append `revokeByHash` before the closing brace:
```typescript
  revokeByHash(tokenHash: string): Promise<number>
```

**Why:** `RefreshTokenUseCase` calls `revokeByHash` to atomically detect replay attacks. Prisma `updateMany` returns `{ count: number }` — the repository method exposes this count so the use case can detect `count === 0` (replay) without importing Prisma.

---

### `src/adapters/services/bcrypt.adapter.ts` (utility, transform)

**Port to implement:** `src/application/ports/hash.port.ts`
```typescript
export interface IHashPort {
  hash(plain: string): Promise<string>
  compare(plain: string, hashed: string): Promise<boolean>
}
```

**Source logic analog:** `src/modules/auth/auth.service.ts` (lines 44, 58-61) — bcrypt calls:
```typescript
// hash (line 44):
const passwordHash = await bcrypt.hash(input.password, 12)

// compare (lines 58-60):
const passwordMatch = await bcrypt.compare(
  input.password,
  user?.passwordHash ?? DUMMY_HASH,
)
```

**Implementation pattern:**
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

**Note:** Salt rounds = 12 is enforced by CLAUDE.md. The `compare` here is unconditional — timing-safe DUMMY_HASH logic lives in `LoginUseCase`, not in the adapter.

---

### `src/adapters/services/jwt.adapter.ts` (utility, request-response)

**Port to implement:** `src/application/ports/token.port.ts`
```typescript
export interface ITokenPort {
  signAccess(payload: { id: string; role: string }): string
  generateRefreshToken(): { raw: string; hashed: string }
  verifyAccess(token: string): { id: string; role: string }
}
```

**Source logic analog:** `src/modules/auth/auth.service.ts`

Current call pattern (lines 71-72, 116):
```typescript
// signAccess (lines 71-72):
const accessToken = this.app.jwt.sign(
  { id: userId, role },
  { expiresIn: '15m' },
)

// generateRefreshToken (lines 22-26):
export function generateRefreshToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  return { rawToken, tokenHash }
}
```

**Key difference — ITokenPort vs current code:**

| Aspect | Current `auth.service.ts` | New `ITokenPort` / `JwtAdapter` |
|--------|--------------------------|----------------------------------|
| JWT sign | `this.app.jwt.sign(payload, { expiresIn: '15m' })` where `app` is `FastifyInstance` stored on service | `this.app.jwt.sign(payload, { expiresIn: '15m' })` same call — `app` is `FastifyInstance` passed to constructor |
| Return field name | `rawToken` / `tokenHash` | `raw` / `hashed` |
| Instantiation site | `new AuthService(repo, app)` in route handler | `new JwtAdapter(request.server)` in each controller handler |

**Implementation pattern:**
```typescript
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

**Instantiation in controller:** `new JwtAdapter(request.server)` — `request.server` is the `FastifyInstance` available on every `FastifyRequest`.

---

### `src/adapters/repositories/user.repository.ts` (model, CRUD)

**Interface to implement:** `src/domain/interfaces/user.repository.interface.ts` (lines 1-14):
```typescript
import { User, UserRole } from '../entities/user.entity'

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  create(data: { email: string; passwordHash: string; role: UserRole }): Promise<User>
  updateGoogleId(id: string, googleId: string, avatarUrl?: string): Promise<User>
  findOrCreateGoogle(data: {
    googleId: string
    email: string
    avatarUrl?: string
    role: UserRole
  }): Promise<{ user: User; isNew: boolean }>
}
```

**Source logic analog:** `src/modules/auth/auth.repository.ts` (full file)

**Prisma → Domain mapping pattern** (from `plan-architecture.md` lines 351-378):
```typescript
private toDomain(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    googleId: row.googleId,
    avatarUrl: row.avatarUrl,
    role: row.role,
    createdAt: row.createdAt,
  }
}
```

**Domain entity fields** (`src/domain/entities/user.entity.ts`, all lines):
```typescript
export type UserRole = 'CANDIDATE' | 'RECRUITER' | 'ADMIN'

export interface User {
  id: string
  email: string
  passwordHash: string | null
  googleId: string | null
  avatarUrl: string | null
  role: UserRole
  createdAt: Date
}
```

**findOrCreateGoogle transaction pattern** (source: `src/modules/auth/auth.repository.ts` lines 44-83):
```typescript
// Wrap prisma.$transaction; map each result with toDomain()
async findOrCreateGoogle(data: { ... }): Promise<{ user: User; isNew: boolean }> {
  return prisma.$transaction(async (tx) => {
    const byGoogleId = await tx.user.findUnique({ where: { googleId: data.googleId } })
    if (byGoogleId) return { user: this.toDomain(byGoogleId), isNew: false }

    const existing = await tx.user.findUnique({ where: { email: data.email } })
    if (existing) {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { googleId: data.googleId, avatarUrl: data.avatarUrl ?? existing.avatarUrl },
      })
      return { user: this.toDomain(updated), isNew: false }
    }

    const created = await tx.user.create({
      data: { email: data.email, googleId: data.googleId, avatarUrl: data.avatarUrl, role: data.role as Role },
    })
    return { user: this.toDomain(created), isNew: true }
  })
}
```

**Imports pattern:**
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { IUserRepository } from '../../domain/interfaces/user.repository.interface'
import { User, UserRole } from '../../domain/entities/user.entity'
import { Role } from '@prisma/client'
```

---

### `src/adapters/repositories/refresh-token.repository.ts` (model, CRUD)

**Interface to implement:** `src/domain/interfaces/refresh-token.repository.interface.ts` (after adding `revokeByHash`):
```typescript
import { RefreshToken } from '../entities/refresh-token.entity'

export interface IRefreshTokenRepository {
  create(data: { tokenHash: string; familyId: string; userId: string; expiresAt: Date }): Promise<RefreshToken>
  findByHash(tokenHash: string): Promise<RefreshToken | null>
  revoke(id: string): Promise<void>
  revokeFamily(familyId: string): Promise<void>
  revokeByHash(tokenHash: string): Promise<number>   // <-- new in Phase 10
}
```

**Domain entity fields** (`src/domain/entities/refresh-token.entity.ts`, all lines):
```typescript
export interface RefreshToken {
  id: string
  tokenHash: string
  familyId: string
  userId: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}
```

**Source logic analog:** `src/modules/auth/auth.repository.ts` methods `createRefreshToken`, `findRefreshTokenByHash`, `revokeRefreshToken`, `revokeRefreshTokenFamily`.

**Prisma → Domain mapping pattern for RefreshToken:**
```typescript
private toDomain(row: any): RefreshToken {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    userId: row.userId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }
}
```

**revokeByHash implementation pattern** (derived from `auth.service.ts` refresh transaction, lines 88-92):
```typescript
async revokeByHash(tokenHash: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count
}
```

**revokeFamily implementation** (source: `auth.repository.ts` line 34):
```typescript
async revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
```

**Imports pattern:**
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { IRefreshTokenRepository } from '../../domain/interfaces/refresh-token.repository.interface'
import { RefreshToken } from '../../domain/entities/refresh-token.entity'
```

---

### `src/application/use-cases/auth/register.use-case.ts` (service, request-response)

**Source logic:** `src/modules/auth/auth.service.ts` — `register()` method (lines 38-52) + `generateTokenPair()` (lines 70-82).

**Differences from source:**
- Replaces `AppError` with `DomainError` (constructor argument order differs: `DomainError(message, code, statusCode)`)
- Replaces direct `bcrypt.hash` with `this.hash.hash()`
- Replaces `this.app.jwt.sign()` with `this.token.signAccess()`
- Replaces `generateRefreshToken()` module function with `this.token.generateRefreshToken()`
- Returns field names change: source uses `rawToken`/`tokenHash`; `ITokenPort` uses `raw`/`hashed`

**AppError vs DomainError constructor:**
```typescript
// OLD (auth.service.ts line 41):
throw new AppError('Email already in use', 409, 'CONFLICT')
//                  message               statusCode  code

// NEW (DomainError — src/application/errors/domain.error.ts):
throw new DomainError('Email already in use', 'CONFLICT', 409)
//                     message                 code        statusCode
```

**Core implementation pattern** (from `10-RESEARCH.md` code examples, verified against `auth.service.ts`):
```typescript
import { randomBytes } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../ports/hash.port'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly hash: IHashPort,
    private readonly token: ITokenPort,
  ) {}

  async execute(input: { email: string; password: string; role: 'CANDIDATE' | 'RECRUITER' }): Promise<{ accessToken: string; refreshToken: string }> {
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

---

### `src/application/use-cases/auth/login.use-case.ts` (service, request-response)

**Source logic:** `src/modules/auth/auth.service.ts` — `login()` method (lines 54-68).

**DUMMY_HASH constant** (from `auth.service.ts` line 20 — copy verbatim):
```typescript
// Generated via: bcryptjs.hashSync('__dummy__', 12)
const DUMMY_HASH = '$2b$12$LVfxFJGoT4lbSwHhLU8kCOy8xQpBLaIH5TNXLilzj5Wky3l2KBKP2'
```

**Timing-safe pattern** (source: `auth.service.ts` lines 57-63):
```typescript
// Always run compare even when user not found (timing oracle prevention)
const passwordMatch = await this.hash.compare(
  input.password,
  user?.passwordHash ?? DUMMY_HASH,
)
if (!user || !passwordMatch) {
  throw new DomainError('Invalid credentials', 'INVALID_CREDENTIALS', 401)
}
```

**Note:** `this.hash.compare()` replaces `bcrypt.compare()`. The DUMMY_HASH ensures bcrypt always runs a full comparison. The use case imports `IHashPort` not `bcryptjs` directly.

---

### `src/application/use-cases/auth/refresh-token.use-case.ts` (service, request-response)

**Source logic:** `src/modules/auth/auth.service.ts` — `refresh()` method (lines 84-118).

**Critical difference — transaction removal:** The source uses `prisma.$transaction(...)`. The use case cannot import Prisma. The transaction is replaced by:
1. `revokeByHash(tokenHash)` — Prisma `updateMany` is atomic (single SQL UPDATE); returns count
2. `findByHash(tokenHash)` — read for metadata after the atomic revoke
3. Replay check: `count === 0` means the token was already revoked → revokeFamily + throw

**Replay attack pattern** (from `10-RESEARCH.md` Q1):
```typescript
import { createHash } from 'crypto'
// ...
const tokenHash = createHash('sha256').update(rawToken).digest('hex')

const count = await this.refreshTokenRepo.revokeByHash(tokenHash)   // atomic
const stored = await this.refreshTokenRepo.findByHash(tokenHash)     // metadata

if (!stored) throw new DomainError('Invalid token', 'UNAUTHORIZED', 401)
if (count === 0) {
  await this.refreshTokenRepo.revokeFamily(stored.familyId)
  throw new DomainError('Token revoked', 'TOKEN_EXPIRED', 401)
}
if (stored.expiresAt < new Date()) throw new DomainError('Token expired', 'TOKEN_EXPIRED', 401)
```

**Injects:** `IUserRepository`, `IRefreshTokenRepository`, `ITokenPort` (no `IHashPort` needed).

---

### `src/application/use-cases/auth/logout.use-case.ts` (service, request-response)

**Source logic:** `src/modules/auth/auth.service.ts` — `logout()` method (lines 121-132).

**Core pattern** (source lines 121-132):
```typescript
async logout(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken)    // → createHash('sha256').update(rawToken).digest('hex')
  const stored = await this.repo.findRefreshTokenByHash(tokenHash)

  if (!stored || stored.revokedAt !== null) {
    // Idempotent — no error thrown
    return
  }

  // Revoke entire family — invalidates all active sessions
  await this.repo.revokeRefreshTokenFamily(stored.familyId)
}
```

**Translated to use case:** `this.refreshTokenRepo.findByHash(tokenHash)` + `this.refreshTokenRepo.revokeFamily(stored.familyId)`.

**Injects:** `IRefreshTokenRepository` only.

---

### `src/application/use-cases/auth/login-with-google.use-case.ts` (service, request-response)

**Source logic:** `src/modules/auth/auth.service.ts` — `loginWithGoogle()` method (lines 134-167).

**Google OAuth2 pattern** (source lines 141-155 — kept in use case for Phase 10):
```typescript
// OAuth2Client stays in use case (no IGoogleAuthPort port yet — deferred to future phase)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

try {
  const ticket = await googleClient.verifyIdToken({
    idToken: input.idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  })
  const payload = ticket.getPayload()!
  googlePayload = { sub: payload.sub, email: payload.email!, name: payload.name, picture: payload.picture }
} catch {
  throw new DomainError('Invalid Google token', 'INVALID_CREDENTIALS', 401)
}
```

**findOrCreateGoogle call** (source lines 157-163):
```typescript
const { user } = await this.userRepo.findOrCreateGoogle({
  googleId: googlePayload.sub,
  email: googlePayload.email,
  avatarUrl: googlePayload.picture,
  role: input.role,
})
```

**Note:** Source also passes `name` to `findOrCreateGoogleUser`, but `IUserRepository.findOrCreateGoogle` does not include `name`. Drop `name` from the call — it is not stored in the User entity.

**Injects:** `IUserRepository`, `IRefreshTokenRepository`, `ITokenPort` + `OAuth2Client` (module-level singleton, not injected).

---

### `src/adapters/controllers/auth.controller.ts` (controller, request-response)

**Source analog:** `src/modules/auth/auth.routes.ts` — the inline handler bodies provide the logic to extract.

**Zod schemas** (source: `auth.routes.ts` lines 6-24 — copy verbatim):
```typescript
const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

const GoogleBodySchema = z.object({
  idToken: z.string().min(1),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})
```

**Handler pattern** (from `plan-architecture.md` lines 301-315):
```typescript
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
  // login, refresh, logout, loginWithGoogle follow the same pattern
}
```

**HTTP status codes per endpoint** (source: `auth.routes.ts`):
- `register` → 201
- `login` → 200
- `refresh` → 200
- `logout` → 204 (no body)
- `google` → 201

**Imports pattern:**
```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { RegisterUseCase } from '../../application/use-cases/auth/register.use-case'
import { LoginUseCase } from '../../application/use-cases/auth/login.use-case'
import { RefreshTokenUseCase } from '../../application/use-cases/auth/refresh-token.use-case'
import { LogoutUseCase } from '../../application/use-cases/auth/logout.use-case'
import { LoginWithGoogleUseCase } from '../../application/use-cases/auth/login-with-google.use-case'
import { UserRepository } from '../repositories/user.repository'
import { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import { BcryptAdapter } from '../services/bcrypt.adapter'
import { JwtAdapter } from '../services/jwt.adapter'
import { DomainError } from '../../application/errors/domain.error'
```

---

### `src/infrastructure/http/routes/auth.routes.ts` (route, request-response)

**Source analog:** `src/modules/auth/auth.routes.ts` — rate limit config values and path names are identical; the route function delegate to `AuthController` instead of inline service calls.

**Pattern** (from `plan-architecture.md` lines 425-444 — canonical):
```typescript
import { FastifyInstance } from 'fastify'
import { AuthController } from '../../../adapters/controllers/auth.controller'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new AuthController()

  app.post('/register', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, ctrl.register.bind(ctrl))
  app.post('/login',    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, ctrl.login.bind(ctrl))
  app.post('/refresh',  { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, ctrl.refresh.bind(ctrl))
  app.post('/logout',   ctrl.logout.bind(ctrl))
  app.post('/google',   { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, ctrl.loginWithGoogle.bind(ctrl))
}
```

**No Zod, no business logic, no service instantiation in this file.** The export function name `authRoutes` must match what `src/app.ts` imports.

---

## Wave 3: Modified Existing Files

---

### `src/shared/errors/errorHandler.ts` (modify — add DomainError branch)

**Current file** (lines 1-57) — full content already read above.

**DomainError class** (`src/application/errors/domain.error.ts`, lines 1-11):
```typescript
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'DomainError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
```

**Wire format comparison:**

| Error class | Response shape | Status |
|-------------|---------------|--------|
| `AppError` | `{ error: string, code: string }` | `error.statusCode` |
| `DomainError` | `{ error: string, code: string }` | `error.statusCode` |

Same shape — tests asserting `{ code: 'INVALID_CREDENTIALS' }` pass unchanged.

**Modification — add import and branch:**

Add import at line 4 (after AppError import):
```typescript
import { DomainError } from '../../application/errors/domain.error'
```

Note: `errorHandler.ts` is at `src/shared/errors/errorHandler.ts`. Relative path to `src/application/errors/domain.error.ts` is `../../application/errors/domain.error`.

Add branch immediately before the `AppError` check (current line 12), making it the FIRST check:
```typescript
// DomainError — clean architecture use case errors
if (error instanceof DomainError) {
  reply.status(error.statusCode).send({ error: error.message, code: error.code })
  return
}
```

**Placement matters:** DomainError check must come before the `statusCode in error` fallback check (current line 43), which would otherwise swallow DomainErrors since they have a `statusCode` property.

---

### `src/app.ts` (modify — swap auth import)

**Current import line 10:**
```typescript
import { authRoutes } from './modules/auth/auth.routes'
```

**Replace with:**
```typescript
import { authRoutes } from './infrastructure/http/routes/auth.routes'
```

**All other imports unchanged.** The `authRoutes` function signature is identical: `async function authRoutes(app: FastifyInstance): Promise<void>`. The registered usage at line 53 remains unchanged:
```typescript
await app.register(authRoutes, { prefix: '/auth' })
```

**Optional (Wave 3, low priority):** Plugin imports can be updated to `./infrastructure/http/plugins/*` variants — these are safe cosmetic changes since the plugins have no logic. Do only after all infrastructure files exist.

---

## Shared Patterns

### DomainError — Throw Pattern
**Source:** `src/application/errors/domain.error.ts`
**Apply to:** All auth use cases
```typescript
// Constructor order: message, code, statusCode
throw new DomainError('Email already in use', 'CONFLICT', 409)
throw new DomainError('Invalid credentials', 'INVALID_CREDENTIALS', 401)
throw new DomainError('Invalid token', 'UNAUTHORIZED', 401)
throw new DomainError('Token revoked', 'TOKEN_EXPIRED', 401)
throw new DomainError('Token expired', 'TOKEN_EXPIRED', 401)
```

**Critical:** Argument order is `(message, code, statusCode)` — opposite of `AppError(message, statusCode, code)`.

### DomainError — Catch and Map Pattern
**Source:** `plan-architecture.md` (controller example) + `10-RESEARCH.md`
**Apply to:** `auth.controller.ts` — every handler method
```typescript
try {
  const result = await useCase.execute(body)
  reply.status(XYZ).send(result)
} catch (err) {
  if (err instanceof DomainError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code })
    return
  }
  throw err
}
```

### Prisma → Domain Mapping (toDomain)
**Source:** `plan-architecture.md` lines 366-377, verified against entity shapes
**Apply to:** `user.repository.ts`, `refresh-token.repository.ts`
```typescript
// Pattern: private toDomain(row: any): DomainEntity
// Map every field explicitly — do not spread Prisma model
private toDomain(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,   // string | null
    googleId: row.googleId,           // string | null
    avatarUrl: row.avatarUrl,         // string | null
    role: row.role,
    createdAt: row.createdAt,
  }
}
```

### Constructor Injection Pattern
**Source:** `src/modules/auth/auth.service.ts` lines 32-36
**Apply to:** All use-case classes
```typescript
// Declare dependencies as readonly private fields
constructor(
  private readonly userRepo: IUserRepository,
  private readonly refreshTokenRepo: IRefreshTokenRepository,
  private readonly hash: IHashPort,
  private readonly token: ITokenPort,
) {}
```

### Refresh Token Creation Pattern
**Source:** `src/modules/auth/auth.service.ts` lines 76-81
**Apply to:** `register.use-case.ts`, `login.use-case.ts`, `refresh-token.use-case.ts`, `login-with-google.use-case.ts`
```typescript
const { raw, hashed } = this.token.generateRefreshToken()
const familyId = randomBytes(16).toString('hex')        // crypto built-in
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)   // 7 days
await this.refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })
return { accessToken, refreshToken: raw }
```

### Token Hash Pattern
**Source:** `src/modules/auth/auth.service.ts` lines 28-30
**Apply to:** `refresh-token.use-case.ts`, `logout.use-case.ts`
```typescript
import { createHash } from 'crypto'
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
```

### Fastify Plugin Registration Pattern
**Source:** All `src/shared/plugins/*.ts` files
**Apply to:** All files in `src/infrastructure/http/plugins/`
```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

export default fp(async function pluginName(app: FastifyInstance) {
  // plugin registration
})
// OR named export:
export const pluginName = fp(plugin)
```

---

## No Analog Found

None — every file in Phase 10 has a direct source or close analog in the existing codebase.

---

## Key Differences Highlighted

### 1. ITokenPort.signAccess vs current app.jwt.sign

| | Current `auth.service.ts` | `JwtAdapter` implementing `ITokenPort` |
|-|--------------------------|----------------------------------------|
| Call | `this.app.jwt.sign({ id, role }, { expiresIn: '15m' })` | `this.app.jwt.sign(payload, { expiresIn: '15m' })` |
| `app` comes from | Stored on service constructor | Passed to `JwtAdapter` constructor per-request as `request.server` |
| `expiresIn` | Hardcoded at call site | Still hardcoded in `signAccess` — enforces the 15m rule in one place |
| Return field | `accessToken` | `string` (caller names it `accessToken`) |

### 2. DomainError vs AppError

| | `AppError` (old) | `DomainError` (new) |
|-|-----------------|---------------------|
| Import | `src/shared/errors/AppError` | `src/application/errors/domain.error` |
| Constructor | `new AppError(message, statusCode, code)` | `new DomainError(message, code, statusCode)` |
| Properties | `.statusCode`, `.code`, `.message` | `.statusCode`, `.code`, `.message` |
| Wire format | `{ error, code }` + status | `{ error, code }` + status — identical |
| Used in | `auth.service.ts`, `auth.routes.ts`, hooks | Auth use cases, authenticate hook stays with AppError |

### 3. revokeByHash extension to IRefreshTokenRepository

The Phase 9 interface `IRefreshTokenRepository` has `revoke(id)` and `revokeFamily(familyId)` but no `revokeByHash`. The auth service's replay detection uses `prisma.$transaction` with `updateMany` to atomically detect replays. To preserve this atomicity without Prisma in use cases, `revokeByHash(tokenHash): Promise<number>` is added to the interface. The implementation calls `prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })` and returns `result.count`. The use case checks `count === 0` to detect replay.

### 4. errorHandler.ts DomainError vs AppError branch

Current `errorHandler.ts` checks `instanceof AppError` first (line 12). DomainError inherits from `Error`, not `AppError`, so it falls through to the `statusCode in error` check (line 43). Since `DomainError` has a `statusCode` property, it would be caught there — but as an `instanceof Error` (not plain object), it would send `{ error: error.message }` without the `code` field, breaking all auth error assertions. The fix adds `instanceof DomainError` as the **first** branch before `instanceof AppError`.

---

## Metadata

**Analog search scope:** `src/modules/auth/`, `src/shared/`, `src/domain/`, `src/application/`, `src/app.ts`, `plan-architecture.md`
**Files read:** 22
**Pattern extraction date:** 2026-05-07
