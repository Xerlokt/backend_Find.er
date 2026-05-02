# Phase 7: Credits - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 14 (7 new + 7 modified)
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `prisma/schema.prisma` | config | CRUD | `prisma/schema.prisma` (Swipe model) | exact |
| `src/modules/credits/credits.constants.ts` | utility | — | n/a — trivial constant file | no analog needed |
| `src/modules/credits/credits.repository.ts` | repository | CRUD | `src/modules/company/company.repository.ts` + `src/modules/swipe/swipe.repository.ts` | role-match |
| `src/modules/credits/credits.service.ts` | service | CRUD | `src/modules/company/company.service.ts` | exact |
| `src/modules/credits/credits.routes.ts` | route | request-response | `src/modules/swipe/swipe.routes.ts` | exact |
| `tests/unit/credit.service.test.ts` | test | — | `tests/unit/swipe.service.test.ts` | exact |
| `tests/integration/credits.test.ts` | test | — | `tests/integration/swipe.test.ts` + `tests/integration/admin.test.ts` | exact |
| `src/app.ts` (modify) | config | — | `src/app.ts` (existing registrations) | exact |
| `src/modules/admin/admin.service.ts` (modify) | service | CRUD | `src/modules/company/company.service.ts` | role-match |
| `src/modules/admin/admin.routes.ts` (modify) | route | request-response | `src/modules/admin/admin.routes.ts` (self) | exact |
| `src/modules/swipe/swipe.repository.ts` (modify) | repository | CRUD | `src/modules/swipe/swipe.repository.ts` (self) | exact |
| `src/modules/swipe/swipe.service.ts` (modify) | service | CRUD | `src/modules/swipe/swipe.service.ts` (self) | exact |
| `tests/helpers/factories.ts` (modify) | test helper | — | `tests/helpers/factories.ts` (createSwipe) | exact |
| `tests/helpers/setup.ts` (modify) | test helper | — | `tests/helpers/setup.ts` (self) | exact |

---

## Pattern Assignments

### `prisma/schema.prisma` (add Unlock model)

**Analog:** existing `Swipe` model (lines 131–141) — same composite `@@unique` pattern.

**Existing Swipe model pattern** (lines 131–141):
```prisma
model Swipe {
  id          String           @id @default(uuid())
  candidateId String
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id])
  jobId       String
  job         Job              @relation(fields: [jobId], references: [id])
  direction   SwipeDirection
  swipedAt    DateTime         @default(now())

  @@unique([candidateId, jobId])
}
```

**New Unlock model — copy Swipe composite-unique pattern:**
```prisma
model Unlock {
  id          String           @id @default(uuid())
  companyId   String
  company     Company          @relation(fields: [companyId], references: [id])
  candidateId String
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id])
  jobId       String
  job         Job              @relation(fields: [jobId], references: [id])
  unlockedAt  DateTime         @default(now())
  creditsCost Int

  @@unique([companyId, candidateId, jobId])
}
```

**Back-references to add on existing models:**
- On `Company` (line 105, after `creditTransactions`): `unlocks Unlock[]`
- On `CandidateProfile` (line 79, after `chats`): `unlocks Unlock[]`
- On `Job` (line 128, after `chats`): `unlocks Unlock[]`

---

### `src/modules/credits/credits.constants.ts` (new utility)

No analog needed — trivial export. Pattern: named export of a typed Record constant.

```typescript
// src/modules/credits/credits.constants.ts
export const UNLOCK_COST_BY_PLAN: Record<string, number> = {
  FREE: 2,
  PRO: 1,
}
```

---

### `src/modules/credits/credits.repository.ts` (new repository)

**Analog:** `src/modules/swipe/swipe.repository.ts` (lines 1–49) + `src/modules/company/company.repository.ts` (lines 1–18)

**Imports pattern** — copy from `src/modules/swipe/swipe.repository.ts` lines 1–2:
```typescript
import { prisma } from '../../shared/db/prisma'
import { Prisma } from '@prisma/client'
```

**Class structure** — copy from `src/modules/swipe/swipe.repository.ts` lines 4–49. Each method:
- Takes typed primitive parameters
- Makes a single `prisma.<model>.<operation>` call
- Returns the Prisma result directly (no error handling — that belongs to the service)

