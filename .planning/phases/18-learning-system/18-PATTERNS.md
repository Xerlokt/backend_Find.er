# Phase 18: Learning System - Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 14 (5 new, 9 modified)
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/domain/entities/candidate-weights.entity.ts` | entity | — | `src/domain/entities/disc-result.entity.ts` | exact |
| `src/domain/interfaces/weights.repository.interface.ts` | repository interface | CRUD | `src/domain/interfaces/disc.repository.interface.ts` | exact |
| `src/adapters/repositories/weights.repository.ts` | repository adapter | CRUD | `src/adapters/repositories/disc.repository.ts` | exact |
| `src/application/use-cases/swipe/weights.constants.ts` | constants | — | inline in RESEARCH.md (no prior analog) | no analog |
| `src/application/use-cases/swipe/record-swipe.use-case.ts` | use case | request-response | itself (lines 1–42) | self |
| `src/application/use-cases/swipe/get-feed.use-case.ts` | use case | request-response | itself (lines 1–66) | self |
| `src/adapters/services/recommendation.repository.ts` | service adapter | request-response | itself (lines 1–118) | self |
| `src/domain/interfaces/recommendation.repository.interface.ts` | repository interface | request-response | itself (lines 1–28) | self |
| `src/infrastructure/http/routes/swipe.routes.ts` | route / composition root | request-response | itself (lines 1–40) | self |
| `src/adapters/controllers/swipe.controller.ts` | controller | request-response | itself (lines 1–88) | self |
| `prisma/schema.prisma` | schema / migration | CRUD | `prisma/schema.prisma` DiscResult model (lines 206–217) | exact |
| `tests/helpers/setup.ts` | test helper | — | itself (lines 24–42) | self |
| `tests/unit/record-swipe.use-case.test.ts` | unit test | — | itself (lines 1–91) | self |
| `tests/unit/get-feed.use-case.test.ts` | unit test | — | itself (lines 1–131) | self |
| `tests/unit/recommendation.service.test.ts` | unit test | — | itself (lines 1–424) | self |
| `tests/integration/weights.test.ts` | integration test | CRUD | existing integration tests in `tests/integration/` | role-match |

---

## Pattern Assignments

### `src/domain/entities/candidate-weights.entity.ts` (entity)

**Analog:** `src/domain/entities/disc-result.entity.ts` (lines 1–13)

**Full analog** (lines 1–13):
```typescript
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

**Apply pattern:** Replace DISC fields with the 5 weight floats + `likeCount: number`. Export as `interface CandidateWeights`. No auxiliary type needed.

---

### `src/domain/interfaces/weights.repository.interface.ts` (repository interface, CRUD)

**Analog:** `src/domain/interfaces/disc.repository.interface.ts` (lines 1–15)

**Full analog** (lines 1–15):
```typescript
import { DiscResult } from '../entities/disc-result.entity'

export interface IDiscRepository {
  upsert(
    candidateId: string,
    data: {
      scoreD: number
      scoreI: number
      scoreS: number
      scoreC: number
      dominant: string
    }
  ): Promise<DiscResult>
  findByCandidateId(candidateId: string): Promise<DiscResult | null>
}
```

**Apply pattern:**
- Import `CandidateWeights` from `../entities/candidate-weights.entity`
- Export `WeightSet` type here (single source of truth for domain layer): `{ profession: number; skills: number; location: number; modality: number; salary: number }`
- Method name `upsertWeights` (not `upsert`) for clarity; `findByCandidateId` signature identical
- Data payload matches D-09: `professionWeight`, `skillsWeight`, `locationWeight`, `modalityWeight`, `salaryWeight`, `likeCount`

---

### `src/adapters/repositories/weights.repository.ts` (repository adapter, CRUD)

**Analog:** `src/adapters/repositories/disc.repository.ts` (lines 1–42)

**Full analog** (lines 1–42):
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { IDiscRepository } from '../../domain/interfaces/disc.repository.interface'
import { DiscResult } from '../../domain/entities/disc-result.entity'

