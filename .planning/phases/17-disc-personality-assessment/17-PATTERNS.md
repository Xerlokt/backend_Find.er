# Phase 17: DISC Personality Assessment - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 15 (8 new, 7 modified)
**Analogs found:** 15 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/entities/disc-result.entity.ts` | model | — | `src/domain/entities/candidate.entity.ts` | exact |
| `src/domain/interfaces/disc.repository.interface.ts` | model | CRUD | `src/domain/interfaces/candidate.repository.interface.ts` | exact |
| `src/application/use-cases/disc/submit-disc.use-case.ts` | service | request-response | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/disc/get-disc.use-case.ts` | service | request-response | `src/application/use-cases/candidate/get-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/disc/disc-questions.ts` | utility | — | none — pure constant file | no-analog |
| `src/adapters/controllers/disc.controller.ts` | controller | request-response | `src/adapters/controllers/candidate.controller.ts` | exact |
| `src/adapters/repositories/disc.repository.ts` | repository | CRUD | `src/adapters/repositories/candidate.repository.ts` | exact |
| `src/infrastructure/http/routes/disc.routes.ts` | route | request-response | `src/infrastructure/http/routes/candidate.routes.ts` | exact |
| `prisma/schema.prisma` | config | — | existing schema — additive extension | modify |
| `src/domain/interfaces/recommendation.repository.interface.ts` | model | — | self — additive optional fields | modify |
| `src/domain/interfaces/swipe.repository.interface.ts` | model | — | self — additive optional field on intersection type | modify |
| `src/adapters/services/recommendation.repository.ts` | service | transform | self — extend `computeFitScore()` tail | modify |
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | service | request-response | self — extend `censorProfile()` and `CensoredProfile` | modify |
| `src/adapters/repositories/swipe.repository.ts` | repository | CRUD | self — extend `findSwipesByJobId` include + map | modify |
| `src/app.ts` | config | — | self — route registration block | modify |
| `tests/helpers/setup.ts` | test | — | self — `afterEach` teardown block | modify |
| `tests/unit/disc.use-cases.test.ts` | test | — | `tests/unit/get-ranking.use-case.test.ts` | role-match |
| `tests/integration/disc.test.ts` | test | — | `tests/integration/candidate.test.ts` | role-match |

---

## Pattern Assignments

### `src/domain/entities/disc-result.entity.ts` (model)

**Analog:** `src/domain/entities/candidate.entity.ts` (lines 1–15)

**Entity shape pattern** (candidate.entity.ts lines 1–15):
```typescript
import { Modality } from './job.entity'

export interface CandidateProfile {
  id: string
  userId: string
  name: string
  bio: string | null
  lat: number | null
  lng: number | null
  professionId: string
  skills: string[]
  preferredModalities: Modality[]
  searchRadiusKm: number
  salaryExpectation: number | null
}
```

**Apply to new file:** Same pure interface shape, no imports from Prisma, export a union type for the discriminated value:
```typescript
// src/domain/entities/disc-result.entity.ts
export type DiscDimension = 'D' | 'I' | 'S' | 'C'

export interface DiscResult {
  id: string
  candidateId: string
  scoreD: number
  scoreI: number
  scoreS: number
  scoreC: number
  dominant: DiscDimension
  createdAt: Date
  updatedAt: Date
}
```

---

### `src/domain/interfaces/disc.repository.interface.ts` (model, CRUD)

**Analog:** `src/domain/interfaces/candidate.repository.interface.ts` (lines 1–20)

**Interface pattern** (candidate.repository.interface.ts lines 1–20):
```typescript
import { CandidateProfile } from '../entities/candidate.entity'
import { Modality } from '../entities/job.entity'

export interface ICandidateRepository {
  upsertProfile(
    userId: string,
    data: {
      name: string
      bio?: string | null
      // ...
    },
  ): Promise<CandidateProfile>
  findByUserId(userId: string): Promise<CandidateProfile | null>
}
```

