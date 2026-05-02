# Phase 6: Recommendation - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 11 (6 new, 5 modified)
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/modules/recommendation/recommendation.repository.ts` | repository | request-response (Neo4j read/write) | `src/modules/swipe/swipe.repository.ts` | role-match (different DB client) |
| `src/shared/interfaces/recommendation.interface.ts` | interface/type | — | `src/modules/job/job.routes.ts` (RankingItem export) | partial (co-located export pattern) |
| `scripts/seed-neo4j.ts` | utility/script | batch (write) | `tests/helpers/factories.ts` | partial (setup-time DB writes) |
| `tests/unit/recommendation.service.test.ts` | test (unit) | — | `tests/unit/swipe.service.test.ts` | exact |
| `tests/integration/recommendation.test.ts` | test (integration) | — | `tests/integration/swipe.test.ts` | exact |
| `tests/helpers/neo4j-setup.ts` | test helper | batch (write+clear) | `tests/helpers/setup.ts` | role-match |
| `src/shared/db/neo4j.ts` (modify) | config/db | — | self (already exists) | self |
| `src/modules/swipe/swipe.service.ts` (modify) | service | request-response | self (already exists) | self |
| `src/modules/swipe/swipe.routes.ts` (modify) | route | request-response | self (already exists) | self |
| `tests/unit/swipe.service.test.ts` (modify) | test (unit) | — | self (already exists) | self |
| `tests/integration/swipe.test.ts` (modify) | test (integration) | — | self (already exists) | self |

---

## Pattern Assignments

### `src/modules/recommendation/recommendation.repository.ts` (repository, request-response)

**Analog:** `src/modules/swipe/swipe.repository.ts`

**Imports pattern** (swipe.repository.ts lines 1-3):
```typescript
import { prisma } from '../../shared/db/prisma'
import { SwipeDirection } from '@prisma/client'
```
Adaptation — replace Prisma import with Neo4j driver import:
```typescript
import neo4j, { Driver } from 'neo4j-driver'
import { getNeo4jDriver } from '../../shared/db/neo4j'
import type { IRecommendationService, CandidateData, JobData } from '../../shared/interfaces/recommendation.interface'
```

**Class structure pattern** (swipe.repository.ts lines 4-49):
```typescript
export class SwipeRepository {
  async createSwipe(data: { ... }) { ... }
  async findJobById(id: string) { ... }
}
```
Adaptation — accept Driver via constructor (Neo4j sessions are per-call, not a singleton client):
```typescript
export class RecommendationRepository implements IRecommendationService {
  constructor(private readonly driver: Driver) {}

  async computeFitScore(candidate: CandidateData, job: JobData): Promise<number> {
    // scoring logic — pure TypeScript math, no DB call for v1
  }

  async seedTaxonomy(): Promise<void> {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
    try {
      await session.executeWrite(tx => tx.run('MERGE (p:Profession {id: $id}) SET p.name = $name', { id: 'backend-dev', name: 'Backend Developer' }))
    } finally {
      await session.close()
    }
  }
}
```

**Session lifecycle pattern** — mandatory `try/finally` for every session (Risk 4 from RESEARCH.md):
```typescript
const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
try {
  const result = await session.executeRead(tx => tx.run(query, params))
  return processResult(result)
} finally {
  await session.close()
}
```

**Module isolation comment pattern** (swipe.repository.ts line 17):
```typescript
// Direct Prisma call — NEVER import CandidateRepository (module isolation, ARCH-04)
```
Adaptation for recommendation.repository.ts:
```typescript
// NEVER import from src/modules/swipe/ or any other module — module isolation, ARCH-04
```

---

### `src/shared/interfaces/recommendation.interface.ts` (interface, —)

**Analog:** `src/modules/job/job.routes.ts` (lines 8-12, RankingItem export)

The project has no `src/shared/interfaces/` directory yet. The closest existing pattern is a co-located interface export in `job.routes.ts`:

```typescript
// src/modules/job/job.routes.ts lines 8-12
export interface RankingItem {
  candidateId: string
  fitScore: number
  profile: Record<string, unknown> | null
}
```

The `recommendation.interface.ts` file follows this same interface export pattern but lives in `src/shared/interfaces/` to satisfy ARCH-04 (no direct module-to-module import). The RESEARCH.md provides the exact interface shape to implement:

```typescript
// src/shared/interfaces/recommendation.interface.ts
export interface CandidateData {
  professionId: string | null
  skills: string[]
  preferredModalities: string[]
  salaryExpectation: number | null
  lat: number | null
  lng: number | null
  searchRadiusKm: number
}