export class DiscRepository implements IDiscRepository {
  async upsert(
    candidateId: string,
    data: {
      scoreD: number
      scoreI: number
      scoreS: number
      scoreC: number
      dominant: string
    },
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

**Apply pattern:**
- Replace `prisma.discResult` with `prisma.candidateWeights`
- Replace all DISC fields in `toDomain` with the 5 weight floats + `likeCount`
- Method `upsertWeights` maps to `prisma.candidateWeights.upsert({ where: { candidateId }, create: { candidateId, ...data }, update: { ...data } })`
- Architecture note: EMA computation stays in use case — this adapter only stores and retrieves

---

### `src/application/use-cases/swipe/weights.constants.ts` (constants)

**No analog.** New file. Pattern from RESEARCH.md:

```typescript
// src/application/use-cases/swipe/weights.constants.ts
export const GLOBAL_WEIGHT_DEFAULTS = {
  profession: 0.30,
  skills: 0.35,
  location: 0.20,
  modality: 0.10,
  salary: 0.05,
} as const

export type WeightKeys = keyof typeof GLOBAL_WEIGHT_DEFAULTS
```

**Critical:** These values are the same as the hardcoded literals in `recommendation.repository.ts` lines 110–114. Defining them here (application layer) avoids the pitfall of importing from the adapter.

---

### `src/application/use-cases/swipe/record-swipe.use-case.ts` (use case, request-response) — MODIFY

**Analog:** itself, current state (lines 1–42)

**Current imports** (lines 1–6):
```typescript
import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IChatPort } from '../../ports/chat.port'
import { ICachePort } from '../../ports/cache.port'
import { Swipe, SwipeDirection } from '../../../domain/entities/swipe.entity'
import { DomainError } from '../../errors/domain.error'
```

**Current constructor** (lines 8–13):
```typescript
export class RecordSwipeUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly chat: IChatPort,
    private readonly cache: ICachePort,
  ) {}
```

**Current LIKE block** (lines 34–38):
```typescript
    let chatId: string | null = null
    if (direction === 'LIKE') {
      const result = await this.chat.createOrGetChat(candidate.id, job.companyId, jobId, 'MATCH')
      chatId = result.chatId
    }
```

**Changes to apply:**

1. Add imports: `IWeightsRepository` from `../../../domain/interfaces/weights.repository.interface`, `GLOBAL_WEIGHT_DEFAULTS` from `./weights.constants`

2. Extend constructor: add `private readonly weights: IWeightsRepository` as 4th parameter

3. Extend LIKE block — after chat creation, add EMA update:
```typescript
    // EMA weight update (LEARN-01, D-11) — inline factor scores, no Neo4j session per LIKE
    const existing = await this.weights.findByCandidateId(candidate.id)
    const old = existing
      ? {
          profession: existing.professionWeight,
          skills: existing.skillsWeight,
          location: existing.locationWeight,
          modality: existing.modalityWeight,
          salary: existing.salaryWeight,
        }
      : { ...GLOBAL_WEIGHT_DEFAULTS }

    // Factor scores: inline pure math (no Neo4j traversal — see RESEARCH.md Pitfall 2)
    const professionScore = candidate.professionId === job.professionId ? 1.0 : 0.0
    const skillsScore =
      job.requiredSkills.length === 0
        ? 1.0
        : candidate.skills.filter((s: string) => job.requiredSkills.includes(s)).length /
          job.requiredSkills.length
    // location, modality, salary factor scores computed inline similarly

    const ALPHA = 0.1
    const raw = {
      profession: ALPHA * professionScore + (1 - ALPHA) * old.profession,
      skills:     ALPHA * skillsScore     + (1 - ALPHA) * old.skills,
      location:   ALPHA * locationScore   + (1 - ALPHA) * old.location,
      modality:   ALPHA * modalityScore   + (1 - ALPHA) * old.modality,
      salary:     ALPHA * salaryScore     + (1 - ALPHA) * old.salary,
    }
    const sum = Object.values(raw).reduce((a, b) => a + b, 0)
    const normalized = sum > 0
      ? { profession: raw.profession / sum, skills: raw.skills / sum,
          location: raw.location / sum, modality: raw.modality / sum, salary: raw.salary / sum }
      : { ...GLOBAL_WEIGHT_DEFAULTS }

    await this.weights.upsertWeights(candidate.id, {
      professionWeight: normalized.profession,
      skillsWeight:     normalized.skills,
      locationWeight:   normalized.location,
      modalityWeight:   normalized.modality,
      salaryWeight:     normalized.salary,
      likeCount: (existing?.likeCount ?? 0) + 1,
    })
```

---

### `src/application/use-cases/swipe/get-feed.use-case.ts` (use case, request-response) — MODIFY

**Analog:** itself, current state (lines 1–66)

**Current imports** (lines 1–4):
```typescript
import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { ICachePort } from '../../ports/cache.port'
```

**Current constructor** (lines 6–11):
```typescript
export class GetFeedUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
    private readonly cache: ICachePort,
  ) {}
```

**Current computeFitScore call site** (lines 35–56):
```typescript
    const scoredData = await Promise.all(
      data.map(async (job) => ({
        ...job,
        fitScore: await this.rec.computeFitScore(
          { ... } satisfies FitScoreInput,
          { ... } satisfies FitScoreJobInput,
        ),
      })),
    )
```

**Changes to apply:**

1. Add imports: `IWeightsRepository`, `WeightSet` from `../../../domain/interfaces/weights.repository.interface`

2. Extend constructor: add `private readonly weights: IWeightsRepository` as 4th parameter

3. Before the cache check block, add weight fetch (D-12):
```typescript
    // Fetch personal weights BEFORE cache check — needed for cache miss path
    const candidateWeightsRecord = await this.weights.findByCandidateId(candidate.id)
    const personalWeights: WeightSet | undefined =
      candidateWeightsRecord && candidateWeightsRecord.likeCount >= 5
        ? {
            profession: candidateWeightsRecord.professionWeight,
            skills:     candidateWeightsRecord.skillsWeight,
            location:   candidateWeightsRecord.locationWeight,
            modality:   candidateWeightsRecord.modalityWeight,
            salary:     candidateWeightsRecord.salaryWeight,
          }
        : undefined
```

4. Pass `personalWeights` to `computeFitScore`:
```typescript
        fitScore: await this.rec.computeFitScore(
          { ... } satisfies FitScoreInput,
          { ... } satisfies FitScoreJobInput,
          personalWeights,
        ),
```

---

### `src/domain/interfaces/recommendation.repository.interface.ts` (interface) — MODIFY

**Analog:** itself, current state (lines 1–28)

**Current `computeFitScore` signature** (line 26):
```typescript
  computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>
```

**Change to apply:**

Add import of `WeightSet` from `./weights.repository.interface` and extend the signature:
```typescript
import { WeightSet } from './weights.repository.interface'

export interface IRecommendationRepository {
  computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput, weights?: WeightSet): Promise<number>
  seedTaxonomy(): Promise<void>
}
```

**Note:** `weights?` is optional — all existing callers (including `GetRankingUseCase`) remain valid with no changes. D-17 confirmed.

---

### `src/adapters/services/recommendation.repository.ts` (service adapter) — MODIFY

**Analog:** itself, current hardcoded weight block (lines 107–117)

**Current hardcoded weight block** (lines 107–117):
```typescript
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

**Current method signature** (line 14):
```typescript
  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number> {
```

**Changes to apply:**

1. Add import: `WeightSet` from `../../domain/interfaces/weights.repository.interface`

2. Extend method signature:
```typescript
  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput, weights?: WeightSet): Promise<number> {
```

3. Replace hardcoded literals with parametrized block (D-13, D-14):
```typescript
    const baseWeights = weights ?? { profession: 0.30, skills: 0.35, location: 0.20, modality: 0.10, salary: 0.05 }
    const w = hasDiscRequirement ? 0.9 : 1.0

    return Math.min(
      Math.round(
        (professionScore * baseWeights.profession * w +
          skillsScore     * baseWeights.skills     * w +
          locationScore   * baseWeights.location   * w +
          modalityScore   * baseWeights.modality   * w +
          salaryScore     * baseWeights.salary     * w +
          discScore * 0.10) *
          100,
      ),
      100,  // defensive guard for float imprecision (Pitfall 7)
    )
```

---

### `src/infrastructure/http/routes/swipe.routes.ts` (route / composition root) — MODIFY

**Analog:** itself, current state (lines 1–40)

**Current `SwipeRouteOpts` type** (line 9):
```typescript
type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository; cache: ICachePort }
```

**Changes to apply:**

1. Add import: `IWeightsRepository` from `../../../domain/interfaces/weights.repository.interface`

2. Extend `SwipeRouteOpts`:
```typescript
type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository; cache: ICachePort; weights: IWeightsRepository }
```

3. Find the instantiation site for both route functions — opts already flows through `new SwipeController(opts)` on lines 24 and 35. No direct changes to route handler logic needed; the controller receives opts and injects weights to use cases.

4. In the server bootstrap / app factory file (wherever `swipeRoutes` and `swipeJobRoutes` are registered with `app.register`), instantiate `new WeightsRepository()` and add it to opts.

---

### `src/adapters/controllers/swipe.controller.ts` (controller) — MODIFY

**Analog:** itself, current state (lines 1–88)

**Current controller opts type** (lines 27–33):
```typescript
  constructor(
    private readonly opts: {
      neo4j: IRecommendationRepository
      chat: IChatPort
      cache: ICachePort
    },
  ) {}
```

**Current use case instantiations** (lines 37 and 52):
```typescript
    const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat, this.opts.cache)
    // ...
    const useCase = new GetFeedUseCase(new SwipeRepository(), this.opts.neo4j, this.opts.cache)
