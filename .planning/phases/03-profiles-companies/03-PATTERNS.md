# Phase 3: Profiles & Companies - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/modules/candidate/candidate.routes.ts` | route | request-response | `src/modules/auth/auth.routes.ts` | role-match |
| `src/modules/candidate/candidate.service.ts` | service | CRUD | `src/modules/auth/auth.service.ts` | role-match |
| `src/modules/candidate/candidate.repository.ts` | repository | CRUD | `src/modules/auth/auth.repository.ts` | role-match |
| `src/modules/company/company.routes.ts` | route | request-response | `src/modules/auth/auth.routes.ts` | role-match |
| `src/modules/company/company.service.ts` | service | CRUD | `src/modules/auth/auth.service.ts` | role-match |
| `src/modules/company/company.repository.ts` | repository | CRUD | `src/modules/auth/auth.repository.ts` | role-match |
| `src/modules/recruiter/recruiter.routes.ts` | route | request-response | `src/modules/auth/auth.routes.ts` | role-match |
| `src/modules/recruiter/recruiter.service.ts` | service | CRUD | `src/modules/auth/auth.service.ts` | role-match |
| `src/modules/recruiter/recruiter.repository.ts` | repository | CRUD | `src/modules/auth/auth.repository.ts` | role-match |
| `src/modules/admin/admin.routes.ts` | route | request-response | `src/modules/auth/auth.routes.ts` | role-match |
| `src/modules/admin/admin.service.ts` | service | CRUD | `src/modules/auth/auth.service.ts` | role-match |
| `src/app.ts` | config | request-response | `src/app.ts` | exact |
| `tests/unit/candidate.service.test.ts` | test | — | `tests/unit/auth.service.test.ts` | exact |
| `tests/integration/candidate.test.ts` | test | — | `tests/integration/auth.test.ts` | exact |
| `tests/integration/company.test.ts` | test | — | `tests/integration/auth.test.ts` | exact |
| `tests/integration/recruiter.test.ts` | test | — | `tests/integration/auth.test.ts` | exact |
| `tests/integration/admin.test.ts` | test | — | `tests/integration/auth.test.ts` | exact |

---

## Pattern Assignments

### `src/modules/candidate/candidate.routes.ts` (route, request-response)

**Analog:** `src/modules/auth/auth.routes.ts`

**Imports pattern** (lines 1-5):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CandidateRepository } from './candidate.repository'
import { CandidateService } from './candidate.service'
```

**Route registration pattern with role guard** (lines 26-28 of auth.routes.ts adapted):
```typescript
export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CandidateRepository()
  const service = new CandidateService(repo)
  // preHandler: [authenticate, requireRole('CANDIDATE')] on every handler
}
```

**Auth preHandler import** — must import from shared hooks:
```typescript
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
```

**Core PATCH/PUT handler pattern** (based on auth.routes.ts lines 31-36):
```typescript
app.put('/me', {
  preHandler: [authenticate, requireRole('CANDIDATE')],
}, async (request, reply) => {
  const body = CandidateProfileSchema.parse(request.body)
  const profile = await service.upsertProfile(request.user.id, body)
  return reply.status(200).send(profile)
})
```

**GET /me handler pattern**:
```typescript
app.get('/me', {
  preHandler: [authenticate, requireRole('CANDIDATE')],
}, async (request, reply) => {
  const profile = await service.getProfile(request.user.id)
  return reply.status(200).send(profile)
})
```

**No try/catch in route** — errors bubble to global `errorHandler`. Routes parse body, call service, send reply. Nothing else (RESEARCH.md Architecture section).

---

### `src/modules/candidate/candidate.service.ts` (service, CRUD)

**Analog:** `src/modules/auth/auth.service.ts`

**Imports pattern** (auth.service.ts lines 4-8, simplified — no app or bcrypt needed):
```typescript
import { CandidateRepository } from './candidate.repository'
import { AppError } from '../../shared/errors/AppError'
```

**Simpler constructor — no `app` injection** (RESEARCH.md Pattern 5):
```typescript
export class CandidateService {
  constructor(private readonly repo: CandidateRepository) {}
  // No FastifyInstance needed — no JWT signing in profile services
}
```

**Service method throwing AppError** (auth.service.ts lines 39-42 pattern):
```typescript
async upsertProfile(userId: string, data: CandidateProfileData) {
  // userId always comes from request.user.id — never from body (IDOR prevention)
  return this.repo.upsertProfile(userId, data)
}