**Lookup method pattern** (from `swipe.repository.ts` lines 11–12, 15–17, 20–23):
```typescript
async findJobById(id: string) {
  return prisma.job.findUnique({ where: { id } })
}

async findCandidateProfileByUserId(userId: string) {
  return prisma.candidateProfile.findUnique({ where: { userId } })
}

async findRecruiterProfileByUserId(userId: string) {
  return prisma.recruiterProfile.findUnique({ where: { userId } })
}
```

**Compound unique lookup** — mirrors `Swipe` unique index; use named compound key (`companyId_candidateId_jobId`):
```typescript
async findUnlock(companyId: string, candidateId: string, jobId: string) {
  return prisma.unlock.findUnique({
    where: { companyId_candidateId_jobId: { companyId, candidateId, jobId } },
  })
}
```

**Swipe lookup for direction check** — mirrors `findSwipesByJobId` pattern in `swipe.repository.ts` line 38; use the Swipe compound unique (`candidateId_jobId`):
```typescript
async findSwipe(candidateId: string, jobId: string) {
  return prisma.swipe.findUnique({
    where: { candidateId_jobId: { candidateId, jobId } },
  })
}
```

**Recruiter lookup with company.plan** — extend the `findRecruiterProfileByUserId` pattern to include a nested `include`:
```typescript
async findRecruiterByUserId(userId: string) {
  return prisma.recruiterProfile.findUnique({
    where: { userId },
    include: { company: { select: { id: true, plan: true, credits: true } } },
  })
}
```

**Atomic transaction method** — copy `prisma.$transaction(async (tx) => { ... })` from `src/modules/company/company.service.ts` lines 21–36:
```typescript
async executeUnlock(companyId: string, candidateId: string, jobId: string, creditsCost: number) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new Error('COMPANY_NOT_FOUND')
    if (company.credits < creditsCost) throw new Error('INSUFFICIENT_CREDITS')

    await tx.company.update({
      where: { id: companyId },
      data: { credits: { decrement: creditsCost } },
    })
    const unlock = await tx.unlock.create({
      data: { companyId, candidateId, jobId, creditsCost },
    })
    await tx.creditTransaction.create({
      data: { companyId, amount: -creditsCost, reason: 'candidate_unlock' },
    })
    return unlock
  })
}
```

**Grant credits transaction** — copy `adjustCredits` from `src/modules/company/company.service.ts` lines 21–36 (positive-only, no balance check):
```typescript
async grantCredits(companyId: string, amount: number, reason: string) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    const updated = await tx.company.update({
      where: { id: companyId },
      data: { credits: { increment: amount } },
    })
    await tx.creditTransaction.create({
      data: { companyId, amount, reason },
    })
    return updated
  })
}
```

---

### `src/modules/credits/credits.service.ts` (new service)

**Analog:** `src/modules/company/company.service.ts` (lines 1–37) — atomic `$transaction` pattern and `AppError` throws.

**Imports pattern** (from `company.service.ts` lines 1–3):
```typescript
import { CreditRepository } from './credits.repository'
import { AppError } from '../../shared/errors/AppError'
import { Prisma } from '@prisma/client'
import { UNLOCK_COST_BY_PLAN } from './credits.constants'
```

**Constructor pattern** (from `company.service.ts` line 6):
```typescript
export class CreditService {
  constructor(private readonly repo: CreditRepository) {}
```

**Pre-transaction guard pattern** — chain of null-checks followed by single atomic transaction (from `company.service.ts` lines 20–36 and `swipe.service.ts` lines 31–48):
```typescript
async unlockCandidate(userId: string, jobId: string, candidateId: string) {
  const recruiter = await this.repo.findRecruiterByUserId(userId)
  if (!recruiter) throw new AppError('Forbidden', 403, 'FORBIDDEN')

  const job = await this.repo.findJobById(jobId)
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
  if (job.recruiterId !== recruiter.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')

  const swipe = await this.repo.findSwipe(candidateId, jobId)
  if (!swipe) throw new AppError('Candidate not found on this job', 404, 'NOT_FOUND')
  if (swipe.direction !== 'DISLIKE') throw new AppError('Candidate is already visible', 422, 'CANDIDATE_ALREADY_VISIBLE')

  const existing = await this.repo.findUnlock(recruiter.companyId, candidateId, jobId)
  if (existing) throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')

  const cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']

  try {
    return await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
      throw new AppError('Insufficient credits', 402, 'INSUFFICIENT_CREDITS')
    }
    throw err
  }
}
```

