# Phase 15: Redis Caching — Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 19 (11 new, 8 modified)
**Analogs found:** 19 / 19

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/application/ports/cache.port.ts` | port (interface) | request-response | `src/application/ports/hash.port.ts` | exact |
| `src/adapters/services/redis.adapter.ts` | adapter/service | request-response | `src/adapters/services/bcrypt.adapter.ts` | exact |
| `src/infrastructure/database/redis.ts` | singleton/config | — | `src/infrastructure/database/neo4j.ts` | exact |
| `src/application/use-cases/swipe/get-feed.use-case.ts` | use-case | request-response + cache | `src/application/use-cases/swipe/get-ranking.use-case.ts` | exact (sibling) |
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | use-case | request-response + cache | `src/application/use-cases/swipe/get-feed.use-case.ts` | exact (sibling) |
| `src/application/use-cases/swipe/record-swipe.use-case.ts` | use-case | CRUD + cache invalidation | `src/application/use-cases/swipe/record-swipe.use-case.ts` | self (modify) |
| `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | use-case | CRUD + cache invalidation | `src/application/use-cases/swipe/record-swipe.use-case.ts` | role-match |
| `src/infrastructure/http/routes/candidate.routes.ts` | route | request-response | `src/infrastructure/http/routes/swipe.routes.ts` | role-match |
| `src/adapters/controllers/candidate.controller.ts` | controller | request-response | `src/adapters/controllers/swipe.controller.ts` | role-match |
| `src/infrastructure/http/routes/swipe.routes.ts` | route | request-response | `src/infrastructure/http/routes/swipe.routes.ts` | self (modify) |
| `src/app.ts` | composition root | — | `src/app.ts` | self (modify) |
| `scripts/check-deps.ts` | script/config | — | `scripts/check-deps.ts` | self (modify) |
| `prisma/schema.prisma` | schema/config | — | `prisma/schema.prisma` | self (modify) |
| `docker-compose.yml` | config | — | `docker-compose.yml` | self (modify) |
| `tests/unit/get-feed.use-case.test.ts` | unit test | — | `tests/unit/record-swipe.use-case.test.ts` | exact |
| `tests/unit/get-ranking.use-case.test.ts` | unit test | — | `tests/unit/record-swipe.use-case.test.ts` | exact |
| `tests/unit/record-swipe.use-case.test.ts` | unit test | — | `tests/unit/record-swipe.use-case.test.ts` | self (modify) |
| `tests/unit/upsert-candidate-profile.use-case.test.ts` | unit test | — | `tests/unit/upsert-candidate-profile.use-case.test.ts` | self (modify) |
| `tests/integration/indexes.test.ts` | integration test | — | `tests/integration/swipe.test.ts` | role-match |

---

## Pattern Assignments

### `src/application/ports/cache.port.ts` (port, request-response)

**Analog:** `src/application/ports/hash.port.ts`

**Full analog** (lines 1–4):
```typescript
export interface IHashPort {
  hash(plain: string): Promise<string>
  compare(plain: string, hashed: string): Promise<boolean>
}
```

**Port pattern to copy:** Bare `export interface` with no imports. Each method is `async`-shaped (`Promise<T>`). No implementation details — only the contract the use case depends on.

**Apply this pattern:**
```typescript
// src/application/ports/cache.port.ts
export interface ICachePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  invalidatePattern(pattern: string): Promise<void>
}
```

---

### `src/adapters/services/redis.adapter.ts` (adapter, request-response)

**Analog:** `src/adapters/services/bcrypt.adapter.ts`

**Full analog** (lines 1–13):
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

**Adapter pattern:** Named import of the port interface from `../../application/ports/`. Class `implements IPort`. Constructor receives the external client (if stateful). Each method delegates to the injected client — no business logic.

**Key deviation for RedisAdapter:** Unlike `BcryptAdapter` (stateless — no constructor), `RedisAdapter` is stateful — it receives an ioredis `Redis` instance via constructor injection (matching `Neo4jAdapter` pattern at `src/adapters/services/neo4j.adapter.ts` lines 9–13):
```typescript
export class Neo4jAdapter implements IRecommendationRepository {
  private readonly inner: RecommendationRepository
  constructor(driver: Driver) {
    this.inner = new RecommendationRepository(driver)
  }
```