```

**Changes to apply:**

1. Add import: `IWeightsRepository` from `../../domain/interfaces/weights.repository.interface`

2. Extend opts type (mirror `SwipeRouteOpts`):
```typescript
    private readonly opts: {
      neo4j: IRecommendationRepository
      chat: IChatPort
      cache: ICachePort
      weights: IWeightsRepository
    },
```

3. Pass `this.opts.weights` as 4th constructor argument to both use cases:
```typescript
    const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat, this.opts.cache, this.opts.weights)
    // ...
    const useCase = new GetFeedUseCase(new SwipeRepository(), this.opts.neo4j, this.opts.cache, this.opts.weights)
```

---

### `prisma/schema.prisma` — MODIFY

**Analog:** `DiscResult` model (lines 206–217) and `CandidateProfile.discResult` relation (line 81)

**Existing `DiscResult` model** (lines 206–217):
```prisma
model DiscResult {
  id          String           @id @default(uuid())
  candidateId String           @unique
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  scoreD      Int
  scoreI      Int
  scoreS      Int
  scoreC      Int
  dominant    String
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
}
```

**Existing `CandidateProfile.discResult` relation** (line 81):
```prisma
  discResult   DiscResult?
```

**Changes to apply:**

1. Add to `CandidateProfile` (after line 81):
```prisma
  candidateWeights CandidateWeights?