**P2002 catch pattern** — copy from `swipe.service.ts` lines 43–47:
```typescript
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')
  }
  throw err
}
```

**Admin grant delegation method** — simple passthrough to repo (no balance check, admin grants are always positive):
```typescript
async grantCredits(companyId: string, amount: number, reason = 'admin_grant') {
  return this.repo.grantCredits(companyId, amount, reason)
}
```

---

### `src/modules/credits/credits.routes.ts` (new route)

**Analog:** `src/modules/swipe/swipe.routes.ts` (lines 1–66) — exported async function, preHandlers, Zod param validation, service instantiation inside route factory.

**Imports pattern** (from `swipe.routes.ts` lines 1–9):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { CreditRepository } from './credits.repository'
import { CreditService } from './credits.service'
```

**Exported route function pattern** (from `swipe.routes.ts` lines 42–46):
```typescript
export async function creditsJobRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CreditRepository()
  const service = new CreditService(repo)
```

**Param schema validation** (from `swipe.routes.ts` lines 38–39 — `JobIdParamsSchema`):
```typescript
const UnlockParamsSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
})
```

**Route handler with preHandlers** (from `swipe.routes.ts` lines 59–65):
```typescript
app.post('/:jobId/candidates/:candidateId/unlock', {
  preHandler: [authenticate, requireRole('RECRUITER')],
}, async (request, reply) => {
  const { jobId, candidateId } = UnlockParamsSchema.parse(request.params)
  const unlock = await service.unlockCandidate(request.user.id, jobId, candidateId)
  return reply.status(201).send(unlock)
})
```

**Registration in `src/app.ts`** (after existing `swipeJobRoutes` on line 43 — copy that line's pattern):
```typescript
// line 43 (existing):
await app.register(swipeJobRoutes, { prefix: '/jobs' })
// add after:
await app.register(creditsJobRoutes, { prefix: '/jobs' })
```

Also add the import at top of `src/app.ts` (after line 15):
```typescript
import { creditsJobRoutes } from './modules/credits/credits.routes'
```

---

### `src/modules/admin/admin.service.ts` (modify — delegate to CreditService)

**Analog:** `src/modules/admin/admin.service.ts` (self, lines 1–53) — replace the inline `prisma.$transaction` in `adjustCredits` with a delegation call.

**Current `adjustCredits`** (lines 39–52) — REMOVE this implementation:
```typescript
// REMOVE: lines 1-2 (prisma import no longer needed if only credits used it)
import { prisma } from '../../shared/db/prisma'   // remove if no longer used

async adjustCredits(companyId: string, amount: number, reason = 'admin_grant') {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    const updated = await tx.company.update({
      where: { id: companyId },
      data: { credits: { increment: amount } },
    })
    await tx.creditTransaction.create({
      data: { companyId, amount, reason },
    })
    return updated
  })
}
```

**New delegation pattern** — `AdminService` receives `CreditService` via constructor (ARCH-04 compliant: injected at route level, not constructed internally):
```typescript
// admin.service.ts — after refactor
import { AppError } from '../../shared/errors/AppError'
import type { CreditService } from '../credits/credits.service'

export class AdminService {
  constructor(private readonly creditService: CreditService) {}

  // listUsers and getUserById remain unchanged (lines 5-37)

  async adjustCredits(companyId: string, amount: number) {
    return this.creditService.grantCredits(companyId, amount, 'admin_grant')
  }
}
```

---

### `src/modules/admin/admin.routes.ts` (modify — inject CreditService)

**Analog:** `src/modules/admin/admin.routes.ts` (self, lines 1–46) — change service instantiation on line 17.

**Current instantiation** (line 17):
```typescript
const service = new AdminService()
```

**Updated instantiation** — construct CreditService at route level and inject:
```typescript
import { CreditRepository } from '../credits/credits.repository'
import { CreditService } from '../credits/credits.service'