async getProfile(userId: string) {
  const profile = await this.repo.findProfileByUserId(userId)
  if (!profile) throw new AppError('Profile not found', 404, 'NOT_FOUND')
  return profile
}
```

**AppError throw signature** (AppError.ts):
```typescript
throw new AppError('message', statusCode, 'CODE_STRING')
// e.g.: throw new AppError('Profile not found', 404, 'NOT_FOUND')
```

---

### `src/modules/candidate/candidate.repository.ts` (repository, CRUD)

**Analog:** `src/modules/auth/auth.repository.ts`

**Imports pattern** (auth.repository.ts lines 1-2):
```typescript
import { prisma } from '../../shared/db/prisma'
import { Prisma } from '@prisma/client'
```

**Prisma upsert for 1:1 profile** (RESEARCH.md Pattern 2 — verified Prisma docs):
```typescript
export class CandidateRepository {
  async upsertProfile(userId: string, data: CandidateProfileData) {
    return prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
  }

  async findProfileByUserId(userId: string) {
    return prisma.candidateProfile.findUnique({ where: { userId } })
  }
}
```

**Prisma method calls pattern** (auth.repository.ts lines 6-11):
```typescript
// All queries use named Prisma client methods — no $queryRaw with user input (SEC-01)
return prisma.candidateProfile.findUnique({ where: { userId } })
return prisma.candidateProfile.upsert({ where, create, update })
```

---

### `src/modules/company/company.routes.ts` (route, request-response)

**Analog:** `src/modules/auth/auth.routes.ts`

**Imports and registration pattern** (auth.routes.ts lines 1-5):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { CompanyRepository } from './company.repository'
import { CompanyService } from './company.service'
```

**Admin-only POST route** (RESEARCH.md Pattern 4):
```typescript
export async function companyRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CompanyRepository()
  const service = new CompanyService(repo)

  app.post('/', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const body = CreateCompanySchema.parse(request.body)
    const company = await service.createCompany(body)
    return reply.status(201).send(company)
  })

  app.get('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const company = await service.getCompany(id)
    return reply.status(200).send(company)
  })
}
```

**Zod schemas** (auth.routes.ts lines 6-15 as pattern for inline schema declarations):
```typescript
const CreateCompanySchema = z.object({
  name: z.string().min(1).max(150),
  logoUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
})
```

---

### `src/modules/company/company.service.ts` (service, CRUD)

**Analog:** `src/modules/auth/auth.service.ts`

**Constructor without app** (RESEARCH.md Pattern 5):
```typescript
export class CompanyService {
  constructor(private readonly repo: CompanyRepository) {}
}
```

**AppError for not found** (auth.service.ts lines 94-95 pattern):
```typescript
async getCompany(id: string) {
  const company = await this.repo.findById(id)
  if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
  return company
}
```

**Atomic credit adjustment with negative-balance guard** (RESEARCH.md Pattern 3 + Pitfall 3):
```typescript
async adjustCredits(companyId: string, delta: number) {
  const company = await this.repo.findById(companyId)
  if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
  if (company.credits + delta < 0) throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS')
  return this.repo.adjustCredits(companyId, delta)
}
```

---

### `src/modules/company/company.repository.ts` (repository, CRUD)

**Analog:** `src/modules/auth/auth.repository.ts`