export interface JobData {
  professionId: string | null
  requiredSkills: string[]
  modality: string
  salaryMin: number | null
  salaryMax: number | null
  lat: number | null
  lng: number | null
}

export interface IRecommendationService {
  computeFitScore(candidate: CandidateData, job: JobData): Promise<number>
}
```

No `index.ts` barrel — other shared files (`AppError.ts`, `authenticate.ts`) are imported directly by path.

---

### `scripts/seed-neo4j.ts` (utility/script, batch)

**Analog:** `tests/helpers/factories.ts` (lines 1-5, 54-78) — only analog for a "setup-time DB write" script.

**Imports pattern** (factories.ts lines 1-3):
```typescript
import { prisma } from '../../src/shared/db/prisma'
import bcrypt from 'bcryptjs'
import { Modality, Role } from '@prisma/client'
```
Adaptation — a CLI script entry point with dotenv:
```typescript
import 'dotenv/config'
import { getNeo4jDriver } from '../src/shared/db/neo4j'
import { RecommendationRepository } from '../src/modules/recommendation/recommendation.repository'
```

**CLI entry point pattern** — no existing example in codebase; use standard Node.js pattern:
```typescript
async function main() {
  const driver = getNeo4jDriver()
  const repo = new RecommendationRepository(driver)
  try {
    await repo.seedTaxonomy()
    console.log('Neo4j taxonomy seed complete')
  } finally {
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

---

### `tests/unit/recommendation.service.test.ts` (unit test, —)

**Analog:** `tests/unit/swipe.service.test.ts` — exact role match.

**Imports pattern** (swipe.service.test.ts lines 1-4):
```typescript
import { SwipeService } from '../../src/modules/swipe/swipe.service'
import { SwipeRepository } from '../../src/modules/swipe/swipe.repository'
import { AppError } from '../../src/shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'
```
Adaptation:
```typescript
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'
import type { CandidateData, JobData } from '../../src/shared/interfaces/recommendation.interface'
```

**Mock factory pattern** (swipe.service.test.ts lines 7-14):
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
Adaptation for recommendation repo mock (used in both this test file AND in updated swipe.service.test.ts):
```typescript
const makeRecRepo = (): jest.Mocked<RecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
} as unknown as jest.Mocked<RecommendationRepository>)
```

**Test data factory pattern** (swipe.service.test.ts lines 16-37):
```typescript
const makeCandidate = (overrides: Partial<{ id: string; ... }> = {}) => ({
  id: overrides.id ?? 'candidate-1',
  ...
})
```
Adaptation — typed candidate and job factories using CandidateData/JobData shapes:
```typescript
const makeCandidate = (overrides: Partial<CandidateData> = {}): CandidateData => ({
  professionId: overrides.professionId ?? 'backend-dev',
  skills: overrides.skills ?? ['Node.js', 'TypeScript'],
  preferredModalities: overrides.preferredModalities ?? ['REMOTE'],
  salaryExpectation: overrides.salaryExpectation ?? 5000,
  lat: overrides.lat ?? -23.5505,
  lng: overrides.lng ?? -46.6333,
  searchRadiusKm: overrides.searchRadiusKm ?? 50,
})

const makeJob = (overrides: Partial<JobData> = {}): JobData => ({
  professionId: overrides.professionId ?? 'backend-dev',
  requiredSkills: overrides.requiredSkills ?? ['Node.js', 'TypeScript'],
  modality: overrides.modality ?? 'REMOTE',
  salaryMin: overrides.salaryMin ?? 4000,
  salaryMax: overrides.salaryMax ?? 8000,
  lat: overrides.lat ?? -23.5505,
  lng: overrides.lng ?? -46.6333,
})
```

**describe/beforeEach pattern** (swipe.service.test.ts lines 39-47):
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
Adaptation:
```typescript
describe('RecommendationRepository', () => {
  let recRepo: RecommendationRepository

  beforeEach(() => {
    // Pass a fake Driver object — all Neo4j calls are mocked at session level or not called in unit tests
    recRepo = new RecommendationRepository({} as any)
    jest.clearAllMocks()
  })
```

**Individual test structure** (swipe.service.test.ts lines 50-53):
```typescript
it('lança AppError 404 NOT_FOUND quando candidato não tem perfil', async () => {
  repo.findCandidateProfileByUserId.mockResolvedValue(null)
  await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  expect(repo.createSwipe).not.toHaveBeenCalled()
})
```
Adaptation — pure number assertions for scoring tests:
```typescript
it('profession match exact contributes 30 points', async () => {
  const candidate = makeCandidate({ professionId: 'backend-dev' })
  const job = makeJob({ professionId: 'backend-dev', requiredSkills: [], salaryMin: null, salaryMax: null, lat: null, lng: null })
  const score = await recRepo.computeFitScore(candidate, job)
  // professionScore=1.0*0.30 + skillsScore=1.0*0.35 + locationScore=0.5*0.20 + modalityScore=1.0*0.10 + salaryScore=1.0*0.05
  // Isolate profession by neutralising other factors or compute exactly
  expect(score).toBeGreaterThanOrEqual(0)
  expect(score).toBeLessThanOrEqual(100)
})
```

---

### `tests/integration/recommendation.test.ts` (integration test, —)

**Analog:** `tests/integration/swipe.test.ts` — exact role match.

**Setup import pattern** (swipe.test.ts line 1-6):
```typescript
import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/shared/db/prisma'
```
Adaptation — add Neo4j setup import:
```typescript
import '../helpers/setup'
import { setupNeo4j } from '../helpers/neo4j-setup'
import { getNeo4jDriver } from '../../src/shared/db/neo4j'
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'
```

**beforeAll/afterAll pattern** (setup.ts lines 4-15 for Prisma; new pattern for Neo4j):
```typescript
beforeAll(async () => {
  await setupNeo4j()  // clear graph + seed taxonomy
})

afterAll(async () => {
  await getNeo4jDriver().close()
})
```

**App-based HTTP test pattern** (swipe.test.ts lines 56-72):
```typescript
it('201 cria swipe quando CANDIDATE envia body válido com direction LIKE', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()
  // ... setup ...
  const response = await supertest(app.server)
    .post('/swipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId: job.id, direction: 'LIKE' })
  expect(response.status).toBe(201)
  await app.close()
})
```

**Direct service test pattern** (job.test.ts lines 18-26) — for testing repository directly without HTTP:
```typescript
describe('JobService — integration', () => {
  let repo: JobRepository
  let service: JobService

  beforeEach(() => {
    repo = new JobRepository()
    service = new JobService(repo)
  })
```
Adaptation for recommendation integration test:
```typescript
describe('RecommendationRepository — integration', () => {
  let recRepo: RecommendationRepository

  beforeEach(() => {
    recRepo = new RecommendationRepository(getNeo4jDriver())
  })

  it('computeFitScore returns number between 0 and 100', async () => {
    const score = await recRepo.computeFitScore(makeCandidate(), makeJob())
    expect(typeof score).toBe('number')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})
```

---

### `tests/helpers/neo4j-setup.ts` (test helper, batch)

**Analog:** `tests/helpers/setup.ts` — exact role match (DB reset + setup before tests).

**Full setup.ts for reference** (lines 1-29):
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
  await prisma.refreshToken.deleteMany()
  // ... (FK-safe delete order)
  await prisma.user.deleteMany()
})
```
Key pattern: `setup.ts` is a Jest setup file (not a function export) — it registers `beforeAll`/`afterAll`/`afterEach` at module load time.

`neo4j-setup.ts` differs: it exports a `setupNeo4j()` function called explicitly in `beforeAll` of the recommendation test, because Neo4j is NOT shared across all test files (only recommendation tests need it). Do NOT register global hooks:

```typescript
import { getNeo4jDriver } from '../../src/shared/db/neo4j'
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'