**`invalidatePattern` implementation note:** Use `scanStream` + pipeline, never `KEYS *`. Pattern from RESEARCH.md (ioredis README verified):
```typescript
async invalidatePattern(pattern: string): Promise<void> {
  const stream = this.client.scanStream({ match: pattern, count: 100 })
  const pipeline = this.client.pipeline()
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (keys: string[]) => {
      keys.forEach((key) => pipeline.del(key))
    })
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  await pipeline.exec()
}
```

---

### `src/infrastructure/database/redis.ts` (singleton, config)

**Analog:** `src/infrastructure/database/neo4j.ts`

**Full analog** (lines 1–23):
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

**Singleton pattern:** Module-level `let` variable (not `const`); lazy init inside a guard (`if (!client)`); read env var inside the guard (not at module load time); export a named function `get<Resource>()`. Export a `close<Resource>()` function for graceful shutdown.

**Apply this pattern:**
```typescript
// src/infrastructure/database/redis.ts
import Redis from 'ioredis'

let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    redisClient = new Redis(url)
  }
  return redisClient
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
```

---

### `src/application/use-cases/swipe/get-feed.use-case.ts` (use-case, MODIFY)

**Analog:** `src/application/use-cases/swipe/get-feed.use-case.ts` (self — modify)
**Secondary analog:** `src/application/use-cases/swipe/record-swipe.use-case.ts` for the pattern of adding a third port to a constructor

**Current constructor** (lines 6–9):
```typescript
export class GetFeedUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
  ) {}
```

**Target constructor after SCALE-01:** Add `cache: ICachePort` as third argument:
```typescript
constructor(
  private readonly repo: ISwipeRepository,
  private readonly rec: IRecommendationRepository,
  private readonly cache: ICachePort,
) {}
```

**Cache pattern to inject** (before `findFeedJobs` call, after candidate lookup):
```typescript
// Only cache first page (no cursor) — paginated requests are uncached (see RESEARCH Pitfall 3)
const cacheKey = `feed:${candidate.id}`
if (!cursor) {
  let cached: string | null = null
  try { cached = await this.cache.get(cacheKey) } catch { /* Redis down — fall through */ }
  if (cached) return JSON.parse(cached)
}

// ... existing jobs + scoredData computation unchanged ...

if (!cursor) {
  try { await this.cache.set(cacheKey, JSON.stringify(result), 60) } catch { /* Redis down — ok */ }
}
return result
```

**Import to add:**
```typescript
import { ICachePort } from '../../ports/cache.port'
```

---

### `src/application/use-cases/swipe/get-ranking.use-case.ts` (use-case, MODIFY)

**Analog:** `src/application/use-cases/swipe/get-ranking.use-case.ts` (self — modify)

**Current constructor** (lines 6–9):
```typescript
export class GetRankingUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
  ) {}
```

**Target constructor after SCALE-02:** Add `cache: ICachePort` as third argument (same pattern as GetFeedUseCase above).

**Cache pattern to inject** (after ownership check at line 23, before `findSwipesByJobId`):
```typescript
const cacheKey = `ranking:${jobId}`
let cached: string | null = null
try { cached = await this.cache.get(cacheKey) } catch { /* Redis down — fall through */ }
if (cached) return JSON.parse(cached)

// ... existing swipes + items + sort computation unchanged (lines 26–95) ...

try { await this.cache.set(cacheKey, JSON.stringify(result), 30) } catch { /* Redis down — ok */ }
return result
```

---

### `src/application/use-cases/swipe/record-swipe.use-case.ts` (use-case, MODIFY)

**Analog:** `src/application/use-cases/swipe/record-swipe.use-case.ts` (self — modify)

**Current constructor** (lines 8–11):
```typescript
export class RecordSwipeUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly chat: IChatPort,
  ) {}
```

**Target constructor after SCALE-01 invalidation:** Add `cache: ICachePort` as third argument.

**Invalidation to add** (after `createSwipe` at line 27, before chatId logic at line 30):
```typescript
const swipe = await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })
// SCALE-01: invalidate candidate's feed cache after swipe
try { await this.cache.del(`feed:${candidate.id}`) } catch { /* Redis down — ok */ }
```

**Import to add:**
```typescript
import { ICachePort } from '../../ports/cache.port'
```

---

### `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` (use-case, MODIFY)

**Analog:** `src/application/use-cases/swipe/record-swipe.use-case.ts` for the pattern of a mutating use case that invalidates cache after write.

**Current constructor** (lines 6–6):
```typescript
export class UpsertCandidateProfileUseCase {
  constructor(private readonly repo: ICandidateRepository) {}
```