**Key rule:** No Prisma imports. Only domain entity types. Two methods only: `upsert` + `findByCandidateId`.

---

### `src/adapters/controllers/disc.controller.ts` (controller, request-response)

**Analog:** `src/adapters/controllers/candidate.controller.ts` (lines 1–52)

**Imports pattern** (candidate.controller.ts lines 1–8):
```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CandidateRepository } from '../repositories/candidate.repository'
import { UpsertCandidateProfileUseCase } from '../../application/use-cases/candidate/upsert-candidate-profile.use-case'
import { GetCandidateProfileUseCase } from '../../application/use-cases/candidate/get-candidate-profile.use-case'
import { DomainError } from '../../application/errors/domain.error'
import { ICachePort } from '../../application/ports/cache.port'
```

**Zod schema pattern** (candidate.controller.ts lines 9–19):
```typescript
const CandidateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  // ...
})
```

**Controller method pattern** (candidate.controller.ts lines 24–37):
```typescript
async upsertProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = CandidateProfileSchema.parse(request.body)
  const useCase = new UpsertCandidateProfileUseCase(new CandidateRepository(), this.opts.cache)
  try {
    const profile = await useCase.execute(request.user.id, body)
    reply.status(200).send(profile)
  } catch (err) {
    if (err instanceof DomainError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code })
      return
    }
    throw err
  }
}
```

**Apply to DiscController:** Two schemas — `DiscParamsSchema` (`id: z.string().uuid()`) and `SubmitDiscBodySchema` (`answers: z.array(z.enum(['D','I','S','C'])).length(4)`). Two methods — `submitDisc` and `getDisc`. No `opts` constructor injection (no cache needed per RESEARCH Open Question 1). Parse params AND body separately. The `id` param is the `candidateId` — pass `request.user.id` (userId) AND `candidateId` to use case for ownership check.

Also relevant: **JobController** for Zod Params pattern (job.controller.ts lines 31):
```typescript
const JobParamsSchema = z.object({ id: z.string().uuid() })
```

---

### `src/adapters/repositories/disc.repository.ts` (repository, CRUD)

**Analog:** `src/adapters/repositories/candidate.repository.ts` (lines 1–49) — exact match.

**Imports pattern** (candidate.repository.ts lines 1–5):
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { ICandidateRepository } from '../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { Modality } from '../../domain/entities/job.entity'
```

**Upsert pattern** (candidate.repository.ts lines 7–27):
```typescript
export class CandidateRepository implements ICandidateRepository {
  async upsertProfile(
    userId: string,
    data: { ... },
  ): Promise<CandidateProfile> {
    const row = await prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    const row = await prisma.candidateProfile.findUnique({ where: { userId } })
    return row ? this.toDomain(row) : null
  }
  // ...
}
```

**toDomain pattern** (candidate.repository.ts lines 34–48):
```typescript
private toDomain(row: any): CandidateProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    bio: row.bio,
    lat: row.lat,
    lng: row.lng,
    professionId: row.professionId,
    skills: row.skills,
    preferredModalities: row.preferredModalities as Modality[],
    searchRadiusKm: row.searchRadiusKm,
    salaryExpectation: row.salaryExpectation,
  }
}
```

**Apply to DiscRepository:** Replace `prisma.candidateProfile` with `prisma.discResult`. Upsert `where: { candidateId }` (unique field). `toDomain` maps all 9 DiscResult fields: id, candidateId, scoreD, scoreI, scoreS, scoreC, dominant, createdAt, updatedAt.

---

### `src/infrastructure/http/routes/disc.routes.ts` (route, request-response)

**Analog:** `src/infrastructure/http/routes/candidate.routes.ts` (lines 1–14) — exact match.

**Full file pattern** (candidate.routes.ts lines 1–14):
```typescript
import { FastifyInstance } from 'fastify'
import { CandidateController } from '../../../adapters/controllers/candidate.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { ICachePort } from '../../../application/ports/cache.port'

type CandidateRouteOpts = { cache: ICachePort }

