# Phase 5: Swipe - Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/modules/swipe/swipe.routes.ts` | route/plugin | request-response | `src/modules/job/job.routes.ts` | exact |
| `src/modules/swipe/swipe.service.ts` | service | CRUD + transform | `src/modules/job/job.service.ts` | exact |
| `src/modules/swipe/swipe.repository.ts` | repository | CRUD | `src/modules/job/job.repository.ts` | exact |
| `src/app.ts` (modify) | config | request-response | `src/app.ts` | self |
| `tests/unit/swipe.service.test.ts` | test | — | `tests/unit/job.service.test.ts` | exact |
| `tests/integration/swipe.test.ts` | test | — | `tests/integration/job-routes.test.ts` | exact |
| `tests/helpers/factories.ts` (modify) | utility | — | `tests/helpers/factories.ts` | self |

---

## Pattern Assignments

### `src/modules/swipe/swipe.routes.ts` (route/plugin, request-response)

**Analog:** `src/modules/job/job.routes.ts`

**Imports pattern** (analog lines 1-7):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { SwipeRepository } from './swipe.repository'
import { SwipeService } from './swipe.service'
import type { RankingItem } from '../job/job.routes'  // type-only import — no runtime coupling (ARCH-04 safe)
```

**Per-route rate limit pattern** (analog: `src/modules/auth/auth.routes.ts` lines 31-36):
```typescript
app.post('/', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  preHandler: [authenticate, requireRole('CANDIDATE')],
}, async (request, reply) => { ... })
```

**Static-before-parameterized route ordering** (analog: `src/modules/job/job.routes.ts` lines 59-75):
```typescript
// MUST register GET /feed BEFORE GET /:jobId/ranking
// Same pattern as job.routes.ts: /mine before /:id
app.get('/feed', {
  preHandler: [authenticate, requireRole('CANDIDATE')],
}, async (request, reply) => { ... })

app.get('/:jobId/ranking', {
  preHandler: [authenticate, requireRole('RECRUITER')],
}, async (request, reply) => { ... })
```

**Plugin instantiation pattern** (analog: `src/modules/job/job.routes.ts` lines 43-46):
```typescript
export async function swipeRoutes(app: FastifyInstance): Promise<void> {
  const repo = new SwipeRepository()
  const service = new SwipeService(repo)
  // POST /   (mounted at /swipes prefix in app.ts)
}

export async function swipeJobRoutes(app: FastifyInstance): Promise<void> {
  const repo = new SwipeRepository()
  const service = new SwipeService(repo)
  // GET /feed and GET /:jobId/ranking  (mounted at /jobs prefix in app.ts)
}
```

**Zod params/body/query validation pattern** (analog: `src/modules/job/job.routes.ts` lines 14-28):
```typescript
const SwipeBodySchema = z.object({
  jobId: z.string().uuid(),
  direction: z.enum(['LIKE', 'DISLIKE']),
})

const JobIdParamsSchema = z.object({ jobId: z.string().uuid() })

const FeedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().positive().max(50).default(20),
})
```

**Reply pattern** (analog: `src/modules/job/job.routes.ts` lines 52-56):
```typescript
return reply.status(201).send(result)
return reply.status(200).send({ data: items, nextCursor })
```

---

### `src/modules/swipe/swipe.service.ts` (service, CRUD + transform)

**Analog:** `src/modules/job/job.service.ts`

**Imports and constructor pattern** (analog lines 1-6):
```typescript
import { SwipeRepository } from './swipe.repository'
import { AppError } from '../../shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'
import type { RankingItem } from '../job/job.routes'

export class SwipeService {
  constructor(private readonly repo: SwipeRepository) {}
```

**Profile resolution + guard pattern** (analog lines 8-10):
```typescript
// Pattern from job.service.ts — resolve profile from userId, never from body (IDOR prevention)
const profile = await this.repo.findCandidateProfileByUserId(userId)
if (!profile) throw new AppError('Candidate profile not found', 404, 'NOT_FOUND')
```

**Ownership check pattern** (analog lines 17-18):
```typescript
// From job.service.ts updateJob — exact same pattern for ranking ownership
if (job.recruiterId !== recruiterProfile.id)
  throw new AppError('Forbidden', 403, 'FORBIDDEN')
```

**Active job guard** (analog pattern, new for swipe):
```typescript
const job = await this.repo.findJobById(jobId)
if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
if (!job.isActive || job.expiresAt <= new Date())
  throw new AppError('Job not found', 404, 'NOT_FOUND')
```

**$transaction + P2002 catch pattern** (from RESEARCH.md Pattern 2 + Pitfall 2):
```typescript
try {
  return await this.repo.createSwipe({ candidateId, jobId, direction })
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')
  }
  throw err
}
```

**Haversine null-safe utility** (from RESEARCH.md Code Examples):
```typescript
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