**Target constructor after SCALE-02 invalidation:**
```typescript
constructor(
  private readonly repo: ICandidateRepository,
  private readonly cache: ICachePort,
) {}
```

**Invalidation to add** (after `upsertProfile`, before return):
```typescript
const profile = await this.repo.upsertProfile(userId, data)
// SCALE-02: blunt invalidation — all ranking keys stale after any profile update
try { await this.cache.invalidatePattern('ranking:*') } catch { /* Redis down — ok */ }
return profile
```

**Import to add:**
```typescript
import { ICachePort } from '../../../application/ports/cache.port'
```

---

### `src/infrastructure/http/routes/candidate.routes.ts` (route, MODIFY)

**Analog:** `src/infrastructure/http/routes/swipe.routes.ts`

**Current state** (lines 1–11) — no opts type, no opts parameter:
```typescript
import { FastifyInstance } from 'fastify'
import { CandidateController } from '../../../adapters/controllers/candidate.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'

export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new CandidateController()
  // ...
}
```

**Analog pattern with opts type** (swipe.routes.ts lines 8–11):
```typescript
type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository }

export async function swipeRoutes(app: FastifyInstance, opts: SwipeRouteOpts): Promise<void> {
  const ctrl = new SwipeController(opts)
```

**Apply this pattern to candidate.routes.ts:**
```typescript
import { ICachePort } from '../../../application/ports/cache.port'

type CandidateRouteOpts = { cache: ICachePort }

export async function candidateRoutes(app: FastifyInstance, opts: CandidateRouteOpts): Promise<void> {
  const ctrl = new CandidateController(opts)
  // route definitions unchanged
}
```

---

### `src/adapters/controllers/candidate.controller.ts` (controller, MODIFY)

**Analog:** `src/adapters/controllers/swipe.controller.ts`

**Current state** (lines 20–23) — no constructor, instantiates use cases inline without cache:
```typescript
export class CandidateController {
  async upsertProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = CandidateProfileSchema.parse(request.body)
    const useCase = new UpsertCandidateProfileUseCase(new CandidateRepository())
```

**Analog pattern** (swipe.controller.ts lines 25–31) — constructor receives opts typed with port interfaces:
```typescript
export class SwipeController {
  constructor(
    private readonly opts: {
      neo4j: IRecommendationRepository
      chat: IChatPort
    },
  ) {}
  async recordSwipe(...) {
    const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat)
```

**Apply to CandidateController:**
```typescript
import { ICachePort } from '../../application/ports/cache.port'

export class CandidateController {
  constructor(private readonly opts: { cache: ICachePort }) {}

  async upsertProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = CandidateProfileSchema.parse(request.body)
    const useCase = new UpsertCandidateProfileUseCase(new CandidateRepository(), this.opts.cache)
    // error handling unchanged (lines 25–31 pattern)
  }
  // getProfile unchanged — no cache dependency
}
```

---

### `src/infrastructure/http/routes/swipe.routes.ts` (route, MODIFY)

**Analog:** `src/infrastructure/http/routes/swipe.routes.ts` (self — modify)

**Current opts type** (line 8):
```typescript
type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository }
```

**Target opts type after adding cache:**
```typescript
import { ICachePort } from '../../../application/ports/cache.port'

type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository; cache: ICachePort }
```

**Controller construction** (lines 35–36 in `swipeRoutes`, line 22 in `swipeJobRoutes`) — `opts` already passed as-is to `SwipeController(opts)`. No change required there; `SwipeController` just needs its `opts` type and use-case constructors updated to pass `this.opts.cache`.

---

### `src/app.ts` (composition root, MODIFY)

**Analog:** `src/app.ts` (self — modify)

**Existing Neo4j wiring pattern** (lines 23–24, 52–53, 64–65):
```typescript
import { Neo4jAdapter } from './adapters/services/neo4j.adapter'
import { getNeo4jDriver } from './infrastructure/database/neo4j'
// ...
const neo4jAdapter = new Neo4jAdapter(getNeo4jDriver())
// ...
await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter })
```

**Apply same pattern for Redis:**
```typescript
import { RedisAdapter } from './adapters/services/redis.adapter'
import { getRedisClient } from './infrastructure/database/redis'
// ...
const redisAdapter = new RedisAdapter(getRedisClient())
// ...
await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter, cache: redisAdapter })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter, cache: redisAdapter })
// candidateRoutes gains opts for first time — matches swipeRoutes pattern:
await app.register(candidateRoutes, { prefix: '/candidates', cache: redisAdapter })
```

---