export async function candidateRoutes(app: FastifyInstance, opts: CandidateRouteOpts): Promise<void> {
  const ctrl = new CandidateController(opts)

  app.put('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.upsertProfile.bind(ctrl))
  app.get('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getProfile.bind(ctrl))
}
```

**Apply to discRoutes:** No `opts` parameter (DiscController has no cache dependency). Routes are `POST /:id/disc` and `GET /:id/disc`. The prefix `/candidates` is applied at registration in `src/app.ts`, making the full paths `/candidates/:id/disc`.

---

### `src/application/use-cases/disc/submit-disc.use-case.ts` (service, request-response)

**Analog:** `src/application/use-cases/swipe/get-ranking.use-case.ts` — for ownership check and DomainError patterns.

**Auth/ownership pattern** (get-ranking.use-case.ts lines 114–124):
```typescript
// Step 1: Verify the caller is a recruiter
const recruiterProfile = await this.repo.findRecruiterProfileByUserId(userId)
if (!recruiterProfile) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

// Step 3: Verify the recruiter owns the job (T-12-03-02 — elevation of privilege guard)
if (job.recruiterId !== recruiterProfile.id)
  throw new DomainError('Forbidden', 'FORBIDDEN', 403)
```

**Apply to SubmitDiscUseCase:** Replace recruiter lookup with `candidateRepo.findByUserId(userId)`. Check `!profile || profile.id !== candidateId` → throw `DomainError('Forbidden', 'FORBIDDEN', 403)`. Scoring is pure arithmetic (no DB). Call `discRepo.upsert(candidateId, { scoreD, scoreI, scoreS, scoreC, dominant })`. Return `{ dominant }`.

**DomainError constructor** (domain.error.ts lines 1–11):
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

---

### `src/application/use-cases/disc/get-disc.use-case.ts` (service, request-response)

**Analog:** `src/adapters/controllers/candidate.controller.ts` `getProfile` method (lines 39–51) for the NOT_FOUND pattern.

**NOT_FOUND pattern** (candidate.controller.ts lines 39–51):
```typescript
async getProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const useCase = new GetCandidateProfileUseCase(new CandidateRepository())
  try {
    const profile = await useCase.execute(request.user.id)
    reply.status(200).send(profile)
  } catch (err) {
    if (err instanceof DomainError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code })
      return
    }
    throw err
  }
}
```

**Apply to GetDiscUseCase:** After ownership check, call `discRepo.findByCandidateId(candidateId)`. If `null` → `throw new DomainError('DISC result not found', 'NOT_FOUND', 404)`. Return `{ dominant: result.dominant as DiscDimension }`.

---

### `src/application/use-cases/disc/disc-questions.ts` (utility)

**No analog** — this is a pure constant/data file with no existing equivalent. Use a typed JSON object (not enum). Export types `DiscDimension`, `DiscOption`, `DiscQuestion`, and constant `DISC_QUESTIONS: DiscQuestion[]`. The full content is defined in RESEARCH.md Pattern 14 (lines 789–831 of 17-RESEARCH.md). This file is only consumed if a future endpoint exposes questions to the frontend — not required for v3.0 POST/GET flow.

---

### `prisma/schema.prisma` — additive modifications

**Pattern:** All existing models use `@id @default(uuid())`, nullable optionals with `?`, FK relations with `onDelete: Cascade`, and `@@index` for common query patterns.

**Job model extension** — add one nullable field before closing brace:
```prisma
discProfile    String?   // DISC-03: optional desired DISC profile (D/I/S/C)
```

**New DiscResult model** — append to end of schema:
```prisma
model DiscResult {
  id          String           @id @default(uuid())
  candidateId String           @unique
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  scoreD      Int
  scoreI      Int
  scoreS      Int
  scoreC      Int
  dominant    String           // 'D' | 'I' | 'S' | 'C'
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
}
```

**CandidateProfile relation field** — add inside the model:
```prisma
discResult   DiscResult?
```

Two separate migrations. Job migration first (additive field on existing table), DiscResult migration second (new table).

---

### `src/domain/interfaces/recommendation.repository.interface.ts` — modify

**Current shape** (lines 1–26):
```typescript
export interface FitScoreInput {
  id: string
  professionId: string
  skillIds: string[]
  lat: number | null
  lng: number | null
  preferredModalities: string[]
  salaryExpectation: number | null
  searchRadiusKm: number
}