**Standard Prisma method pattern** (auth.repository.ts lines 1-11):
```typescript
import { prisma } from '../../shared/db/prisma'

export class CompanyRepository {
  async create(data: { name: string; logoUrl?: string; description?: string }) {
    return prisma.company.create({ data })
  }

  async findById(id: string) {
    return prisma.company.findUnique({ where: { id } })
  }

  // Atomic increment — never read-then-write (SEC-03, RESEARCH.md Pattern 3)
  async adjustCredits(companyId: string, delta: number) {
    return prisma.company.update({
      where: { id: companyId },
      data: { credits: { increment: delta } },
    })
  }
}
```

---

### `src/modules/recruiter/recruiter.routes.ts` (route, request-response)

**Analog:** `src/modules/auth/auth.routes.ts`

**Route with RECRUITER role guard** (same structure as candidate.routes.ts):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { RecruiterRepository } from './recruiter.repository'
import { RecruiterService } from './recruiter.service'

export async function recruiterRoutes(app: FastifyInstance): Promise<void> {
  const repo = new RecruiterRepository()
  const service = new RecruiterService(repo)

  app.put('/me', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const body = RecruiterProfileSchema.parse(request.body)
    const profile = await service.upsertProfile(request.user.id, body)
    return reply.status(200).send(profile)
  })
}
```

**Zod schema for recruiter** (auth.routes.ts lines 6-10 pattern):
```typescript
const RecruiterProfileSchema = z.object({
  companyId: z.string().uuid(),
})
```

---

### `src/modules/recruiter/recruiter.service.ts` (service, CRUD)

**Analog:** `src/modules/auth/auth.service.ts`

**Company FK validation before upsert** (RESEARCH.md Pattern 6):
```typescript
export class RecruiterService {
  constructor(private readonly repo: RecruiterRepository) {}

  async upsertProfile(userId: string, data: { companyId: string }) {
    const company = await this.repo.findCompanyById(data.companyId)
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    return this.repo.upsertProfile(userId, data)
  }
}
```

**AppError throw signature** (identical to all other services):
```typescript
throw new AppError('Company not found', 404, 'NOT_FOUND')
```

---

### `src/modules/recruiter/recruiter.repository.ts` (repository, CRUD)

**Analog:** `src/modules/auth/auth.repository.ts`

**Upsert on unique userId + cross-model read** (auth.repository.ts lines 1-11 pattern):
```typescript
import { prisma } from '../../shared/db/prisma'

export class RecruiterRepository {
  async upsertProfile(userId: string, data: { companyId: string }) {
    return prisma.recruiterProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
  }

  async findProfileByUserId(userId: string) {
    return prisma.recruiterProfile.findUnique({ where: { userId } })
  }

  // Cross-model read to validate FK — acceptable within same repository
  // (module isolation rule: do NOT import CompanyRepository; use prisma directly here)
  async findCompanyById(id: string) {
    return prisma.company.findUnique({ where: { id } })
  }
}
```

**Module isolation note:** `recruiter.repository.ts` reads `prisma.company` directly to validate the FK. This is the correct approach — it must NOT import `CompanyRepository` (CLAUDE.md: "módulos não importam diretamente de outros módulos"). A direct Prisma read for FK validation is acceptable at the repository tier.

---

### `src/modules/admin/admin.routes.ts` (route, request-response)

**Analog:** `src/modules/auth/auth.routes.ts`

**All routes use ADMIN role guard** (RESEARCH.md Pattern 4 + ADMIN-03):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { AdminService } from './admin.service'

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const service = new AdminService()

  // Every admin route: preHandler: [authenticate, requireRole('ADMIN')]

  app.get('/users', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const page = Number((request.query as any).page ?? 1)
    const limit = Number((request.query as any).limit ?? 20)
    const users = await service.listUsers(page, limit)
    return reply.status(200).send(users)
  })

  app.get('/users/:id', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await service.getUserById(id)
    return reply.status(200).send(user)
  })

  app.patch('/companies/:id/credits', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = AdjustCreditsSchema.parse(request.body)
    const company = await service.adjustCredits(id, body.amount)
    return reply.status(200).send(company)
  })
}

const AdjustCreditsSchema = z.object({
  amount: z.number().int().positive(),
})
```