// inside adminRoutes():
const creditRepo = new CreditRepository()
const creditService = new CreditService(creditRepo)
const service = new AdminService(creditService)
```

All routes (`GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/companies/:id/credits`) remain structurally unchanged.

---

### `src/modules/swipe/swipe.repository.ts` (modify — add findUnlocksByJobAndCompany)

**Analog:** `src/modules/swipe/swipe.repository.ts` (self, lines 1–49) — append new method following same single-query pattern.

**New method to append** (after line 48, before closing `}`):
```typescript
async findUnlocksByJobAndCompany(jobId: string, companyId: string): Promise<Set<string>> {
  const unlocks = await prisma.unlock.findMany({
    where: { jobId, companyId },
    select: { candidateId: true },
  })
  return new Set(unlocks.map((u) => u.candidateId))
}
```

Note: `prisma.unlock` is queried directly here — this is ARCH-04 compliant because repositories are the DB-access layer and may query any Prisma model. `SwipeService` must never import from `src/modules/credits/`.

---

### `src/modules/swipe/swipe.service.ts` (modify — reveal unlocked DISLIKE)

**Analog:** `src/modules/swipe/swipe.service.ts` (self, lines 89–146) — update `getRanking`.

**Add one repo call** after line 97 (`const swipes = await this.repo.findSwipesByJobId(jobId)`):
```typescript
const unlockedCandidateIds = await this.repo.findUnlocksByJobAndCompany(jobId, recruiterProfile.companyId)
```

Note: `recruiterProfile.companyId` is already available — `findRecruiterProfileByUserId` returns the full `RecruiterProfile` which includes `companyId` (confirmed: `swipe.repository.ts` line 20–22 queries `prisma.recruiterProfile.findUnique({ where: { userId } })`; the schema at line 86–89 shows `companyId String` on `RecruiterProfile`).

**Updated profile mapping** — replace lines 126–137 (the `profile:` expression):
```typescript
// Current (lines 126-137):
profile:
  swipe.direction === 'LIKE'
    ? { /* full profile */ }
    : null, // DISLIKE — identity fully censored (D-06)

// Replace with:
profile:
  swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
    ? {
        name: swipe.candidate.name,
        avatarUrl: swipe.candidate.user.avatarUrl,
        bio: swipe.candidate.bio,
        skills: swipe.candidate.skills,
        professionId: swipe.candidate.professionId,
        preferredModalities: swipe.candidate.preferredModalities,
        salaryExpectation: swipe.candidate.salaryExpectation,
        // lat/lng intentionally excluded — D-05, D-07 (location privacy)
      }
    : null, // DISLIKE + not unlocked — identity fully censored
```

---

### `tests/unit/credit.service.test.ts` (new unit test)

**Analog:** `tests/unit/swipe.service.test.ts` (lines 1–316) — exact same structure: `makeRepo()` mock factory, `makeXxx()` data factories, `describe` blocks per method, `beforeEach` with `jest.clearAllMocks()`.

**Imports pattern** (from `swipe.service.test.ts` lines 1–5):
```typescript
import { CreditService } from '../../src/modules/credits/credits.service'
import { CreditRepository } from '../../src/modules/credits/credits.repository'
import { AppError } from '../../src/shared/errors/AppError'
import { Prisma } from '@prisma/client'
```

**Mock repo factory pattern** (from `swipe.service.test.ts` lines 8–15):
```typescript
const makeRepo = (): jest.Mocked<CreditRepository> => ({
  findRecruiterByUserId: jest.fn(),
  findJobById: jest.fn(),
  findSwipe: jest.fn(),
  findUnlock: jest.fn(),
  findCandidateProfileById: jest.fn(),
  executeUnlock: jest.fn(),
  grantCredits: jest.fn(),
} as unknown as jest.Mocked<CreditRepository>)
```

**Data factory pattern** (from `swipe.service.test.ts` lines 22–43 — `makeCandidate`, `makeJob`):
```typescript
const makeRecruiter = (overrides: Partial<{ id: string; companyId: string; company: { plan: string; credits: number } }> = {}) => ({
  id: overrides.id ?? 'recruiter-1',
  companyId: overrides.companyId ?? 'company-1',
  company: overrides.company ?? { id: 'company-1', plan: 'FREE', credits: 10 },
})

const makeJob = (overrides: Partial<{ id: string; recruiterId: string }> = {}) => ({
  id: overrides.id ?? 'job-1',
  recruiterId: overrides.recruiterId ?? 'recruiter-1',
})