export interface FitScoreJobInput {
  id: string
  professionId: string
  requiredSkillIds: string[]
  lat: number | null
  lng: number | null
  modality: string
  salaryMin: number | null
  salaryMax: number | null
}
```

**Add optional fields at end of each interface** — must be `?` to not break existing `satisfies` checks (Pitfall 2):
```typescript
// FitScoreInput — add:
discDominant?: string | null  // DISC-04: candidate's dominant DISC profile, if completed

// FitScoreJobInput — add:
discProfile?: string | null   // DISC-03: job's desired DISC profile, if any
```

---

### `src/domain/interfaces/swipe.repository.interface.ts` — modify

**Current SwipeWithCandidateInfo** (lines 6–13):
```typescript
export interface SwipeWithCandidateInfo {
  id: string
  candidateId: string
  jobId: string
  direction: SwipeDirection
  swipedAt: Date
  candidate: CandidateProfile & { avatarUrl: string | null }
}
```

**Extend intersection type** — add `discDominant` alongside `avatarUrl`:
```typescript
candidate: CandidateProfile & { avatarUrl: string | null; discDominant: string | null }
```

Also update `ISwipeRepository.findSwipesByJobId` return type (same file line 29) — it already returns `Promise<SwipeWithCandidateInfo[]>` so the interface method signature is correct once the type is extended.

---

### `src/adapters/services/recommendation.repository.ts` — modify

**Current tail of `computeFitScore`** (lines 92–99):
```typescript
return Math.round(
  (professionScore * 0.30 +
    skillsScore * 0.35 +
    locationScore * 0.20 +
    modalityScore * 0.10 +
    salaryScore * 0.05) *
    100,
)
```

**Replace with D-05 redistribution** — insert before the return, replace return expression:
```typescript
// Factor 6: DISC personality match (DISC-04)
// Active ONLY when job declares a discProfile — otherwise discWeight = 0 and original weights apply
const hasDiscRequirement = job.discProfile != null
const discScore =
  hasDiscRequirement && candidate.discDominant != null && candidate.discDominant === job.discProfile
    ? 1.0
    : 0.0

// Weight redistribution: when job has discProfile, original 5 factors scale to 90% to free 10% for DISC (D-05)
const w = hasDiscRequirement ? 0.9 : 1.0

return Math.round(
  (professionScore * 0.30 * w +
    skillsScore * 0.35 * w +
    locationScore * 0.20 * w +
    modalityScore * 0.10 * w +
    salaryScore * 0.05 * w +
    discScore * 0.10) *
    100,
)
```

**Pitfall 7 guard:** Spot-check: all factors 1.0 + discProfile + DISC match → `(0.27+0.315+0.18+0.09+0.045+0.10)*100 = 100`. All factors 1.0 + no discProfile → `(0.30+0.35+0.20+0.10+0.05)*100 = 100`.

---

### `src/application/use-cases/swipe/get-ranking.use-case.ts` — modify (two touch points)

**Touch point 1: CensoredProfile interface** (lines 19–27):
```typescript
export interface CensoredProfile {
  name: null
  avatarUrl: null
  bio: null
  matchingSkills: string[]
  fitReasons: string[]
}
```

**Extend** — add optional field:
```typescript
discProfile?: string   // DISC-02: present ONLY when candidate completed assessment (D-06)
```

**Touch point 2: `censorProfile()` locked branch** (lines 92–103):
```typescript
// DISLIKE + locked: preview only — no identity (REC-01, REC-02, REC-03)
const matchingSkills = swipe.candidate.skills.filter(s => job.requiredSkills.includes(s))
const fitReasons = buildFitReasons(swipe.candidate, job, matchingSkills)