### `scripts/check-deps.ts` (script, MODIFY)

**Analog:** `scripts/check-deps.ts` (self — modify)

**Current RULES array** (lines 3–21):
```typescript
const RULES: Array<{ from: RegExp; forbids: RegExp[]; label: string }> = [
  {
    label: 'domain must not import from project',
    from: /^domain\//,
    forbids: [/^application\//, /^adapters\//, /^infrastructure\//],
  },
  {
    label: 'application must not import adapters or infrastructure',
    from: /^application\//,
    forbids: [/^adapters\//, /^infrastructure\//],
  },
  {
    label: 'adapters must not import infrastructure/http',
    from: /^adapters\//,
    forbids: [/^infrastructure\/http\//],
  },
]
```

**SCALE-03 change:** Split the second rule into two named rules. Struct shape is identical — just split `forbids` array into two separate rule objects:
```typescript
  {
    label: 'application must not import adapters',
    from: /^application\//,
    forbids: [/^adapters\//],
  },
  {
    label: 'application must not import infrastructure (including infrastructure/database)',
    from: /^application\//,
    forbids: [/^infrastructure\//],
  },
```

No other change to the file. The violation-printing and `process.exit(1)` logic (lines 28–46) is unchanged.

---

### `prisma/schema.prisma` (schema, MODIFY)

**Analog:** `prisma/schema.prisma` — existing `@@index` and `@@unique` usage (lines 60–62):
```prisma
model RefreshToken {
  @@index([familyId])
  @@index([userId])
}
```

**SCALE-04 additions — four `@@index` entries:**

```prisma
model Swipe {
  // ... existing fields and @@unique([candidateId, jobId]) unchanged ...
  @@unique([candidateId, jobId])
  @@index([candidateId])        // SCALE-04
  @@index([jobId])              // SCALE-04
}

model Job {
  // ... existing fields unchanged ...
  @@index([isActive, expiresAt])  // SCALE-04
}

model CandidateProfile {
  // ... existing fields unchanged (no @@index exists today) ...
  @@index([professionId])         // SCALE-04
}
```

Current `Swipe` model ends at line 144 with only `@@unique([candidateId, jobId])`.
Current `Job` model ends at line 132 with no `@@index`.
Current `CandidateProfile` model ends at line 81 with no `@@index`.

---

### `docker-compose.yml` (config, MODIFY)

**Analog:** `docker-compose.yml` (self — modify) — existing `postgres_test` service (lines 14–20) shows the isolated test-service pattern:
```yaml
postgres_test:
  image: postgres:16
  environment:
    POSTGRES_USER: jobtinder_test
    POSTGRES_PASSWORD: jobtinder_test
    POSTGRES_DB: jobtinder_test
  ports:
    - '5433:5432'
```

**Apply same isolation pattern for Redis:**
```yaml
redis:
  image: redis:7
  ports:
    - '6379:6379'

redis_test:
  image: redis:7
  ports:
    - '6380:6379'
```

No volumes needed for Redis (in-memory, ephemeral is correct for dev and test). Add after `neo4j` service block, before `volumes:` section.

---

### `tests/unit/get-feed.use-case.test.ts` (unit test, NEW)

**Analog:** `tests/unit/record-swipe.use-case.test.ts`

**Full analog** (lines 1–61):
```typescript
import { RecordSwipeUseCase } from '../../src/application/use-cases/swipe/record-swipe.use-case'
import type { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import type { IChatPort } from '../../src/application/ports/chat.port'

const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  // ... all interface methods ...
} as jest.Mocked<ISwipeRepository>)

const makeChatPort = (): jest.Mocked<IChatPort> => ({
  createOrGetChat: jest.fn().mockResolvedValue({ chatId: 'chat-1' }),
} as jest.Mocked<IChatPort>)

describe('RecordSwipeUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws NOT_FOUND (404) when candidate profile does not exist', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue(null)
    const uc = new RecordSwipeUseCase(repo, makeChatPort())
    await expect(uc.execute('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
  // ...
})
```

**Pattern to copy for GetFeedUseCase test:**
- `make<Port>()` factory functions for each dependency (repo, rec, cache)
- Use `jest.Mocked<IPort>` type with `jest.fn()` for each method
- For `ICachePort` mock in unit tests: use `ioredis-mock` via `RedisAdapter` OR a plain `jest.Mocked<ICachePort>` — prefer plain jest mock for use-case unit tests (faster, no ioredis-mock install needed in test scope):
  ```typescript
  import type { ICachePort } from '../../src/application/ports/cache.port'
  
  const makeCache = (): jest.Mocked<ICachePort> => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
  })
  ```