const makeSwipe = (direction: 'LIKE' | 'DISLIKE' = 'DISLIKE') => ({
  candidateId: 'candidate-1',
  jobId: 'job-1',
  direction,
})
```

**Test structure pattern** (from `swipe.service.test.ts` lines 45–56):
```typescript
describe('CreditService', () => {
  let repo: jest.Mocked<CreditRepository>
  let service: CreditService

  beforeEach(() => {
    repo = makeRepo()
    service = new CreditService(repo)
    jest.clearAllMocks()
  })

  describe('unlockCandidate', () => {
    it('lança AppError 403 FORBIDDEN quando userId não tem perfil de recruiter', async () => {
      repo.findRecruiterByUserId.mockResolvedValue(null)
      await expect(service.unlockCandidate('user-1', 'job-1', 'cand-1'))
        .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
      expect(repo.executeUnlock).not.toHaveBeenCalled()
    })
    // ... more tests per guard step
  })
})
```

**P2002 mock pattern** (from `swipe.service.test.ts` line 89):
```typescript
const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '7.0.0' })
repo.executeUnlock.mockRejectedValue(p2002)
```

---

### `tests/integration/credits.test.ts` (new integration test)

**Analog:** `tests/integration/swipe.test.ts` (lines 1–371) + `tests/integration/admin.test.ts` (lines 1–212).

**File header / imports pattern** (from `swipe.test.ts` lines 1–7):
```typescript
import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe, createUnlock } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/shared/db/prisma'
```

**Login helper pattern** (from `swipe.test.ts` lines 10–16):
```typescript
async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = 'password123',
): Promise<string> {
  const response = await supertest(app.server).post('/auth/login').send({ email, password })
  return response.body.accessToken as string
}
```

**Recruiter setup helper pattern** (from `swipe.test.ts` lines 42–52):
```typescript
async function createRecruiterWithProfile(
  app: Awaited<ReturnType<typeof buildApp>>,
  companyId: string,
  emailSuffix: string,
) {
  const passwordHash = await bcrypt.hash('password123', 12)
  const user = await createUser({ role: 'RECRUITER', email: `rec-${emailSuffix}@test.com`, passwordHash })
  const profile = await prisma.recruiterProfile.create({ data: { userId: user.id, companyId } })
  const token = await loginUser(app, user.email)
  return { user, profile, token }
}
```

**Individual test structure** (from `swipe.test.ts` lines 56–72 — `buildApp`, `app.ready()`, supertest call, `expect`, `app.close()`):
```typescript
it('201 e retorna unlock + profile ao desbloquear candidato DISLIKE com créditos suficientes', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()
  // setup...
  const response = await supertest(app.server)
    .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
    .set('Authorization', `Bearer ${recToken}`)
  expect(response.status).toBe(201)
  // assertions...
  await app.close()
})
```

**Describe block grouping** (from `admin.test.ts` lines 17–46 and `swipe.test.ts` lines 54–136):
```typescript
describe('POST /jobs/:jobId/candidates/:candidateId/unlock', () => {
  // happy path + all error paths
})
```

---

### `tests/helpers/factories.ts` (modify — append createUnlock)

**Analog:** `tests/helpers/factories.ts` lines 102–116 (`createSwipe` function) — exact same signature pattern.

**createSwipe pattern** (lines 102–116) — copy structure:
```typescript
export async function createSwipe(
  candidateId: string,
  jobId: string,
  overrides: Partial<{
    direction: 'LIKE' | 'DISLIKE'
  }> = {}
) {
  return prisma.swipe.create({
    data: {
      candidateId,
      jobId,
      direction: overrides.direction ?? 'LIKE',
    },
  })
}
```

**New createUnlock to append** — same pattern, different required args:
```typescript
export async function createUnlock(
  companyId: string,
  candidateId: string,
  jobId: string,
  overrides: Partial<{ creditsCost: number }> = {}
) {
  return prisma.unlock.create({
    data: {
      companyId,
      candidateId,
      jobId,
      creditsCost: overrides.creditsCost ?? 2,
    },
  })
}
```

---

### `tests/helpers/setup.ts` (modify — add unlock teardown)

**Analog:** `tests/helpers/setup.ts` (self, lines 17–29) — `afterEach` block adding `prisma.unlock.deleteMany()` before `prisma.job.deleteMany()`.

**Current teardown order** (lines 17–29):
```typescript
afterEach(async () => {
  await prisma.refreshToken.deleteMany()
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

**Updated teardown** — add `prisma.unlock.deleteMany()` before `prisma.creditTransaction.deleteMany()` (Unlock FK-depends on Company, CandidateProfile, Job — all of which come later):
```typescript
afterEach(async () => {
  await prisma.refreshToken.deleteMany()
  await prisma.message.deleteMany()
  await prisma.chat.deleteMany()
  await prisma.swipe.deleteMany()
  await prisma.unlock.deleteMany()           // ADD: before creditTransaction, job, company, candidateProfile
  await prisma.creditTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.recruiterProfile.deleteMany()
  await prisma.company.deleteMany()
  await prisma.candidateProfile.deleteMany()
  await prisma.user.deleteMany()
})
```

---

## Shared Patterns

### Authentication + Role Guard
**Source:** `src/shared/hooks/authenticate.ts` (lines 15–24) + `src/shared/hooks/requireRole.ts` (lines 10–23)
**Apply to:** `credits.routes.ts` — unlock endpoint preHandler

```typescript
// authenticate (authenticate.ts lines 15-24):
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }
}

// requireRole (requireRole.ts lines 10-23) — MUST be after authenticate:
export function requireRole(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!roles.includes(request.user.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}

// Usage in route:
preHandler: [authenticate, requireRole('RECRUITER')]
```

### Error Throwing
**Source:** `src/shared/errors/AppError.ts` (lines 1–12)
**Apply to:** `credits.service.ts`, `credits.repository.ts`

```typescript
// Signature: new AppError(message, statusCode, code)
throw new AppError('Company not found', 404, 'NOT_FOUND')
throw new AppError('Forbidden', 403, 'FORBIDDEN')
throw new AppError('Insufficient credits', 402, 'INSUFFICIENT_CREDITS')
throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')
throw new AppError('Candidate is already visible', 422, 'CANDIDATE_ALREADY_VISIBLE')
```

### Atomic Prisma Transaction
**Source:** `src/modules/company/company.service.ts` lines 21–36
**Apply to:** `credits.repository.ts` (executeUnlock + grantCredits methods)

```typescript
return prisma.$transaction(async (tx) => {
  const company = await tx.company.findUnique({ where: { id: companyId } })
  if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
  const updated = await tx.company.update({
    where: { id: companyId },
    data: { credits: { increment: delta } },
  })
  await tx.creditTransaction.create({
    data: { companyId, amount: delta, reason },
  })
  return updated
})
```

### P2002 Unique Constraint Catch
**Source:** `src/modules/swipe/swipe.service.ts` lines 43–47
**Apply to:** `credits.service.ts` `unlockCandidate` wrapper around `executeUnlock`

```typescript
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')
  }
  throw err
}
```

### Ownership Check Pattern
**Source:** `src/modules/swipe/swipe.service.ts` lines 89–95
**Apply to:** `credits.service.ts` `unlockCandidate` pre-transaction guard

```typescript
const recruiterProfile = await this.repo.findRecruiterProfileByUserId(userId)
if (!recruiterProfile) throw new AppError('Forbidden', 403, 'FORBIDDEN')

const job = await this.repo.findJobById(jobId)
if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
if (job.recruiterId !== recruiterProfile.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')
```

### haversineKm — Location Distance
**Source:** `src/modules/swipe/swipe.service.ts` lines 7–23
**Apply to:** `credits.service.ts` (to compute `distanceKm` in unlock response per D-05)

The function is currently private in `swipe.service.ts`. For Phase 7, either:
- Option A (recommended): Extract to `src/shared/utils/haversine.ts` and import in both `swipe.service.ts` and `credits.service.ts`
- Option B: Duplicate the 10-line function in `credits.service.ts`

```typescript
// haversineKm — copy verbatim from swipe.service.ts lines 7-23:
function haversineKm(
  lat1: number | null, lng1: number | null,
  lat2: number | null, lng2: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
```

### Zod UUID Param Validation
**Source:** `src/modules/swipe/swipe.routes.ts` line 38
**Apply to:** `credits.routes.ts` params schema

```typescript
const UnlockParamsSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
})
// Usage: const { jobId, candidateId } = UnlockParamsSchema.parse(request.params)
```

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns alone.

---

## Metadata

**Analog search scope:** `src/modules/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`, `prisma/`, `src/shared/`
**Files scanned:** 16
**Pattern extraction date:** 2026-05-02