return {
  name: null,
  avatarUrl: null,
  bio: null,
  matchingSkills,
  fitReasons,
}
```

**Extend** — replace the return block with conditional property assignment (D-06: field absent, not null):
```typescript
const censored: CensoredProfile = {
  name: null,
  avatarUrl: null,
  bio: null,
  matchingSkills,
  fitReasons,
}

// D-06: omit discProfile field entirely when candidate has not completed assessment
if (swipe.candidate.discDominant != null) {
  censored.discProfile = swipe.candidate.discDominant
}

return censored
```

**Touch point 3: FitScoreInput construction** (lines 153–162) — add `discDominant`:
```typescript
discDominant: swipe.candidate.discDominant ?? null,  // DISC-04
```

**Touch point 4: FitScoreJobInput construction** (lines 163–172) — add `discProfile`:
```typescript
discProfile: job.discProfile ?? null,   // DISC-03
```

**Note on `censorProfile` function signature** (line 72–76): The function receives `swipe` whose `candidate` now has `discDominant` via the extended `SwipeWithCandidateInfo` intersection type. No explicit parameter addition needed — TypeScript will flow the type through structurally.

---

### `src/adapters/repositories/swipe.repository.ts` — modify (two touch points)

**Touch point 1: `findSwipesByJobId` include** (lines 72–79):
```typescript
const rows = await prisma.swipe.findMany({
  where: { jobId },
  include: {
    candidate: {
      include: { user: { select: { avatarUrl: true } } },
    },
  },
})
```

**Extend include** — add `discResult`:
```typescript
include: {
  candidate: {
    include: {
      user: { select: { avatarUrl: true } },
      discResult: { select: { dominant: true } },  // DISC-02/04
    },
  },
},
```

**Touch point 2: return mapping** (lines 80–91) — add `discDominant` alongside `avatarUrl` (Pitfall 10):
```typescript
return rows.map((row) => ({
  id: row.id,
  candidateId: row.candidateId,
  jobId: row.jobId,
  direction: row.direction as SwipeDirection,
  swipedAt: row.swipedAt,
  candidate: {
    ...this.toCandidateDomain(row.candidate),
    avatarUrl: row.candidate.user.avatarUrl,
    discDominant: row.candidate.discResult?.dominant ?? null,  // flatten nested relation
  },
}))
```

**Also add `discProfile` to `toJobDomain`** (lines 116–134) — add after `createdAt`:
```typescript
discProfile: row.discProfile ?? null,
```

---

### `src/adapters/controllers/job.controller.ts` — modify

**Current CreateJobSchema** (lines 18–29) and **UpdateJobSchema** (lines 33–44) do not include `discProfile`.

**Pattern from existing enum field** (modality field):
```typescript
modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']),
```

**Add to both schemas** — add after `expiresAt` (CreateJobSchema) / after `expiresAt` (UpdateJobSchema):
```typescript
// CreateJobSchema addition:
discProfile: z.enum(['D', 'I', 'S', 'C']).optional().nullable(),