```

2. Append new model after `DiscResult` (after line 217):
```prisma
model CandidateWeights {
  id               String           @id @default(uuid())
  candidateId      String           @unique
  candidate        CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  professionWeight Float            @default(0.30)
  skillsWeight     Float            @default(0.35)
  locationWeight   Float            @default(0.20)
  modalityWeight   Float            @default(0.10)
  salaryWeight     Float            @default(0.05)
  likeCount        Int              @default(0)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}
```

---

### `tests/helpers/setup.ts` — MODIFY

**Analog:** itself, current `afterEach` block (lines 24–42)

**Current cleanup order** (lines 33–41):
```typescript
  await prisma.swipe.deleteMany()
  await prisma.unlock.deleteMany()
  await prisma.creditTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.recruiterProfile.deleteMany()
  await prisma.company.deleteMany()
  await prisma.discResult.deleteMany()     // FK: discResult → candidateProfile
  await prisma.candidateProfile.deleteMany()
  await prisma.user.deleteMany()
```

**Change to apply:** Add `candidateWeights` cleanup before `discResult` (both are children of `CandidateProfile`, order between them is arbitrary):
```typescript
  await prisma.candidateWeights.deleteMany()  // FK: candidateWeights → candidateProfile (must delete first)
  await prisma.discResult.deleteMany()        // FK: discResult → candidateProfile (must delete first)
  await prisma.candidateProfile.deleteMany()
```

---

### `tests/unit/record-swipe.use-case.test.ts` — MODIFY

**Analog:** itself, current factory pattern (lines 6–25)

**Current factory pattern to follow** (lines 6–25):
```typescript
const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({ ... })
const makeChatPort = (): jest.Mocked<IChatPort> => ({ ... })
const makeCache = (): jest.Mocked<ICachePort> => ({ ... })
```

**Current constructor call pattern** (line 35):
```typescript
    const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache())