export async function setupNeo4j(): Promise<void> {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    await session.run('MATCH (n) DETACH DELETE n')  // clear all nodes
    const repo = new RecommendationRepository(driver)
    await repo.seedTaxonomy()  // re-seed taxonomy
  } finally {
    await session.close()
  }
}
```

---

## Modifications to Existing Files

### `src/shared/db/neo4j.ts` (modify — add disableLosslessIntegers)

**Current state** (lines 1-16):
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
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  }
  return driver
}
```

**Change required** — add third argument to `neo4j.driver()` call (line 13 only):
```typescript
driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
  disableLosslessIntegers: true,
})
```

---

### `src/modules/swipe/swipe.service.ts` (modify — inject IRecommendationService)

**Current constructor** (lines 24-25):
```typescript
export class SwipeService {
  constructor(private readonly repo: SwipeRepository) {}
```

**Change required** — add second constructor argument:
```typescript
import type { IRecommendationService } from '../../shared/interfaces/recommendation.interface'

export class SwipeService {
  constructor(
    private readonly repo: SwipeRepository,
    private readonly recommendation: IRecommendationService,
  ) {}
```

**Current fitScore placeholder** (line 70):
```typescript
fitScore: 0, // Phase 5 placeholder — Phase 6 replaces with Neo4j fit score (D-13)
```