- `beforeEach(() => jest.clearAllMocks())`
- TDD: write the test before the implementation exists (it will compile-error or fail)

**Test cases required (SCALE-01):**
1. Cache MISS — `cache.get` returns `null` → calls repo + rec → calls `cache.set`
2. Cache HIT — `cache.get` returns serialized JSON → returns parsed result without calling repo
3. With cursor — `cursor` provided → skips cache read AND skips cache write
4. After execution with cache hit — `rec.computeFitScore` is NOT called

---

### `tests/unit/get-ranking.use-case.test.ts` (unit test, NEW)

**Analog:** `tests/unit/record-swipe.use-case.test.ts` (same pattern as get-feed test above)

**Test cases required (SCALE-02):**
1. Cache MISS — `cache.get` returns `null` → calls repo + rec → calls `cache.set` with TTL 30
2. Cache HIT — `cache.get` returns JSON → returns parsed result, `rec.computeFitScore` NOT called
3. Forbidden (not recruiter) — `findRecruiterProfileByUserId` returns `null` → throws FORBIDDEN 403
4. Job not found — throws NOT_FOUND 404

---

### `tests/unit/record-swipe.use-case.test.ts` (unit test, MODIFY)

**Analog:** `tests/unit/record-swipe.use-case.test.ts` (self — modify)

**Current use-case constructor** will gain a third `cache: ICachePort` argument. The existing test at line 27 constructs `new RecordSwipeUseCase(repo, makeChatPort())` — this will break once the constructor signature changes.

**Update pattern:**
```typescript
// Add makeCache() factory (same pattern as makeChatPort)
const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})

// Update every construction site:
const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache())

// Add new test case for cache invalidation:
it('calls cache.del with feed key after successful swipe', async () => {
  const repo = makeSwipeRepo()
  repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
  repo.findJobById.mockResolvedValue(activeJob as any)
  repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
  const cache = makeCache()
  const uc = new RecordSwipeUseCase(repo, makeChatPort(), cache)
  await uc.execute('user-1', 'job-1', 'LIKE')
  expect(cache.del).toHaveBeenCalledWith('feed:cand-1')
})
```

---

### `tests/unit/upsert-candidate-profile.use-case.test.ts` (unit test, MODIFY)

**Analog:** `tests/unit/upsert-candidate-profile.use-case.test.ts` (self — modify)

**Current construction** (line 14): `new UpsertCandidateProfileUseCase(repo)` — will break once constructor gains `cache` arg.

**Update pattern:**
```typescript
import type { ICachePort } from '../../src/application/ports/cache.port'

const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})

// Update construction:
const uc = new UpsertCandidateProfileUseCase(repo, makeCache())

// Add new test case:
it('calls cache.invalidatePattern("ranking:*") after upsertProfile', async () => {
  const repo = makeRepo()
  const cache = makeCache()
  repo.upsertProfile.mockResolvedValue({ id: 'cand-1' } as any)
  const uc = new UpsertCandidateProfileUseCase(repo, cache)
  await uc.execute('user-1', { name: 'Alice', professionId: 'backend-dev', skills: ['nodejs'], preferredModalities: ['REMOTE'] } as any)
  expect(cache.invalidatePattern).toHaveBeenCalledWith('ranking:*')
})
```

---

### `tests/integration/indexes.test.ts` (integration test, NEW)

**Analog:** `tests/integration/swipe.test.ts` for setup pattern; query pattern is unique (raw SQL EXPLAIN).

**Setup pattern** (swipe.test.ts lines 1–7):
```typescript
import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { prisma } from '../../src/infrastructure/database/prisma'
```

**Setup import:** Use `import '../helpers/setup'` at top — this connects to test DB and runs migrations (`setup.ts` lines 4–11).