```

**Changes to apply:**

1. Add import: `IWeightsRepository` from `../../src/domain/interfaces/weights.repository.interface`

2. Add factory:
```typescript
const makeWeightsRepo = (): jest.Mocked<IWeightsRepository> => ({
  upsertWeights: jest.fn().mockResolvedValue({
    id: 'w-1', candidateId: 'cand-1',
    professionWeight: 0.30, skillsWeight: 0.35, locationWeight: 0.20,
    modalityWeight: 0.10, salaryWeight: 0.05, likeCount: 1,
    createdAt: new Date(), updatedAt: new Date(),
  }),
  findByCandidateId: jest.fn().mockResolvedValue(null),
})
```

3. Update all 5 existing `new RecordSwipeUseCase(repo, ..., cache)` calls to 4-arg form:
```typescript
    const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), makeWeightsRepo())
```

4. Add new EMA test cases (4 cases for LEARN-01):
- `'calls weights.upsertWeights with likeCount=1 on first LIKE (cold-start)'`
- `'applies EMA: new_w = 0.1*score + 0.9*old_w for each factor'`
- `'renormalizes weights to sum=1.0 after EMA'`
- `'does not call weights.upsertWeights on DISLIKE'`

---

### `tests/unit/get-feed.use-case.test.ts` — MODIFY

**Analog:** itself, current factory pattern (lines 6–26)

**Current factory pattern** (lines 6–26):
```typescript
const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({ ... })
const makeRecRepo = (): jest.Mocked<IRecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
})
const makeCache = (): jest.Mocked<ICachePort> => ({ ... })
```

**Current constructor calls** (lines 71, 89, 107, 125):
```typescript
    const uc = new GetFeedUseCase(repo, rec, cache)
```

**Changes to apply:**

1. Add import: `IWeightsRepository` from `../../src/domain/interfaces/weights.repository.interface`

2. Add same `makeWeightsRepo()` factory as in `record-swipe.use-case.test.ts`

3. Update all 4 existing `new GetFeedUseCase(repo, rec, cache)` calls to 4-arg form:
```typescript
    const uc = new GetFeedUseCase(repo, rec, cache, makeWeightsRepo())