**Change required in getRanking** — replace `.map()` with `Promise.all()` + async scoring:
```typescript
const items = await Promise.all(swipes.map(async (swipe: any) => {
  const fitScore = await this.recommendation.computeFitScore(
    {
      professionId: swipe.candidate.professionId,
      skills: swipe.candidate.skills,
      preferredModalities: swipe.candidate.preferredModalities,
      salaryExpectation: swipe.candidate.salaryExpectation,
      lat: swipe.candidate.lat,
      lng: swipe.candidate.lng,
      searchRadiusKm: swipe.candidate.searchRadiusKm ?? 50,
    },
    {
      professionId: job.professionId,
      requiredSkills: job.requiredSkills,
      modality: job.modality,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      lat: job.lat,
      lng: job.lng,
    }
  )
  return {
    candidateId: swipe.candidateId,
    fitScore,
    distanceKm: haversineKm(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng),
    profile: swipe.direction === 'LIKE' ? { ... } : null,
  }
}))

return items
  .sort((a, b) => b.fitScore - a.fitScore || /* tie-break: swipedAt handled by DB ORDER already */ 0)
  .map((item, index) => ({ ...item, rank: index + 1 }))
```

**Change required in getFeed** — add fitScore per job after fetching:
```typescript
const scoredData = await Promise.all(
  data.map(async (job) => ({
    ...job,
    fitScore: await this.recommendation.computeFitScore(candidate, {
      professionId: job.professionId,
      requiredSkills: job.requiredSkills,
      modality: job.modality,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      lat: job.lat ?? null,
      lng: job.lng ?? null,
    }),
  }))
)
return { data: scoredData, nextCursor }
```

---

### `src/modules/swipe/swipe.routes.ts` (modify — inject RecommendationRepository)

**Current instantiation pattern** (lines 20-23 and 39-42):
```typescript
export async function swipeRoutes(app: FastifyInstance): Promise<void> {
  const repo = new SwipeRepository()
  const service = new SwipeService(repo)
```

**Change required** — inject RecommendationRepository in both route functions:
```typescript
import { RecommendationRepository } from '../recommendation/recommendation.repository'
import { getNeo4jDriver } from '../../shared/db/neo4j'

export async function swipeRoutes(app: FastifyInstance): Promise<void> {
  const repo = new SwipeRepository()
  const recRepo = new RecommendationRepository(getNeo4jDriver())
  const service = new SwipeService(repo, recRepo)
```
Same change applies to `swipeJobRoutes` function.

---

### `tests/unit/swipe.service.test.ts` (modify — pass mock recRepo to SwipeService)