// UpdateJobSchema addition (already optional):
discProfile: z.enum(['D', 'I', 'S', 'C']).optional().nullable(),
```

This prevents free-form strings from entering the database and breaking the DISC weight calculation.

---

### `src/domain/entities/job.entity.ts` — modify

**Current interface** (lines 1–19):
```typescript
export interface Job {
  id: string
  // ...
  isActive: boolean
  createdAt: Date
}
```

**Add after `createdAt`:**
```typescript
discProfile?: string | null   // DISC-03: optional desired DISC profile
```

---

### `src/app.ts` — modify

**Route registration pattern** (lines 62–67):
```typescript
await app.register(healthRoutes)
await app.register(authRoutes, { prefix: '/auth' })
await app.register(candidateRoutes, { prefix: '/candidates', cache: redisAdapter })
await app.register(companyRoutes, { prefix: '/companies' })
await app.register(recruiterRoutes, { prefix: '/recruiters' })
await app.register(jobRoutes, { prefix: '/jobs' })
```

**Add after `candidateRoutes` registration** — no opts needed (no cache injection):
```typescript
import { discRoutes } from './infrastructure/http/routes/disc.routes'
// ...
await app.register(discRoutes, { prefix: '/candidates' })
```

**Important:** Import must be added to the import block at top of file (line 11 area). Register under `/candidates` prefix so routes resolve to `/candidates/:id/disc`.

---

### `tests/helpers/setup.ts` — modify

**Current afterEach teardown order** (lines 24–41):
```typescript
afterEach(async () => {
  // ...
  await prisma.swipe.deleteMany()
  await prisma.unlock.deleteMany()
  await prisma.creditTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.recruiterProfile.deleteMany()
  await prisma.company.deleteMany()
  await prisma.candidateProfile.deleteMany()   // ← insert discResult BEFORE this
  await prisma.user.deleteMany()
})
```

**Insert before `candidateProfile.deleteMany()`** — DiscResult FK points to CandidateProfile:
```typescript
await prisma.discResult.deleteMany()     // FK: discResult → candidateProfile
await prisma.candidateProfile.deleteMany()
```

---

### `tests/unit/disc.use-cases.test.ts` (test)

**Analog:** `tests/unit/get-ranking.use-case.test.ts` (lines 1–64) — for mock factory pattern.

**Mock factory pattern** (get-ranking.use-case.test.ts lines 6–26):
```typescript
const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
} as jest.Mocked<ISwipeRepository>)
```

**Apply to disc tests:** Create `makeDiscRepo(): jest.Mocked<IDiscRepository>` with `upsert: jest.fn()` and `findByCandidateId: jest.fn()`. Create `makeCandidateRepo(): jest.Mocked<ICandidateRepository>` with `upsertProfile: jest.fn()` and `findByUserId: jest.fn()`. Tests cover: scoring logic (D=3, I=1 → dominant D), tie-break (D=2, I=2 → dominant D), upsert called once, auth FORBIDDEN when profile.id !== candidateId, NOT_FOUND on getDisc with no result.

**Test structure pattern** (get-ranking.use-case.test.ts lines 66–80):
```typescript
describe('GetRankingUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns cached result (cache HIT) without calling repo.findSwipesByJobId or rec.computeFitScore', async () => {
    const repo = makeSwipeRepo()
    // ...
    const uc = new GetRankingUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', 'job-1')
    // expect(...)
  })
})
```

---

### `tests/integration/disc.test.ts` (test)

**Analog:** `tests/integration/candidate.test.ts` (lines 1–80) — exact structure match.

**Integration test structure** (candidate.test.ts lines 1–27):
```typescript
import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser } from '../helpers/factories'