**Ranking serialization with LIKE/DISLIKE gate** (from RESEARCH.md Pattern 4):
```typescript
const items: RankingItem[] = swipesWithCandidates.map((swipe, index) => ({
  candidateId: swipe.candidateId,
  fitScore: 0,  // Phase 5 placeholder; Phase 6 replaces
  distanceKm: haversineKm(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng),
  rank: index + 1,
  profile: swipe.direction === 'LIKE'
    ? {
        name: swipe.candidate.name,
        avatarUrl: swipe.candidate.user.avatarUrl,
        bio: swipe.candidate.bio,
        skills: swipe.candidate.skills,
        professionId: swipe.candidate.professionId,
        preferredModalities: swipe.candidate.preferredModalities,
        salaryExpectation: swipe.candidate.salaryExpectation,
        // lat/lng intentionally excluded — D-05, D-07
      }
    : null,
}))
```

---

### `src/modules/swipe/swipe.repository.ts` (repository, CRUD)

**Analog:** `src/modules/job/job.repository.ts`

**Imports and class skeleton** (analog lines 1-32):
```typescript
import { prisma } from '../../shared/db/prisma'
import { SwipeDirection } from '@prisma/client'

export class SwipeRepository {
  // All methods use prisma directly — NEVER import from other modules (ARCH-04)
```

**ARCH-04 self-contained profile resolution pattern** (analog lines 49-52):
```typescript
async findCandidateProfileByUserId(userId: string) {
  // Direct Prisma call — NEVER import CandidateRepository (module isolation, ARCH-04)
  return prisma.candidateProfile.findUnique({ where: { userId } })
}

async findRecruiterProfileByUserId(userId: string) {
  // Same pattern as job.repository.ts line 49-52
  return prisma.recruiterProfile.findUnique({ where: { userId } })
}
```

**$transaction atomic write** (from RESEARCH.md Pattern 2):
```typescript
async createSwipe(data: { candidateId: string; jobId: string; direction: SwipeDirection }) {
  return prisma.$transaction(async (tx) => {
    return tx.swipe.create({ data })  // must return inside callback (Pitfall 3)
  })
}
```

**findJobById pattern** (analog: `src/modules/job/job.repository.ts` lines 37-39):
```typescript
async findJobById(id: string) {
  return prisma.job.findUnique({ where: { id } })
}
```

**Cursor-based feed query** (from RESEARCH.md Pattern 3):
```typescript
async findFeedJobs(candidateId: string, cursor: string | undefined, limit: number) {
  return prisma.job.findMany({
    where: {
      isActive: true,
      expiresAt: { gt: new Date() },
      NOT: { swipes: { some: { candidateId } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,  // +1 to detect next page (Pitfall 4)
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
}
```

**Ranking query with candidate include** (from RESEARCH.md Code Examples):
```typescript
async findSwipesByJobId(jobId: string) {
  return prisma.swipe.findMany({
    where: { jobId },
    orderBy: [{ swipedAt: 'desc' }],  // secondary sort; primary (fitScore) done in service
    include: {
      candidate: {
        include: { user: { select: { avatarUrl: true } } },
      },
    },
  })
}
```

---

### `src/app.ts` (modify — add two plugin registrations)

**Analog:** `src/app.ts` (self)

**Existing plugin registration pattern** (lines 36-40):
```typescript
await app.register(jobRoutes, { prefix: '/jobs' })
await app.register(adminRoutes, { prefix: '/admin' })
```

**New registrations to add** (after existing jobRoutes line):
```typescript
import { swipeRoutes, swipeJobRoutes } from './modules/swipe/swipe.routes'

// In buildApp(), after jobRoutes:
await app.register(swipeRoutes, { prefix: '/swipes' })    // POST /swipes
await app.register(swipeJobRoutes, { prefix: '/jobs' })   // GET /jobs/feed, GET /jobs/:jobId/ranking
```

Note: Fastify allows two plugins at the same `/jobs` prefix — routes are merged. Order matters: `swipeJobRoutes` must register `/feed` before `/:jobId/ranking` internally (Pitfall 1).

---

### `tests/unit/swipe.service.test.ts` (test, unit)

**Analog:** `tests/unit/job.service.test.ts`

**Mock repo factory pattern** (analog lines 6-13):
```typescript
const makeRepo = (): jest.Mocked<SwipeRepository> => ({
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findFeedJobs: jest.fn(),
  findCandidateProfileByUserId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
} as unknown as jest.Mocked<SwipeRepository>)
```

**makeProfile / makeJob fixture pattern** (analog lines 15-37):
```typescript
const makeCandidate = (overrides: Partial<{ id: string; userId: string; lat: number | null; lng: number | null }> = {}) => ({
  id: overrides.id ?? 'candidate-1',
  userId: overrides.userId ?? 'user-1',
  name: 'Test Candidate',
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  bio: null,
  skills: ['Node.js'],
  professionId: 'backend-dev',
  preferredModalities: ['REMOTE'],
  salaryExpectation: null,
})

const makeJob = (overrides: Partial<{ id: string; isActive: boolean; lat: number | null; lng: number | null; expiresAt: Date }> = {}) => ({
  id: overrides.id ?? 'job-1',
  isActive: overrides.isActive ?? true,
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86400000),
})
```