**EXPLAIN query pattern** (no existing analog — use raw Prisma `$queryRaw`):
```typescript
it('Swipe.candidateId uses index scan', async () => {
  const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
    EXPLAIN SELECT * FROM "Swipe" WHERE "candidateId" = '00000000-0000-0000-0000-000000000001'
  `
  const plan = result.map(r => r['QUERY PLAN']).join('\n')
  expect(plan).toMatch(/Index/)
})
```

**Four test cases required (SCALE-04):**
1. `Swipe.candidateId` — `EXPLAIN SELECT * FROM "Swipe" WHERE "candidateId" = ...` → plan contains `Index`
2. `Swipe.jobId` — `EXPLAIN SELECT * FROM "Swipe" WHERE "jobId" = ...` → plan contains `Index`
3. `Job.isActive + expiresAt` — `EXPLAIN SELECT * FROM "Job" WHERE "isActive" = true AND "expiresAt" > NOW()` → plan contains `Index`
4. `CandidateProfile.professionId` — `EXPLAIN SELECT * FROM "CandidateProfile" WHERE "professionId" = ...` → plan contains `Index`

**No `buildApp` needed** — index tests only need `prisma` from the test DB.

---

## Shared Patterns

### Constructor Injection of Port (apply to all modified use cases)

**Source:** `src/application/use-cases/swipe/record-swipe.use-case.ts` lines 7–11
```typescript
export class RecordSwipeUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly chat: IChatPort,
  ) {}
```
**Apply to:** `GetFeedUseCase`, `GetRankingUseCase`, `RecordSwipeUseCase`, `UpsertCandidateProfileUseCase` — all gain `private readonly cache: ICachePort` as a constructor argument. Import path: `../../ports/cache.port` (for swipe use cases) or `../../../application/ports/cache.port` (for candidate use case).

---

### Error Handling in Controllers (apply to all controller modifications)

**Source:** `src/adapters/controllers/candidate.controller.ts` lines 24–33
```typescript
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
```
**Apply to:** All handler methods in `CandidateController` (unchanged — this pattern is already present and must not be removed when adding `opts` constructor).

---

### opts Type Pattern for Routes (apply to candidate.routes.ts)

**Source:** `src/infrastructure/http/routes/swipe.routes.ts` lines 8–11
```typescript
type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository }

export async function swipeRoutes(app: FastifyInstance, opts: SwipeRouteOpts): Promise<void> {
  const ctrl = new SwipeController(opts)
```
**Apply to:** `candidateRoutes` — define `type CandidateRouteOpts = { cache: ICachePort }` and pass `opts` to `new CandidateController(opts)`.

---

### Cache Read with Fallback (apply to all use-case cache reads)

**Source:** RESEARCH.md Pitfall 4 (Redis connection errors propagating as 500)

Wrap every `cache.get()` and `cache.set()` in a use case with try/catch. Failures silently fall through to source-of-truth:
```typescript
let cached: string | null = null
try { cached = await this.cache.get(cacheKey) } catch { /* Redis down — fall through */ }
if (cached) return JSON.parse(cached)

// ... compute result ...

try { await this.cache.set(cacheKey, JSON.stringify(result), ttlSeconds) } catch { /* Redis down — ok */ }
```
**Apply to:** `GetFeedUseCase.execute()`, `GetRankingUseCase.execute()`, `RecordSwipeUseCase.execute()` (del), `UpsertCandidateProfileUseCase.execute()` (invalidatePattern).

---

### Unit Test Factory Function Pattern (apply to all new/modified unit tests)

**Source:** `tests/unit/record-swipe.use-case.test.ts` lines 5–17
```typescript
const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  // ... all methods
} as jest.Mocked<ISwipeRepository>)
```
**Apply to:** All new unit test files. Add a `makeCache(): jest.Mocked<ICachePort>` factory alongside existing repo/port factories. Use `jest.fn().mockResolvedValue(null)` for `get` (cache miss default), `jest.fn().mockResolvedValue(undefined)` for `set`, `del`, `invalidatePattern`.

---

### Integration Test Setup Import (apply to all new integration tests)

**Source:** `tests/integration/swipe.test.ts` line 1 + `tests/helpers/setup.ts` lines 4–15
```typescript
import '../helpers/setup'  // connects to test DB, runs migrations, registers afterEach cleanup
```
**Apply to:** `tests/integration/indexes.test.ts` — import this at the top to get DB connection, migration, and afterEach cleanup for free.

The `setup.ts` `beforeAll` also sets `process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!` — this must come before any module that initializes the Prisma singleton. For Redis, a parallel override must be added to `setup.ts`:
```typescript
process.env.REDIS_URL = process.env.REDIS_URL_TEST!  // point singleton at redis_test (port 6380)
```

---

## No Analog Found

All 19 files have analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/application/ports/`, `src/adapters/services/`, `src/infrastructure/database/`, `src/application/use-cases/`, `src/adapters/controllers/`, `src/infrastructure/http/routes/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`, `scripts/`, `prisma/`, root config files
**Files scanned:** 22 source files read directly
**Pattern extraction date:** 2026-05-17