describe('Candidate Routes — Integration', () => {
  it('401 para requisição sem Authorization header', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const response = await supertest(app.server).get('/candidates/me')
    expect(response.status).toBe(401)
    await app.close()
  })

  async function loginAsCandidate(app, email?) {
    const userEmail = email ?? `candidate-${Date.now()}@test.com`
    const res = await supertest(app.server)
      .post('/auth/register')
      .send({ email: userEmail, password: 'password123', role: 'CANDIDATE' })
    return res.body.accessToken
  }
```

**Apply to disc.test.ts:** Import `setup`, `buildApp`, `supertest`. Helper `loginAsCandidate` is identical. Must first `PUT /candidates/me` to create a CandidateProfile (disc.repository needs the candidateId to exist). Then extract `candidateId` from that response. Then `POST /candidates/:candidateId/disc`. Cover: 200 submit, 200 get, 404 get-before-submit, 200 retake (second POST returns updated dominant), 403 wrong user.

---

## Shared Patterns

### Authentication + Authorization
**Source:** `src/infrastructure/http/plugins/authenticate.hook.ts` + `src/infrastructure/http/plugins/require-role.hook.ts`
**Apply to:** `disc.routes.ts` preHandler array — both hooks always together for protected routes.
```typescript
{ preHandler: [authenticate, requireRole('CANDIDATE')] }
```

### Error Handling (Controller Layer)
**Source:** `src/adapters/controllers/candidate.controller.ts` (lines 30–36)
**Apply to:** `disc.controller.ts` — both `submitDisc` and `getDisc` methods.
```typescript
try {
  const result = await useCase.execute(...)
  reply.status(200).send(result)
} catch (err) {
  if (err instanceof DomainError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code })
    return
  }
  throw err
}
```

### Ownership Authorization (Use Case Layer)
**Source:** `src/application/use-cases/swipe/get-ranking.use-case.ts` (lines 114–125)
**Apply to:** `submit-disc.use-case.ts` and `get-disc.use-case.ts` — first action inside `execute()`.
```typescript
const profile = await this.candidateRepo.findByUserId(userId)
if (!profile || profile.id !== candidateId) {
  throw new DomainError('Forbidden', 'FORBIDDEN', 403)
}
```

### Upsert Pattern
**Source:** `src/adapters/repositories/candidate.repository.ts` (lines 21–27)
**Apply to:** `disc.repository.ts` — `upsert()` method.
```typescript
const row = await prisma.discResult.upsert({
  where: { candidateId },
  create: { candidateId, ...data },
  update: { ...data },
})
```

### toDomain Mapper
**Source:** `src/adapters/repositories/candidate.repository.ts` (lines 34–48)
**Apply to:** `disc.repository.ts` — `private toDomain(row: any): DiscResult`.

### Route Registration
**Source:** `src/app.ts` (lines 62–74) — `await app.register(route, { prefix: '...' })` pattern.
**Apply to:** discRoutes registration — `await app.register(discRoutes, { prefix: '/candidates' })`.

### Conditional Field Omit (D-06)
**Source:** No existing analog — new pattern for this phase.
**Apply to:** `censorProfile()` locked branch in `get-ranking.use-case.ts`.
```typescript
// CORRECT — field absent when null:
if (swipe.candidate.discDominant != null) {
  censored.discProfile = swipe.candidate.discDominant
}

// WRONG — do NOT use:
// censored.discProfile = swipe.candidate.discDominant ?? null
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/application/use-cases/disc/disc-questions.ts` | utility | — | Pure data constant file; no comparable constant-exporting module exists in the codebase |

---

## Critical Pitfall Index

From RESEARCH.md — highest-priority pitfalls for the planner to surface in task descriptions:

| # | File(s) | Pitfall | Mitigation |
|---|---------|---------|------------|
| P1 | `get-ranking.use-case.ts` | `discProfile: null` in JSON (D-06 violation) | Use `if (x != null) { obj.field = x }` — never `field: x ?? null` |
| P2 | `recommendation.repository.interface.ts` | Required field on FitScoreInput breaks `satisfies` | Declare `discDominant?` and `discProfile?` with `?` |
| P3 | `swipe.repository.interface.ts` | Concrete class extends return type but interface not updated | Edit ISwipeRepository interface first |
| P4 | `submit-disc.use-case.ts` | Importing Prisma in use case fails check-deps.ts | Use cases import only `IDiscRepository`; Prisma only in adapters |
| P7 | `recommendation.repository.ts` | Adding DISC weight without reducing others → total > 100 | Use `w = hasDiscRequirement ? 0.9 : 1.0` multiplier |
| P10 | `swipe.repository.ts` | `toCandidateDomain` spread loses `discDominant` from Prisma row | Add `discDominant` explicitly outside toCandidateDomain spread, same as `avatarUrl` |

---

## Metadata

**Analog search scope:** `src/domain/`, `src/application/`, `src/adapters/`, `src/infrastructure/http/`, `tests/`
**Files read:** 18
**Pattern extraction date:** 2026-05-29