**describe/beforeEach/clearAllMocks pattern** (analog lines 39-47):
```typescript
describe('SwipeService', () => {
  let repo: jest.Mocked<SwipeRepository>
  let service: SwipeService

  beforeEach(() => {
    repo = makeRepo()
    service = new SwipeService(repo)
    jest.clearAllMocks()
  })
```

**AppError assertion pattern** (analog lines 50-65):
```typescript
it('lança AppError 404 NOT_FOUND quando candidato não tem perfil', async () => {
  repo.findCandidateProfileByUserId.mockResolvedValue(null)
  await expect(
    service.recordSwipe('user-1', 'job-1', 'LIKE')
  ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  expect(repo.createSwipe).not.toHaveBeenCalled()
})
```

---

### `tests/integration/swipe.test.ts` (test, integration)

**Analog:** `tests/integration/job-routes.test.ts`

**File header and setup imports** (analog lines 1-7):
```typescript
import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/shared/db/prisma'
```

**loginUser helper pattern** (analog lines 13-20):
```typescript
async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const response = await supertest(app.server)
    .post('/auth/login')
    .send({ email, password })
  return response.body.accessToken as string
}
```

**createCandidateWithProfile helper pattern** (mirrors analog lines 23-39):
```typescript
async function createCandidateWithProfile(
  app: Awaited<ReturnType<typeof buildApp>>,
  emailSuffix: string,
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await createUser({ role: 'CANDIDATE', email: `cand-${emailSuffix}@test.com`, passwordHash })
  const profile = await prisma.candidateProfile.create({
    data: {
      userId: user.id,
      name: 'Test Candidate',
      professionId: 'backend-dev',
      skills: ['Node.js'],
      preferredModalities: ['REMOTE'],
      searchRadiusKm: 50,
    },
  })
  const token = await loginUser(app, user.email)
  return { user, profile, token }
}
```

**describe block + app lifecycle pattern** (analog lines 54-71):
```typescript
describe('POST /swipes', () => {
  it('201 cria swipe quando CANDIDATE envia body válido', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    // ... test body ...
    await app.close()
  })
})
```

**Role guard test pattern** (analog lines 145-165):
```typescript
it('403 quando RECRUITER tenta dar swipe', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()
  // login as RECRUITER, call POST /swipes, expect 403
  await app.close()
})
```

---

### `tests/helpers/factories.ts` (modify — add createSwipe)

**Analog:** `tests/helpers/factories.ts` (self)

**Existing factory pattern to follow** (lines 54-78):
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

---

## Shared Patterns

### Authentication + Role Guard
**Source:** `src/shared/hooks/authenticate.ts` + `src/shared/hooks/requireRole.ts`
**Apply to:** All three swipe endpoints
```typescript
// From authenticate.ts lines 15-23 and requireRole.ts lines 10-21
preHandler: [authenticate, requireRole('CANDIDATE')]   // POST /swipes, GET /jobs/feed
preHandler: [authenticate, requireRole('RECRUITER')]   // GET /jobs/:jobId/ranking
```

### AppError — throw pattern
**Source:** `src/shared/errors/AppError.ts`
**Apply to:** `swipe.service.ts` — all guard branches
```typescript
throw new AppError('Candidate profile not found', 404, 'NOT_FOUND')
throw new AppError('Job not found', 404, 'NOT_FOUND')
throw new AppError('Forbidden', 403, 'FORBIDDEN')
throw new AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')
```

### Error Handler — P2002 upstream catch
**Source:** `src/shared/errors/errorHandler.ts` lines 30-35
**Apply to:** `swipe.service.ts` recordSwipe method
The global handler maps P2002 → generic 409. SwipeService MUST catch P2002 first and re-throw as `AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')` to preserve the custom `code` field (Pitfall 2).

### Prisma singleton import
**Source:** `src/shared/db/prisma.ts`
**Apply to:** `swipe.repository.ts` (imports line 1 only)
```typescript
import { prisma } from '../../shared/db/prisma'
```

### ARCH-04 — No cross-module imports
**Source:** `src/modules/job/job.repository.ts` lines 49-52 (comment)
**Apply to:** `swipe.repository.ts` — all profile/job lookups
```typescript
// Direct Prisma call — NEVER import CandidateRepository, RecruiterRepository, or JobRepository
// (module isolation, ARCH-04)
```

### Per-route rate limit override
**Source:** `src/modules/auth/auth.routes.ts` lines 31-36
**Apply to:** `swipe.routes.ts` — POST / handler only
```typescript
config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
```

### Zod parse call convention
**Source:** `src/modules/job/job.routes.ts` lines 51, 71, 83
**Apply to:** All three swipe route handlers
```typescript
const body = SwipeBodySchema.parse(request.body)
const { jobId } = JobIdParamsSchema.parse(request.params)
const query = FeedQuerySchema.parse(request.query)
```

---

## No Analog Found

All files have close matches in the codebase. No entries required.

---

## Metadata

**Analog search scope:** `src/modules/`, `src/shared/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`
**Files scanned:** 16
**Pattern extraction date:** 2026-04-26