---

### `src/modules/admin/admin.service.ts` (service, CRUD)

**Analog:** `src/modules/auth/auth.service.ts`

**Service using prisma directly (thin admin module — no dedicated repository)**:
```typescript
import { prisma } from '../../shared/db/prisma'
import { AppError } from '../../shared/errors/AppError'

export class AdminService {
  async listUsers(page: number, limit: number) {
    return prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        // passwordHash: excluded — never expose (RESEARCH.md Pitfall 6)
        // googleId: excluded — sensitive
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true },
    })
    if (!user) throw new AppError('User not found', 404, 'NOT_FOUND')
    return user
  }

  async adjustCredits(companyId: string, amount: number) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    return prisma.company.update({
      where: { id: companyId },
      data: { credits: { increment: amount } },
    })
  }
}
```

**Note:** Admin module is thin and accesses `prisma` directly in the service (no separate repository class). This avoids an unnecessary indirection layer for a pure admin read/write surface. The `prisma` singleton import is from `../../shared/db/prisma`.

---

### `src/app.ts` (config, request-response)

**Analog:** `src/app.ts` (self — modification only)

**Route registration pattern to add** (app.ts lines 29-30):
```typescript
// Add after existing authRoutes registration:
await app.register(candidateRoutes, { prefix: '/candidates' })
await app.register(companyRoutes, { prefix: '/companies' })
await app.register(recruiterRoutes, { prefix: '/recruiters' })
await app.register(adminRoutes, { prefix: '/admin' })
```

**Import additions to top of file** (app.ts lines 7-8 pattern):
```typescript
import { candidateRoutes } from './modules/candidate/candidate.routes'
import { companyRoutes } from './modules/company/company.routes'
import { recruiterRoutes } from './modules/recruiter/recruiter.routes'
import { adminRoutes } from './modules/admin/admin.routes'
```

---

### Unit test files (role: test)

**Analog:** `tests/unit/auth.service.test.ts`

**Test file structure** (auth.service.test.ts lines 1-36):
```typescript
import { CandidateService } from '../../src/modules/candidate/candidate.service'
import { CandidateRepository } from '../../src/modules/candidate/candidate.repository'
import { AppError } from '../../src/shared/errors/AppError'

// Mock the repository — no DB in unit tests (CLAUDE.md TDD rules)
const makeRepo = (): jest.Mocked<CandidateRepository> => ({
  upsertProfile: jest.fn(),
  findProfileByUserId: jest.fn(),
} as unknown as jest.Mocked<CandidateRepository>)

describe('CandidateService', () => {
  let repo: jest.Mocked<CandidateRepository>
  let service: CandidateService

  beforeEach(() => {
    repo = makeRepo()
    service = new CandidateService(repo)
    jest.clearAllMocks()
  })
  // ...
})
```

**AppError assertion pattern** (auth.service.test.ts lines 64-74):
```typescript
await expect(
  service.getProfile('nonexistent-id')
).rejects.toThrow(AppError)

await expect(
  service.getProfile('nonexistent-id')
).rejects.toMatchObject({ statusCode: 404 })
```

---

### Integration test files (role: test)

**Analog:** `tests/integration/auth.test.ts`

**Test file imports and app lifecycle** (auth.test.ts lines 1-6):
```typescript
import '../helpers/setup'    // Registers beforeAll/afterAll/afterEach DB lifecycle
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCandidate, createCompany } from '../helpers/factories'
```

**Per-test app creation pattern** (auth.test.ts lines 13-27):
```typescript
it('200 upserts candidate profile', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()

  // ... supertest calls ...

  await app.close()
})
```