**Current beforeEach** (lines 43-47):
```typescript
beforeEach(() => {
  repo = makeRepo()
  service = new SwipeService(repo)
  jest.clearAllMocks()
})
```

**Change required** — add `makeRecRepo` factory (see recommendation.service.test.ts pattern above) and pass it:
```typescript
let recRepo: jest.Mocked<RecommendationRepository>

beforeEach(() => {
  repo = makeRepo()
  recRepo = makeRecRepo()
  recRepo.computeFitScore.mockResolvedValue(0)  // preserve existing test behavior (fitScore=0)
  service = new SwipeService(repo, recRepo)
  jest.clearAllMocks()
})
```

All existing test assertions remain valid — `mockResolvedValue(0)` preserves the `fitScore: 0` behavior that existing tests were written against.

---

### `tests/integration/swipe.test.ts` (modify — add fitScore assertions)

**Existing ranking test** (lines 219-244) asserts shape but not fitScore value. Add:
```typescript
// After Phase 6: fitScore should not be 0 for a candidate with matching profile
// (requires Neo4j running with seeded taxonomy)
expect(likeItem.fitScore).toBeGreaterThanOrEqual(0)
expect(typeof likeItem.fitScore).toBe('number')
```
Feed test (lines 139-216) — add fitScore field check per item:
```typescript
expect(response.body.data[0]).toHaveProperty('fitScore')
expect(typeof response.body.data[0].fitScore).toBe('number')
```

---

## Shared Patterns

### Neo4j Session Lifecycle
**Source:** RESEARCH.md Risk 4 + `src/shared/db/neo4j.ts` (getNeo4jDriver pattern)
**Apply to:** All methods in `recommendation.repository.ts` that open a session
```typescript
const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
try {
  const result = await session.executeRead(tx => tx.run(query, params))
  return processResult(result)
} finally {
  await session.close()  // MANDATORY — prevents connection pool exhaustion
}
```

### Module Isolation Comment (ARCH-04)
**Source:** `src/modules/swipe/swipe.repository.ts` line 17
**Apply to:** `recommendation.repository.ts`
```typescript
// NEVER import from src/modules/swipe/, src/modules/job/, or any other module — ARCH-04
```

### Parameterized Cypher (no string interpolation)
**Source:** RESEARCH.md Security Domain
**Apply to:** All Cypher queries in `recommendation.repository.ts`
```typescript
// CORRECT — parameterized
tx.run('MATCH (s:Skill) WHERE toLower(s.name) IN $skills RETURN s', { skills: candidate.skills.map(s => s.toLowerCase()) })

// FORBIDDEN — string interpolation
tx.run(`MATCH (s:Skill) WHERE s.name = '${skillName}' RETURN s`)
```

### Jest Mock Factory Pattern
**Source:** `tests/unit/swipe.service.test.ts` lines 7-14
**Apply to:** All new unit test files, and updated `swipe.service.test.ts`
```typescript
const makeRecRepo = (): jest.Mocked<RecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
} as unknown as jest.Mocked<RecommendationRepository>)
```

### Error Handling (AppError)
**Source:** `src/shared/errors/AppError.ts`, used in `src/modules/swipe/swipe.service.ts` lines 29, 34
**Apply to:** `recommendation.repository.ts` if Neo4j driver throws on connection failure
```typescript
import { AppError } from '../../shared/errors/AppError'
// Wrap driver errors in AppError if they should surface as HTTP errors
```

---

## No Analog Found

No files are completely without analog. All new files have at least a partial match in the existing codebase.

| File | Note |
|---|---|
| `scripts/seed-neo4j.ts` | No existing `scripts/` directory — closest analog is `tests/helpers/factories.ts` for DB write logic. CLI entry point pattern (main/catch) has no codebase example but is standard Node.js. |
| `src/shared/interfaces/recommendation.interface.ts` | No existing `src/shared/interfaces/` directory. Interface export pattern taken from `src/modules/job/job.routes.ts` (RankingItem). Create the directory as part of implementation. |

---

## Metadata

**Analog search scope:** `src/modules/`, `src/shared/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`
**Files scanned:** 20
**Pattern extraction date:** 2026-05-02