```

4. Add new cold-start / personal-weights test cases (3 cases for LEARN-02):
- `'passes undefined weights to computeFitScore when likeCount < 5 (cold-start)'`
- `'passes personal WeightSet to computeFitScore when likeCount >= 5'`
- `'passes undefined weights when CandidateWeights record does not exist (findByCandidateId returns null)'`

---

### `tests/unit/recommendation.service.test.ts` — MODIFY

**Analog:** itself, current `makeRecRepo` mock pattern (lines 16–19 in get-feed test) and its own `makeJob`/`makeCandidate` factories

**Current `computeFitScore` mock in get-feed test** (line 17–18):
```typescript
const makeRecRepo = (): jest.Mocked<IRecommendationRepository> => ({
  computeFitScore: jest.fn(),
```

**Changes to apply:**

1. No factory change needed — `computeFitScore` mock already accepts any args via `jest.fn()`

2. Update `makeRecRepo` mock signature in `get-feed.use-case.test.ts` if TypeScript type-checks the mock (optional 3rd param is backward-compatible)

3. Add 2 new test cases for personal weights (LEARN-03) in `recommendation.service.test.ts`:
```typescript
describe('personal weights parameter (D-13)', () => {
  it('uses provided WeightSet instead of global defaults when weights param is present', async () => {
    // Set skills weight = 0.99, all others = ~0
    // Expect skills-heavy job to score higher than profession-only job
  })
  it('falls back to global defaults when weights=undefined (backward-compat)', async () => {
    // Same as existing "all factors perfect match → 100" test but explicit call with undefined
  })
})
```

---

### `tests/integration/weights.test.ts` (new integration test file)

**Analog:** Existing integration tests in `tests/integration/` directory (role-match)

**Pattern to follow** (from existing swipe/disc integration tests):
- `beforeAll` / `afterEach` from `tests/helpers/setup.ts` (already imported globally via jest config)
- Register candidate user, create `CandidateProfile`, create `Job`
- Call HTTP endpoints via Supertest
- Assert DB state via `prisma.candidateWeights.findUnique`

**3 integration test cases:**
```typescript
it('LIKE action immediately writes CandidateWeights with likeCount=1', async () => {
  // POST /swipes { direction: 'LIKE' } → expect prisma.candidateWeights.findUnique({ where: { candidateId } }) to exist with likeCount=1
})

it('feed uses global weights with 4 LIKEs (cold-start, likeCount < 5)', async () => {
  // 4 LIKEs → GET /jobs/feed → verify computeFitScore was called with undefined weights (or verify cold-start behavior via DB state)
})

it('feed uses personal weights with 5+ LIKEs (likeCount >= 5)', async () => {
  // 5 LIKEs → GET /jobs/feed → verify CandidateWeights.likeCount >= 5 → feed scores differ from global-only baseline
})
```

---

## Shared Patterns

### Constructor injection of ports/repos
**Source:** `src/application/use-cases/swipe/record-swipe.use-case.ts` lines 8–13, `src/application/use-cases/swipe/get-feed.use-case.ts` lines 6–11
**Apply to:** `RecordSwipeUseCase` and `GetFeedUseCase` constructors (add `weights: IWeightsRepository` as 4th arg)
```typescript
constructor(
  private readonly repo: ISwipeRepository,
  private readonly chat: IChatPort,   // or rec: IRecommendationRepository
  private readonly cache: ICachePort,
  private readonly weights: IWeightsRepository,  // [ADD]
) {}
```

### DomainError usage
**Source:** `src/application/use-cases/swipe/record-swipe.use-case.ts` lines 21–26
**Apply to:** No new DomainError sites needed in Phase 18 — weights fetch/upsert failures are non-fatal (silently tolerated)

### Prisma upsert (idempotent create-or-update)
**Source:** `src/adapters/repositories/disc.repository.ts` lines 16–22
```typescript
    const row = await prisma.discResult.upsert({
      where: { candidateId },
      create: { candidateId, ...data },
      update: { ...data },
    })
```
**Apply to:** `WeightsRepository.upsertWeights` — replace model name only

### Repository toDomain mapper
**Source:** `src/adapters/repositories/disc.repository.ts` lines 29–40
```typescript
  private toDomain(row: any): DiscResult {
    return {
      id: row.id,
      candidateId: row.candidateId,
      // ...fields
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
```
**Apply to:** `WeightsRepository.toDomain` — same structure, different fields

### Unit test mock factory pattern
**Source:** `tests/unit/record-swipe.use-case.test.ts` lines 6–25
```typescript
const makeFoo = (): jest.Mocked<IFoo> => ({
  methodA: jest.fn().mockResolvedValue(...),
  methodB: jest.fn().mockResolvedValue(null),
})
```
**Apply to:** New `makeWeightsRepo()` factory in both unit test files

### Controller error handling
**Source:** `src/adapters/controllers/swipe.controller.ts` lines 38–47
```typescript
    try {
      const result = await useCase.execute(...)
      reply.status(201).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
```
**Apply to:** No new controller methods in Phase 18 — existing `recordSwipe` and `getFeed` handlers are modified in place

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/application/use-cases/swipe/weights.constants.ts` | constants | — | No constants file exists in the project; pattern is trivial `export const` object |

---

## Critical Anti-Patterns (from RESEARCH.md)

These must NOT appear in implementation:

1. `import ... from '../../../adapters/...'` in any use case — `GLOBAL_WEIGHT_DEFAULTS` must come from `weights.constants.ts` in application layer, not from the adapter
2. `this.rec.computeFitScore(...)` inside `RecordSwipeUseCase` — EMA factor scores are inline pure math
3. EMA formula inside `WeightsRepository` — business logic belongs in use case
4. `new RecordSwipeUseCase(repo, chat, cache)` (3-arg) in tests after constructor extends to 4-arg — all 5 existing calls in `record-swipe.use-case.test.ts` and 4 in `get-feed.use-case.test.ts` must be updated

---

## Metadata

**Analog search scope:** `src/domain/`, `src/adapters/`, `src/application/use-cases/swipe/`, `src/infrastructure/http/routes/`, `src/adapters/controllers/`, `tests/unit/`, `tests/helpers/`, `prisma/`
**Files scanned:** 14 source files + schema
**Pattern extraction date:** 2026-05-30