**Authenticated request pattern** (for routes requiring JWT — not present in auth tests for public routes, but needed for Phase 3 protected routes):
```typescript
// 1. Register or create user and get token via /auth/login
const loginRes = await supertest(app.server)
  .post('/auth/login')
  .send({ email: 'test@example.com', password: 'password123' })
const { accessToken } = loginRes.body

// 2. Use Bearer token on protected route
const response = await supertest(app.server)
  .put('/candidates/me')
  .set('Authorization', `Bearer ${accessToken}`)
  .send({ ... })
```

**403 role check pattern** (auth.test.ts lines 29-38):
```typescript
it('403 for wrong role', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()

  // Login as RECRUITER, hit CANDIDATE-only route
  // ...
  expect(response.status).toBe(403)
  await app.close()
})
```

**Factory usage** — `createCandidate`, `createCompany` factories already exist in `tests/helpers/factories.ts` (verified). Use these directly in integration tests to seed prerequisite data.

---

## Shared Patterns

### Authentication + Role Guard
**Source:** `src/shared/hooks/authenticate.ts` + `src/shared/hooks/requireRole.ts`
**Apply to:** All route handlers in candidate, company, recruiter, admin modules

```typescript
// authenticate.ts — populates request.user from JWT
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }
}

// requireRole.ts — must follow authenticate in preHandler array
export function requireRole(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new AppError('authenticate hook missing before requireRole', 500, 'INTERNAL')
    }
    if (!roles.includes(request.user.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}

// Usage — ALWAYS pair authenticate before requireRole:
preHandler: [authenticate, requireRole('CANDIDATE')]
preHandler: [authenticate, requireRole('RECRUITER')]
preHandler: [authenticate, requireRole('ADMIN')]
```

### Error Handling
**Source:** `src/shared/errors/errorHandler.ts` (global) + `src/shared/errors/AppError.ts`
**Apply to:** All service and repository files — routes do NOT try/catch

```typescript
// AppError constructor signature:
new AppError(message: string, statusCode: number, code?: string)

// Global errorHandler catches:
// - AppError → reply.status(statusCode).send({ error, code })
// - ZodError → reply.status(400).send({ error: 'Validation error', details: [...] })
// - Prisma P2002 → reply.status(409).send({ error: 'Resource already exists' })
// - Prisma P2025 → reply.status(404).send({ error: 'Resource not found' })
```

### Zod Validation
**Source:** `src/modules/auth/auth.routes.ts` lines 6-24 (inline schema declarations)
**Apply to:** All route handlers — `Schema.parse(request.body)` before service call

```typescript
// Schemas declared at module top, outside the route registration function
const SomeSchema = z.object({ ... })

// In handler:
const body = SomeSchema.parse(request.body)  // Throws ZodError on invalid input
```

### Prisma Singleton Import
**Source:** `src/shared/db/prisma.ts`
**Apply to:** All repository files (and admin.service.ts which uses prisma directly)

```typescript
import { prisma } from '../../shared/db/prisma'
// prisma is a global singleton — do NOT instantiate new PrismaClient()
```

### Route-to-Service-to-Repository Layer Pattern
**Source:** `src/modules/auth/auth.routes.ts` lines 26-28
**Apply to:** All new module route files

```typescript
export async function xyzRoutes(app: FastifyInstance): Promise<void> {
  const repo = new XyzRepository()
  const service = new XyzService(repo)
  // Service and repo instantiated per-plugin registration, not globally
}
```

### IDOR Prevention — userId from JWT
**Source:** `src/shared/hooks/authenticate.ts` — populates `request.user.id`
**Apply to:** All profile upsert/read routes (candidate, recruiter)

```typescript
// ALWAYS derive userId from the verified JWT payload, never from request body
const profile = await service.upsertProfile(request.user.id, body)
// NEVER: service.upsertProfile(body.userId, body) — IDOR vulnerability
```

---

## No Analog Found

All files have close analogs in the existing codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `src/modules/auth/`, `src/shared/hooks/`, `src/shared/errors/`, `src/shared/db/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`
**Files scanned:** 14 source files read in full
**Pattern extraction date:** 2026-04-18
