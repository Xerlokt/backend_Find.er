# Phase 17: DISC Personality Assessment — Research

**Researched:** 2026-05-29
**Domain:** DISC assessment integration — Prisma schema extension, Clean Architecture use cases, fit score weight redistribution, censorProfile extension
**Confidence:** HIGH (all findings verified directly from codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** 4 forced-choice questions, 4 options each (D/I/S/C). Score per dimension = number of times that dimension was selected (0–4).
- **D-02:** Questions and options in PT-BR.
- **D-03:** Tie-breaking order D > I > S > C. Deterministic and simple to implement/test.
- **D-04:** `POST /candidates/:id/disc` always upserts (retake allowed; no lock after first submission).
- **D-05:** Fit score weight redistribution when job has `discProfile`:
  - profession: 27% (was 30%), skills: 31.5% (was 35%), location: 18% (was 20%), modality: 9% (was 10%), salary: 4.5% (was 5%), DISC: 10% (new).
  - Without `discProfile`: original weights unchanged (30/35/20/10/5), DISC weight = 0.
  - Match: `candidate.discDominant === job.discProfile` → discScore = 1.0 → contributes 10 points.
  - Mismatch or candidate without DISC → discScore = 0.0 → no penalty.
- **D-06:** `CensoredProfile` includes `discProfile: string` only when candidate completed assessment. If null, field is omitted entirely (not `discProfile: null`).

### Claude's Discretion

- Exact content of the 4 PT-BR questions and 16 options.
- Exact Prisma `DiscResult` model structure (fields, indexes, relation with CandidateProfile).
- Names for FitScoreInput extensions (`discDominant?: string | null`) and FitScoreJobInput (`discProfile?: string | null`).
- Authorization logic for `POST /candidates/:id/disc` (JWT user must own the candidateId or be ADMIN).
- Whether `discProfile` also appears in `FullProfile` in the ranking (not required by success criteria — only DISC-02 mentions CensoredProfile).
- Name and location of the question/options constant in code.

### Deferred Ideas (OUT OF SCOPE)

- DISC with 28 full forced-choice questions.
- Showing raw scores (D/I/S/C individual) to candidate — only dominant in v3.0.
- Co-dominant DISC profile (e.g., "DI") on tie — replaced by D > I > S > C priority order.
- discProfile in FullProfile in ranking — not required by success criteria.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | Candidate can complete simplified DISC assessment (4 questions, 1 per dimension D/I/S/C) | SubmitDiscUseCase, POST /candidates/:id/disc, DiscResult Prisma model |
| DISC-02 | DISC result (dominant profile: D/I/S/C) saved to candidate profile and visible on censored card | censorProfile() extension (D-06), CensoredProfile type extension |
| DISC-03 | Job can have optional desired DISC profile (optional field; default = no preference) | Job entity + schema extension (`discProfile String?`), FitScoreJobInput extension |
| DISC-04 | DISC enters fit score as additive factor of up to 10% only when job has defined profile | computeFitScore() extension with D-05 weight redistribution |
</phase_requirements>

---

## Summary

Phase 17 adds a 4-question DISC personality assessment to the candidate flow. The implementation touches five distinct areas of the existing Clean Architecture codebase: (1) Prisma schema — two additive migrations; (2) domain layer — one new entity file, one new interface file, extensions to two existing interfaces; (3) application layer — two new use cases plus extensions to `censorProfile()`; (4) adapter layer — one new repository adapter plus an extension to `computeFitScore()`; (5) infrastructure layer — two new route registrations and one controller extension.

The most load-bearing decision is D-05 (weight redistribution): when a job has `discProfile`, the existing five factors scale down proportionally by 10% to free up weight for DISC — the math is exact integer multiples of 0.9. The second critical concern is D-06: the `discProfile` field must be omitted from the JSON response entirely (not null) when the candidate has not completed the assessment. TypeScript's structural typing requires a deliberate omit pattern since the existing `CensoredProfile` interface has all required fields declared.

**Primary recommendation:** Follow the existing upsert pattern from `CandidateRepository` exactly. Add `discDominant` to `SwipeWithCandidateInfo` via the `SwipeRepository.findSwipesByJobId` include — that is the only place DISC data needs to flow into the ranking pipeline.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Submit DISC answers (score + dominant calc) | Application (use case) | — | Pure domain logic; no DB shape leak |
| DISC persistence (upsert DiscResult) | Adapters (DiscRepository) | Domain (IDiscRepository) | Prisma lives in adapters only |
| DISC retrieval by candidate | Adapters (DiscRepository) | Application (use case) | Repository pattern; use case mediates |
| discProfile on censored card (DISC-02) | Application (censorProfile) | — | Single code path rule already established |
| Job discProfile field | Adapters (JobRepository toDomain) | Domain (Job entity) | Schema extension → entity extension → adapter mapping |
| Fit score weight redistribution (DISC-04) | Adapters (RecommendationRepository) | Domain (FitScoreInput/JobInput interfaces) | computeFitScore lives in adapters/services |
| Auth check (candidateId ownership) | Application (use case) | Infrastructure (routes) | Business rule; routes provide JWT context |

---

## Standard Stack

### Core (no additions required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | Project-installed | DiscResult model, Job.discProfile field | All DB access must go through Prisma (CLAUDE.md) |
| Zod | Project-installed | Input validation for POST /candidates/:id/disc body | Required on all endpoints (CLAUDE.md security rules) |
| Fastify 4 | Project-installed | Route registration | Existing infrastructure |
| Jest 29 + Supertest | Project-installed | Unit + integration tests | TDD required (CLAUDE.md) |
| TypeScript 5 | Project-installed | All new files | Full project requirement |

No new npm packages are required for Phase 17. All capabilities are covered by the existing stack.

**No installation step needed.**

---

## Architecture Patterns

### System Architecture Diagram — DISC Data Flow

```
POST /candidates/:id/disc
        |
        v
[authenticate + requireRole('CANDIDATE')]
        |
        v
[DiscController.submitDisc]
  - Zod parse body (answers[4])
  - check request.user.id owns candidateId (lookup CandidateProfile by userId)
        |
        v
[SubmitDiscUseCase.execute(candidateId, answers[])]
  - compute scoreD, scoreI, scoreS, scoreC
  - determine dominant via D > I > S > C tie-break
  - call IDiscRepository.upsert(candidateId, scores, dominant)
        |
        v
[DiscRepository.upsert]  ← prisma.discResult.upsert({ where: { candidateId }, ... })
        |
        v
[returns { dominant: 'D'|'I'|'S'|'C' }]


GET /candidates/:id/disc
        |
        v
[authenticate + requireRole('CANDIDATE')]
        |
        v
[DiscController.getDisc]
  - check request.user.id owns candidateId
        |
        v
[GetDiscUseCase.execute(candidateId)]
  - call IDiscRepository.findByCandidateId(candidateId)
  - if null → throw DomainError('NOT_FOUND', 404)
        |
        v
[returns { dominant: string }]


GET /jobs/:id/ranking  (existing — extended)
        |
        v
[GetRankingUseCase] — existing flow extended at two points:
  1. findSwipesByJobId returns SwipeWithCandidateInfo with discDominant
  2. FitScoreInput now includes discDominant?: string | null
  3. FitScoreJobInput now includes discProfile?: string | null
        |
        v
[computeFitScore] — if job.discProfile:
    weights reduced to 0.9x for original 5 factors
    discScore = (candidate.discDominant === job.discProfile) ? 1.0 : 0.0
    result += discScore * 0.10 * 100
        |
        v
[censorProfile()] — extended:
    if isRevealed (FullProfile): no change (discProfile not in FullProfile per deferred)
    if locked (CensoredProfile): conditionally add discProfile if discDominant present
```

### Recommended Project Structure (new files only)

```
src/
├── domain/
│   ├── entities/
│   │   └── disc-result.entity.ts        # NEW — DiscResult entity interface
│   └── interfaces/
│       └── disc.repository.interface.ts # NEW — IDiscRepository
├── application/
│   └── use-cases/
│       └── disc/
│           ├── submit-disc.use-case.ts  # NEW — SubmitDiscUseCase
│           ├── get-disc.use-case.ts     # NEW — GetDiscUseCase
│           └── disc-questions.ts        # NEW — PT-BR question bank constant
├── adapters/
│   ├── controllers/
│   │   └── disc.controller.ts           # NEW — DiscController
│   └── repositories/
│       └── disc.repository.ts           # NEW — DiscRepository (Prisma)
└── infrastructure/
    └── http/
        └── routes/
            └── disc.routes.ts           # NEW — disc route registration

Modified files:
- src/domain/entities/job.entity.ts               — add discProfile?: string | null
- src/domain/interfaces/recommendation.repository.interface.ts — add DISC fields
- src/domain/interfaces/swipe.repository.interface.ts — add discDominant to SwipeWithCandidateInfo.candidate
- src/application/use-cases/swipe/get-ranking.use-case.ts — extend CensoredProfile + censorProfile()
- src/adapters/services/recommendation.repository.ts — extend computeFitScore()
- src/adapters/repositories/swipe.repository.ts    — extend findSwipesByJobId include + toCandidateDomain
- src/adapters/controllers/job.controller.ts       — add discProfile to CreateJobSchema + UpdateJobSchema
- src/app.ts                                       — register discRoutes
prisma/schema.prisma                               — DiscResult model + Job.discProfile field
```

---

## Codebase Patterns — Exact Shapes

[VERIFIED: direct read of codebase]

### Pattern 1: Prisma Schema Extension

Current `Job` model ends at line 136. Add `discProfile String?` as the last field before the closing brace:

```typescript
// prisma/schema.prisma — Job model addition
model Job {
  // ... existing fields ...
  requiredSkills String[]
  expiresAt      DateTime
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  discProfile    String?   // DISC-03: optional desired DISC profile (D/I/S/C)

  swipes  Swipe[]
  chats   Chat[]
  unlocks Unlock[]

  @@index([isActive, expiresAt])
}
```

New `DiscResult` model — to be appended to schema.prisma:

```typescript
// prisma/schema.prisma — new model
model DiscResult {
  id          String           @id @default(uuid())
  candidateId String           @unique   // one result per candidate (upsert target)
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

Also add `discResult DiscResult?` relation field to `CandidateProfile` model.

**Migration strategy:** Two separate migration files.
- Migration 1: `add_job_disc_profile` — adds `discProfile String?` to `Job` (additive, backward-compatible, no default needed since nullable).
- Migration 2: `add_disc_result` — creates `DiscResult` model (new table, fully additive).

Order matters: Job migration first (simpler), DiscResult second.

### Pattern 2: Domain Entity — DiscResult

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

### Pattern 3: IDiscRepository Interface

Follows the established pattern — no Prisma imports, only domain entities:

```typescript
// src/domain/interfaces/disc.repository.interface.ts
import { DiscResult } from '../entities/disc-result.entity'

export interface IDiscRepository {
  upsert(
    candidateId: string,
    data: { scoreD: number; scoreI: number; scoreS: number; scoreC: number; dominant: string }
  ): Promise<DiscResult>
  findByCandidateId(candidateId: string): Promise<DiscResult | null>
}
```

### Pattern 4: DiscRepository (adapter)

Follows exact pattern of `CandidateRepository` — imports `prisma` singleton, implements interface, has private `toDomain()`:

```typescript
// src/adapters/repositories/disc.repository.ts
import { prisma } from '../../infrastructure/database/prisma'
import { IDiscRepository } from '../../domain/interfaces/disc.repository.interface'
import { DiscResult } from '../../domain/entities/disc-result.entity'

export class DiscRepository implements IDiscRepository {
  async upsert(
    candidateId: string,
    data: { scoreD: number; scoreI: number; scoreS: number; scoreC: number; dominant: string }
  ): Promise<DiscResult> {
    const row = await prisma.discResult.upsert({
      where: { candidateId },
      create: { candidateId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByCandidateId(candidateId: string): Promise<DiscResult | null> {
    const row = await prisma.discResult.findUnique({ where: { candidateId } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: any): DiscResult {
    return {
      id: row.id,
      candidateId: row.candidateId,
      scoreD: row.scoreD,
      scoreI: row.scoreI,
      scoreS: row.scoreS,
      scoreC: row.scoreC,
      dominant: row.dominant,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
```

### Pattern 5: FitScoreInput / FitScoreJobInput Extension

Current interfaces (verified from `src/domain/interfaces/recommendation.repository.interface.ts`):

```typescript
// CURRENT — lines 1–21
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

Extended (optional fields — backward-compatible; all existing `satisfies FitScoreInput` checks still pass):

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
  discDominant?: string | null  // DISC-04: candidate's dominant DISC profile, if completed
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
  discProfile?: string | null   // DISC-03: job's desired DISC profile, if any
}
```

### Pattern 6: SwipeWithCandidateInfo Extension

Current shape (verified from `src/domain/interfaces/swipe.repository.interface.ts` line 6–13):

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

Extended:

```typescript
export interface SwipeWithCandidateInfo {
  id: string
  candidateId: string
  jobId: string
  direction: SwipeDirection
  swipedAt: Date
  candidate: CandidateProfile & { avatarUrl: string | null; discDominant: string | null }
}
```

This requires `SwipeRepository.findSwipesByJobId` to:
1. Include `discResult: { select: { dominant: true } }` in the Prisma include.
2. Flatten `row.candidate.discResult?.dominant ?? null` into `discDominant` in the return mapping.

### Pattern 7: computeFitScore Extension — D-05 Weight Redistribution

Current implementation (verified, lines 92–99 of `src/adapters/services/recommendation.repository.ts`):

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

Extended with D-05 proportional redistribution. The factor `0.9` is the exact scaling constant (each original weight × 0.9 frees up 10% total):

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

**Verified math:**
- With discProfile, perfect match: `(0.30+0.35+0.20+0.10+0.05) * 0.9 + 0.10 = 0.90*0.9 + 0.10 = 0.81 + 0.10 = 0.91`. Wait — that is 91, not 100.
- Correction: the intent is that ALL factors at 1.0 must yield 100. The proportional weights with DISC are 27+31.5+18+9+4.5+10 = 100. So the correct implementation is:

```typescript
const w = hasDiscRequirement ? 0.9 : 1.0

return Math.round(
  (professionScore * 0.30 * w +  // 0.27 when active
    skillsScore * 0.35 * w +       // 0.315 when active
    locationScore * 0.20 * w +     // 0.18 when active
    modalityScore * 0.10 * w +     // 0.09 when active
    salaryScore * 0.05 * w +       // 0.045 when active
    discScore * 0.10) *             // 0.10 when active
    100,
)
```

**Spot check:** All factors at 1.0, job has discProfile, candidate dominant matches:
`(0.27 + 0.315 + 0.18 + 0.09 + 0.045 + 0.10) * 100 = 1.00 * 100 = 100`. Correct.

**Spot check:** All factors at 1.0, no discProfile (`w = 1.0`, `discScore = 0.0`):
`(0.30 + 0.35 + 0.20 + 0.10 + 0.05 + 0.0) * 100 = 1.00 * 100 = 100`. Correct.

**Spot check:** All factors at 1.0, job has discProfile, candidate DISC mismatch (discScore = 0.0):
`(0.27 + 0.315 + 0.18 + 0.09 + 0.045 + 0.0) * 100 = 0.9 * 100 = 90`. Max possible score for DISC mismatch is 90. This is the expected behavior per D-05 — not a penalty, just a ceiling when DISC is declared.

### Pattern 8: CensoredProfile Extension — D-06

Current `CensoredProfile` interface (verified, lines 19–27 of `get-ranking.use-case.ts`):

```typescript
export interface CensoredProfile {
  name: null
  avatarUrl: null
  bio: null
  matchingSkills: string[]
  fitReasons: string[]
}
```

Extended — `discProfile` is optional to allow the omit pattern:

```typescript
export interface CensoredProfile {
  name: null
  avatarUrl: null
  bio: null
  matchingSkills: string[]
  fitReasons: string[]
  discProfile?: string   // DISC-02: present ONLY when candidate completed assessment (D-06)
}
```

In `censorProfile()` — the locked (DISLIKE) branch:

```typescript
// DISLIKE + locked: preview only — no identity
const matchingSkills = swipe.candidate.skills.filter(s => job.requiredSkills.includes(s))
const fitReasons = buildFitReasons(swipe.candidate, job, matchingSkills)

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

The `censorProfile` function signature must also be extended to receive `discDominant` from the swipe candidate. Since `SwipeWithCandidateInfo.candidate` is extended with `discDominant`, no additional parameter changes are needed — the value comes through `swipe.candidate.discDominant`.

### Pattern 9: DiscController

Follows the exact shape of `CandidateController`:

```typescript
// src/adapters/controllers/disc.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CandidateRepository } from '../repositories/candidate.repository'
import { DiscRepository } from '../repositories/disc.repository'
import { SubmitDiscUseCase } from '../../application/use-cases/disc/submit-disc.use-case'
import { GetDiscUseCase } from '../../application/use-cases/disc/get-disc.use-case'
import { DomainError } from '../../application/errors/domain.error'

const DiscParamsSchema = z.object({
  id: z.string().uuid(),  // candidateId
})

const SubmitDiscBodySchema = z.object({
  answers: z.array(z.enum(['D', 'I', 'S', 'C'])).length(4),
})

export class DiscController {
  async submitDisc(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: candidateId } = DiscParamsSchema.parse(request.params)
    const { answers } = SubmitDiscBodySchema.parse(request.body)
    const useCase = new SubmitDiscUseCase(new DiscRepository(), new CandidateRepository())
    try {
      const result = await useCase.execute(request.user.id, candidateId, answers)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getDisc(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: candidateId } = DiscParamsSchema.parse(request.params)
    const useCase = new GetDiscUseCase(new DiscRepository(), new CandidateRepository())
    try {
      const result = await useCase.execute(request.user.id, candidateId)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
```

### Pattern 10: disc.routes.ts

```typescript
// src/infrastructure/http/routes/disc.routes.ts
import { FastifyInstance } from 'fastify'
import { DiscController } from '../../../adapters/controllers/disc.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'

export async function discRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new DiscController()

  app.post('/:id/disc', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.submitDisc.bind(ctrl))
  app.get('/:id/disc', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getDisc.bind(ctrl))
}
```

Registration in `src/app.ts`:

```typescript
import { discRoutes } from './infrastructure/http/routes/disc.routes'
// ...
await app.register(discRoutes, { prefix: '/candidates' })
```

### Pattern 11: SubmitDiscUseCase

```typescript
// src/application/use-cases/disc/submit-disc.use-case.ts
import { IDiscRepository } from '../../../domain/interfaces/disc.repository.interface'
import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { DiscResult, DiscDimension } from '../../../domain/entities/disc-result.entity'
import { DomainError } from '../../errors/domain.error'

export class SubmitDiscUseCase {
  constructor(
    private readonly discRepo: IDiscRepository,
    private readonly candidateRepo: ICandidateRepository,
  ) {}

  async execute(
    userId: string,
    candidateId: string,
    answers: DiscDimension[],
  ): Promise<{ dominant: DiscDimension }> {
    // Authorization: JWT user must own this candidateId (or be ADMIN — role checked at route layer)
    const profile = await this.candidateRepo.findByUserId(userId)
    if (!profile || profile.id !== candidateId) {
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    }

    // Score: count occurrences of each dimension in answers (D-01)
    const scoreD = answers.filter(a => a === 'D').length
    const scoreI = answers.filter(a => a === 'I').length
    const scoreS = answers.filter(a => a === 'S').length
    const scoreC = answers.filter(a => a === 'C').length

    // Tie-breaking: D > I > S > C (D-03)
    const maxScore = Math.max(scoreD, scoreI, scoreS, scoreC)
    let dominant: DiscDimension
    if (scoreD === maxScore) dominant = 'D'
    else if (scoreI === maxScore) dominant = 'I'
    else if (scoreS === maxScore) dominant = 'S'
    else dominant = 'C'

    await this.discRepo.upsert(candidateId, { scoreD, scoreI, scoreS, scoreC, dominant })
    return { dominant }
  }
}
```

### Pattern 12: GetDiscUseCase

```typescript
// src/application/use-cases/disc/get-disc.use-case.ts
import { IDiscRepository } from '../../../domain/interfaces/disc.repository.interface'
import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { DiscResult, DiscDimension } from '../../../domain/entities/disc-result.entity'
import { DomainError } from '../../errors/domain.error'

export class GetDiscUseCase {
  constructor(
    private readonly discRepo: IDiscRepository,
    private readonly candidateRepo: ICandidateRepository,
  ) {}

  async execute(userId: string, candidateId: string): Promise<{ dominant: DiscDimension }> {
    // Authorization: JWT user must own this candidateId
    const profile = await this.candidateRepo.findByUserId(userId)
    if (!profile || profile.id !== candidateId) {
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    }

    const result = await this.discRepo.findByCandidateId(candidateId)
    if (!result) throw new DomainError('DISC result not found', 'NOT_FOUND', 404)

    return { dominant: result.dominant as DiscDimension }
  }
}
```

### Pattern 13: Job Entity Extension

```typescript
// src/domain/entities/job.entity.ts — add discProfile field
export interface Job {
  // ... existing fields ...
  requiredSkills: string[]
  expiresAt: Date
  isActive: boolean
  createdAt: Date
  discProfile?: string | null   // DISC-03: optional desired DISC profile
}
```

`JobRepository.toDomain()` must map `discProfile: row.discProfile` (or `row.discProfile ?? null`).

`JobController.CreateJobSchema` and `UpdateJobSchema` must add:
```typescript
discProfile: z.enum(['D', 'I', 'S', 'C']).optional().nullable(),
```

### Pattern 14: GetRankingUseCase Extension — FitScoreInput construction

In `get-ranking.use-case.ts`, the `FitScoreInput` construction block (current lines 153–164) must add `discDominant`:

```typescript
{
  id: swipe.candidate.id,
  professionId: swipe.candidate.professionId,
  skillIds: swipe.candidate.skills,
  preferredModalities: swipe.candidate.preferredModalities,
  salaryExpectation: swipe.candidate.salaryExpectation ?? null,
  lat: swipe.candidate.lat ?? null,
  lng: swipe.candidate.lng ?? null,
  searchRadiusKm: swipe.candidate.searchRadiusKm ?? 50,
  discDominant: swipe.candidate.discDominant ?? null,  // DISC-04 (optional field)
} satisfies FitScoreInput,
```

And `FitScoreJobInput` construction (current lines 163–172) must add `discProfile`:

```typescript
{
  id: job.id,
  professionId: job.professionId,
  requiredSkillIds: job.requiredSkills,
  modality: job.modality,
  salaryMin: job.salaryMin ?? null,
  salaryMax: job.salaryMax ?? null,
  lat: job.lat ?? null,
  lng: job.lng ?? null,
  discProfile: job.discProfile ?? null,   // DISC-03 (optional field)
} satisfies FitScoreJobInput,
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tie-breaking dominant | Custom sorting/ranking logic | Simple if/else chain (D-03) | Already locked: D > I > S > C ordered comparison |
| Upsert | Manual find-then-insert | `prisma.discResult.upsert({ where: { candidateId } })` | Established pattern in CandidateRepository; handles race conditions |
| Auth ownership check | HTTP middleware | Application use case checks `candidateRepo.findByUserId(userId)` then `profile.id === candidateId` | Pattern established in swipe/credits use cases; business rule belongs in application layer |
| JSON field omit | `JSON.stringify` replacer | TypeScript conditional property assignment (`if (x != null) { obj.field = x }`) | D-06 requirement; conditional spread is error-prone with optional fields in strict TS |
| DISC weight math | Dynamic weight calculation | Hardcoded `w = hasDiscRequirement ? 0.9 : 1.0` multiplier | Math is fixed per D-05; no runtime variability needed |
| Migration ordering | Single combined migration | Two separate migrations | Additive-first principle; Job migration can be deployed independently; safer rollback |

---

## Question Bank — PT-BR Forced-Choice (D-02, Claude's Discretion)

The question bank is a TypeScript constant — JSON-typed object, no enum, for easy serialization if frontend needs to render the form (noted in CONTEXT.md specifics).

```typescript
// src/application/use-cases/disc/disc-questions.ts

export type DiscDimension = 'D' | 'I' | 'S' | 'C'

export interface DiscOption {
  dimension: DiscDimension
  text: string
}

export interface DiscQuestion {
  id: number
  text: string
  options: DiscOption[]  // always exactly 4, one per dimension
}

export const DISC_QUESTIONS: DiscQuestion[] = [
  {
    id: 1,
    text: 'Em situações de trabalho, eu costumo ser:',
    options: [
      { dimension: 'D', text: 'Determinado e direto ao ponto' },
      { dimension: 'I', text: 'Entusiasta e sociável' },
      { dimension: 'S', text: 'Paciente e colaborativo' },
      { dimension: 'C', text: 'Analítico e cuidadoso com os detalhes' },
    ],
  },
  {
    id: 2,
    text: 'Quando enfrento um problema no trabalho, eu prefiro:',
    options: [
      { dimension: 'D', text: 'Tomar uma decisão rápida e agir imediatamente' },
      { dimension: 'I', text: 'Conversar com a equipe e gerar novas ideias juntos' },
      { dimension: 'S', text: 'Seguir processos estabelecidos e trabalhar com calma' },
      { dimension: 'C', text: 'Analisar todas as informações antes de decidir' },
    ],
  },
  {
    id: 3,
    text: 'As pessoas ao meu redor me descrevem como alguém:',
    options: [
      { dimension: 'D', text: 'Competitivo e orientado a resultados' },
      { dimension: 'I', text: 'Comunicativo e otimista' },
      { dimension: 'S', text: 'Confiável e de bom relacionamento' },
      { dimension: 'C', text: 'Preciso e organizado' },
    ],
  },
  {
    id: 4,
    text: 'No ambiente de trabalho, o que mais me motiva é:',
    options: [
      { dimension: 'D', text: 'Superar desafios e alcançar metas ambiciosas' },
      { dimension: 'I', text: 'Colaborar com pessoas e criar um clima positivo' },
      { dimension: 'S', text: 'Ter estabilidade e um ambiente harmonioso' },
      { dimension: 'C', text: 'Trabalhar com exatidão e qualidade' },
    ],
  },
]
```

The endpoint `POST /candidates/:id/disc` accepts `answers: ['D', 'I', 'S', 'C']` — an array of 4 dimension letters corresponding to the selected option for each question (by position). The question bank constant is only needed at the `GET /candidates/:id/disc` endpoint if the frontend requests questions (out of scope in v3.0 — the GET endpoint returns only `{ dominant }` per DISC-01/02).

---

## Fit Score Integration — Exact Math Verification

[VERIFIED: manual calculation from D-05 locked decisions]

| Scenario | profession | skills | location | modality | salary | disc | total |
|----------|-----------|--------|----------|----------|--------|------|-------|
| No discProfile, all perfect | 30 | 35 | 20 | 10 | 5 | 0 | **100** |
| Has discProfile, all perfect, DISC match | 27 | 31.5 | 18 | 9 | 4.5 | 10 | **100** |
| Has discProfile, all perfect, DISC mismatch | 27 | 31.5 | 18 | 9 | 4.5 | 0 | **90** |
| Has discProfile, all perfect, no DISC data | 27 | 31.5 | 18 | 9 | 4.5 | 0 | **90** |

Key insight: the maximum score drops to 90 (not 100) when a job declares `discProfile` and the candidate either hasn't completed the assessment or mismatches. This is the intended design per D-05 — mismatch incurs no explicit penalty but reduces max attainable score by 10 points for that job. The success criterion states "no penalty" meaning the candidate is not scored below their baseline when discProfile is absent — this is upheld since the mismatch/no-DISC score (90) equals the baseline score for a perfect-profile candidate on a job without discProfile (100 without DISC declared would be lower — but wait: the baseline is the 5-factor score without DISC redistribution).

**Critical clarification:** When `discProfile` is NOT declared on the job, weights stay at 30/35/20/10/5. A perfect candidate without DISC scores 100. When `discProfile` IS declared, that same perfect candidate without DISC scores 90. This is architecturally correct: the 10% slot simply goes unfilled.

`Math.round()` preserves the existing behavior (integer fitScore 0–100).

---

## CensoredProfile Extension — D-06 Details

[VERIFIED: direct read of get-ranking.use-case.ts]

**Current CensoredProfile returned by censorProfile():**
```json
{
  "name": null,
  "avatarUrl": null,
  "bio": null,
  "matchingSkills": ["nodejs"],
  "fitReasons": ["1/2 skills match", "salary in range", "profession match"]
}
```

**After D-06 extension, when candidate HAS DISC:**
```json
{
  "name": null,
  "avatarUrl": null,
  "bio": null,
  "matchingSkills": ["nodejs"],
  "fitReasons": ["1/2 skills match", "salary in range", "profession match"],
  "discProfile": "D"
}
```

**After D-06 extension, when candidate has NO DISC:**
```json
{
  "name": null,
  "avatarUrl": null,
  "bio": null,
  "matchingSkills": ["nodejs"],
  "fitReasons": ["1/2 skills match", "salary in range", "profession match"]
}
```

The field is entirely absent — not present with `null` value. TypeScript enforces this via the optional `discProfile?: string` declaration on `CensoredProfile` and the conditional assignment pattern.

**FullProfile is unchanged** — `discProfile` does not appear in `FullProfile` per deferred decisions.

---

## Integration Point: SwipeRepository.findSwipesByJobId

The ranking pipeline's DISC data dependency flows through `SwipeRepository.findSwipesByJobId`. This is the only place the `discResult` relation needs to be joined.

Current include (verified, lines 72–79 of `swipe.repository.ts`):
```typescript
include: {
  candidate: {
    include: { user: { select: { avatarUrl: true } } },
  },
},
```

Extended:
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

The return mapping in `findSwipesByJobId` must flatten this:
```typescript
candidate: {
  ...this.toCandidateDomain(row.candidate),
  avatarUrl: row.candidate.user.avatarUrl,
  discDominant: row.candidate.discResult?.dominant ?? null,  // flatten nested relation
},
```

Note: `toCandidateDomain` does NOT include `discDominant` — it maps `CandidateProfile` domain entity which does not contain DISC data. The `discDominant` field is added alongside `avatarUrl` as an intersection type extension in `SwipeWithCandidateInfo`.

---

## Authorization Pattern

[VERIFIED: analysis of existing patterns in swipe.use-case.ts, get-candidate-profile.use-case.ts]

The DISC endpoints use the `:id` param pattern (unlike `/me` pattern used by candidate profile routes). This matches the requirement that the endpoint is `POST /candidates/:id/disc`.

Authorization check in use case (not in controller, not in route):

```typescript
// Pattern already established in SwipeRepository for candidate ownership verification
const profile = await this.candidateRepo.findByUserId(userId)
if (!profile || profile.id !== candidateId) {
  throw new DomainError('Forbidden', 'FORBIDDEN', 403)
}
```

This is the correct layer — business rule "user can only submit DISC for their own profile" is an application concern. The route layer only verifies the JWT role (`requireRole('CANDIDATE')`).

ADMIN bypass: since `requireRole('CANDIDATE')` is on the route, ADMINs would be blocked by the route guard. Per the CONTEXT.md, Claude's Discretion allows deciding whether ADMIN can bypass. Recommendation: keep CANDIDATE-only. ADMINs have no business reason to submit DISC on behalf of candidates.

---

## setup.ts Test Teardown — DiscResult Cleanup

The integration test `afterEach` in `tests/helpers/setup.ts` (verified, lines 29–41) deletes tables in FK-safe order. `DiscResult` references `CandidateProfile` — must be deleted before `candidateProfile`:

```typescript
// After adding DiscResult: insert before candidateProfile.deleteMany()
await prisma.discResult.deleteMany()     // FK: discResult → candidateProfile
await prisma.candidateProfile.deleteMany()
```

---

## Common Pitfalls

### Pitfall 1: discProfile: null in JSON Response (D-06 violation)
**What goes wrong:** Returning `{ discProfile: null }` instead of omitting the field entirely. This leaks whether the candidate has not completed the assessment in a slightly different way than intended, and breaks the type contract.
**Why it happens:** TypeScript's object spread or default null assignment.
**How to avoid:** Always use conditional property assignment: `if (result.dominant != null) { obj.discProfile = result.dominant }`. Do not use `discProfile: discDominant ?? null`.
**Warning signs:** Unit test for "candidate without DISC" expects `'discProfile' in result` to be `false`.

### Pitfall 2: FitScoreInput 'satisfies' compile error
**What goes wrong:** Adding required fields to `FitScoreInput` breaks all existing `satisfies FitScoreInput` call sites (there are currently 2 in get-ranking.use-case.ts, line 153 and 163).
**Why it happens:** The new DISC fields must be `optional` (`?`) to maintain backward compatibility.
**How to avoid:** Declare `discDominant?: string | null` and `discProfile?: string | null` (optional). This is confirmed safe because all existing code passes `satisfies FitScoreInput` — adding optional fields does not break structural compatibility.
**Warning signs:** `tsc` error at the `satisfies` check sites.

### Pitfall 3: SwipeWithCandidateInfo extension not reflected in ISwipeRepository
**What goes wrong:** Extending the concrete `SwipeRepository.findSwipesByJobId` return type but not updating the `ISwipeRepository` interface — TypeScript will report the concrete class no longer implements the interface.
**Why it happens:** Interface and concrete class are edited in two different files.
**How to avoid:** Edit `ISwipeRepository.findSwipesByJobId` return type first, then update the concrete implementation.

### Pitfall 4: check-deps.ts violation — importing Prisma in use case
**What goes wrong:** Importing `PrismaClient` or `@prisma/client` in `submit-disc.use-case.ts` or `get-disc.use-case.ts`.
**Why it happens:** The DiscResult model is new — temptation to inline the Prisma call directly.
**How to avoid:** Use cases import ONLY `IDiscRepository` (domain interface). `DiscRepository` (adapter) imports Prisma. This is the ARCH-06/07 rule already enforced by `check-deps.ts` and verified by `npm run check:deps`.

### Pitfall 5: Missing discResult include crashes findSwipesByJobId
**What goes wrong:** Accessing `row.candidate.discResult` when the include was not added, causing `undefined` rather than a proper null — leads to runtime error on `?.dominant` if the structure is unexpected.
**Why it happens:** Forgetting to add `discResult: { select: { dominant: true } }` to the Prisma include.
**How to avoid:** Always use `row.candidate.discResult?.dominant ?? null` (optional chaining + nullish coalescing). If include is missing, Prisma returns an object without the field — optional chaining handles gracefully.

### Pitfall 6: Migration order — DiscResult before Job.discProfile
**What goes wrong:** Running the DiscResult migration before the Job migration has no technical impact (they are independent tables) but is confusing and breaks the "additive by priority" convention.
**How to avoid:** Always run Job.discProfile migration first (alphabetically earlier conceptually; existing table addition), then DiscResult (new table).

### Pitfall 7: fitScore Math — double-counting DISC weight
**What goes wrong:** Adding `discScore * 0.10` without reducing the other weights — total exceeds 100 when all factors are 1.0.
**Why it happens:** Forgetting the D-05 redistribution rule; adding DISC as a 6th factor naively.
**How to avoid:** Use the `w = hasDiscRequirement ? 0.9 : 1.0` multiplier on all existing factors. Verify with unit test: all factors 1.0 + discProfile + DISC match = 100.

### Pitfall 8: Stale ranking cache after DISC submission
**What goes wrong:** Candidate submits DISC, but the recruiter's ranking response still shows the old censored card without `discProfile` until cache TTL expires (30s).
**Why it happens:** `SubmitDiscUseCase` does not call `cache.invalidatePattern('ranking:*')`.
**How to avoid:** Decide during planning whether DISC submission should invalidate ranking cache. Option A: always invalidate `ranking:*` (same as profile update). Option B: accept 30s stale ranking (simpler; DISC is not frequently re-submitted). Recommendation: Option B — ranking cache TTL is 30s, acceptable staleness for an infrequent action. Document this as a known behavior. If chosen, do NOT inject ICachePort into SubmitDiscUseCase.

### Pitfall 9: answers[] position vs. dimension mapping confusion
**What goes wrong:** Treating `answers[0]` as "answer to question 1" which must be validated against question 1's options. If the validation is too strict, it rejects valid answers.
**Why it happens:** Over-thinking the API contract.
**How to avoid:** The API contract is simple: `answers` is an array of 4 dimension letters (`D|I|S|C`), one per question position (index 0 = Q1, index 1 = Q2, etc.). The backend scores by counting dimension letters — does NOT validate that answer[0] is a valid option for question 1. The frontend is responsible for rendering questions and mapping option clicks to dimension letters.

### Pitfall 10: toCandidateDomain() in SwipeRepository won't include discDominant
**What goes wrong:** Calling `this.toCandidateDomain(row.candidate)` and spreading it — `toCandidateDomain` returns `CandidateProfile` which has no `discDominant`. If you rely on spread, `discDominant` from the Prisma row gets lost.
**Why it happens:** The existing spread pattern in `findSwipesByJobId` returns.
**How to avoid:** Add `discDominant` explicitly alongside `avatarUrl` in the return object — outside the `toCandidateDomain` spread, same as how `avatarUrl` is currently handled (it's also not in `CandidateProfile` entity, it's added as a spread extension).

---

## Environment Availability

Step 2.6: SKIPPED — Phase 17 has no external dependencies beyond the existing project stack. All required tools (Prisma, PostgreSQL, Neo4j, Jest, Fastify) are already validated by previous phases.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest tests/unit/disc --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | POST /candidates/:id/disc returns 200 with dominant | integration | `npx jest tests/integration/disc --no-coverage` | ❌ Wave 0 |
| DISC-01 | SubmitDiscUseCase computes correct dominant | unit | `npx jest tests/unit/submit-disc --no-coverage` | ❌ Wave 0 |
| DISC-01 | SubmitDiscUseCase D>I>S>C tie-break (D=I, dominant=D) | unit | above | ❌ Wave 0 |
| DISC-01 | SubmitDiscUseCase returns 403 when user doesn't own candidateId | unit | above | ❌ Wave 0 |
| DISC-01 | GET /candidates/:id/disc returns 200 with dominant after submit | integration | above | ❌ Wave 0 |
| DISC-01 | GET /candidates/:id/disc returns 404 when no result | integration | above | ❌ Wave 0 |
| DISC-01 | POST twice (retake) returns updated dominant (upsert) | integration | above | ❌ Wave 0 |
| DISC-02 | censorProfile returns discProfile when candidate has DISC | unit | `npx jest tests/unit/get-ranking --no-coverage` | ✅ (extend existing) |
| DISC-02 | censorProfile omits discProfile field when candidate has no DISC | unit | above | ✅ (extend existing) |
| DISC-02 | ranking response includes discProfile in censored card (E2E integration) | integration | `npx jest tests/integration/disc --no-coverage` | ❌ Wave 0 |
| DISC-03 | POST /jobs with discProfile=D creates job with field | integration | `npx jest tests/integration/job-routes --no-coverage` | ✅ (extend existing) |
| DISC-03 | job without discProfile has discWeight=0 in computeFitScore | unit | `npx jest tests/unit/recommendation.service --no-coverage` | ✅ (extend existing) |
| DISC-04 | computeFitScore with discProfile + match = 100 when all factors perfect | unit | above | ✅ (extend existing) |
| DISC-04 | computeFitScore with discProfile + mismatch = 90 when all factors perfect | unit | above | ❌ Wave 0 |
| DISC-04 | computeFitScore without discProfile = 100 when all factors perfect (no regression) | unit | above | ✅ (existing test) |

### Sampling Rate

- **Per task commit:** `npx jest tests/unit --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/submit-disc.use-case.test.ts` — covers DISC-01 use case logic (scoring, tie-break, auth)
- [ ] `tests/unit/get-disc.use-case.test.ts` — covers DISC-01 get flow (NOT_FOUND, FORBIDDEN)
- [ ] `tests/integration/disc.test.ts` — covers DISC-01/02 end-to-end (POST, GET, retake, ranking integration)
- [ ] Extensions to `tests/unit/recommendation.service.test.ts` — covers DISC-03/04 weight redistribution
- [ ] Extensions to `tests/unit/get-ranking.use-case.test.ts` — covers DISC-02 censorProfile with/without discDominant

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT via `authenticate` hook — already in place |
| V3 Session Management | no | Stateless JWT; no new session concerns |
| V4 Access Control | yes | Ownership check: `candidateRepo.findByUserId(userId).id === candidateId` |
| V5 Input Validation | yes | Zod schema: `answers: z.array(z.enum(['D','I','S','C'])).length(4)` |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — submit DISC for another candidate | Elevation of Privilege | Ownership check in use case (profile.id === candidateId) |
| Bypass DISC lock (future) | Tampering | D-04: no lock; upsert always allowed — no bypass surface |
| Score manipulation via repeated answers | Tampering | Zod enforces exactly 4 answers; each must be D/I/S/C — no extra weight injection possible |
| Inject SQL via discProfile job field | Tampering | Prisma ORM; string stored as-is, only 'D'|'I'|'S'|'C' validated at controller layer |

**Note on discProfile job field:** The `CreateJobSchema` and `UpdateJobSchema` in `job.controller.ts` must validate `discProfile` as `z.enum(['D','I','S','C']).optional().nullable()` — not a free-form string — to prevent invalid DISC values from entering the database and silently causing 0% DISC weight for all candidates.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| computeFitScore: 5 factors, fixed weights | computeFitScore: 5 or 6 factors, conditional weights | Phase 17 | Test factories need `discDominant` and `discProfile` optional fields |
| CensoredProfile: 5 fields | CensoredProfile: 5 or 6 fields (discProfile optional) | Phase 17 | Existing censorProfile unit tests remain valid; new tests add DISC scenarios |
| SwipeWithCandidateInfo.candidate: CandidateProfile & { avatarUrl } | + { discDominant: string \| null } | Phase 17 | SwipeRepository.findSwipesByJobId include extended |

---

## Assumptions Log

All claims in this research were verified directly from codebase files. No unverified assumptions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `prisma.discResult.upsert` with `where: { candidateId }` works because candidateId has `@unique` | Prisma Schema Changes | Upsert would fail at runtime; fix: ensure `@@unique([candidateId])` or `@unique` on field |
| A2 | Adding optional fields to FitScoreInput does not break existing `satisfies` checks | FitScoreInput Extension | tsc error at compile time; fix: add `?` to field declarations |
| A3 | `discRoutes` registered under `/candidates` prefix means routes become `/candidates/:id/disc` | Route Registration | 404 at runtime; fix: adjust prefix or route path |

---

## Open Questions

1. **Should SubmitDiscUseCase invalidate the ranking cache?**
   - What we know: UpsertCandidateProfileUseCase calls `cache.invalidatePattern('ranking:*')`. DISC submission changes a candidate's profile data that appears in the ranking.
   - What's unclear: Scope of invalidation impact (DISC submission is rare; 30s TTL is short).
   - Recommendation: Do NOT invalidate in v3.0. Accept 30s staleness. Add a comment in SubmitDiscUseCase explaining the decision. This avoids injecting ICachePort into the use case, keeping it simpler.

2. **discProfile in GET /candidates/:id/disc response — include raw scores?**
   - What we know: CONTEXT.md defers raw score visibility. The API should return only `{ dominant }`.
   - Recommendation: Return `{ dominant: 'D' | 'I' | 'S' | 'C' }` only.

---

## Sources

### Primary (HIGH confidence)

All findings from direct codebase file reads:

- `src/domain/interfaces/recommendation.repository.interface.ts` — FitScoreInput/FitScoreJobInput current shapes
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — censorProfile, CensoredProfile, FullProfile, GetRankingUseCase current implementation
- `src/adapters/services/recommendation.repository.ts` — computeFitScore() current implementation and weight math
- `src/adapters/repositories/candidate.repository.ts` — upsert pattern, toDomain pattern
- `src/adapters/repositories/swipe.repository.ts` — findSwipesByJobId include/flatten pattern
- `src/adapters/controllers/candidate.controller.ts` — controller pattern (Zod + DomainError handler)
- `src/infrastructure/http/routes/candidate.routes.ts` — route pattern (authenticate + requireRole)
- `src/infrastructure/http/plugins/authenticate.hook.ts` — JWT user shape
- `src/infrastructure/http/plugins/require-role.hook.ts` — requireRole behavior
- `src/app.ts` — composition root and route registration pattern
- `prisma/schema.prisma` — current schema (all models)
- `scripts/check-deps.ts` — dependency rule enforcement (RULES array)
- `tests/helpers/setup.ts` — afterEach teardown order
- `tests/unit/recommendation.service.test.ts` — test factory patterns
- `tests/unit/get-ranking.use-case.test.ts` — mock patterns for recommendation
- `tests/integration/candidate.test.ts` — integration test structure
- `.planning/phases/17-disc-personality-assessment/17-CONTEXT.md` — all locked decisions
- `.planning/config.json` — nyquist_validation: true confirmed

### Secondary (MEDIUM confidence)

- DISC-01/02/03/04 from `.planning/REQUIREMENTS.md` — requirements text
- Phase 17 success criteria from `.planning/ROADMAP.md` — 5 criteria

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — project stack is fixed; no new packages needed
- Architecture: HIGH — all patterns verified from existing codebase files
- Fit score math: HIGH — manually verified with spot checks; confirmed with D-05 locked decision
- Question bank: MEDIUM — authored per D-02 (PT-BR) and D-01 (forced-choice) rules; content is Claude's Discretion
- Pitfalls: HIGH — derived from actual code shapes and established project decisions

**Research date:** 2026-05-29
**Valid until:** 2026-06-28 (30 days — stable stack, no fast-moving dependencies)
