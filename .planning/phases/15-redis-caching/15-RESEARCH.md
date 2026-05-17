# Phase 15: Redis Caching — Research

**Researched:** 2026-05-17
**Domain:** Redis (ioredis), Clean Architecture port design, cache invalidation, Prisma @@index, check-deps.ts enforcement
**Confidence:** HIGH — all findings based on direct codebase inspection and verified library data

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCALE-01 | Candidate feed cached in Redis (TTL 60s), invalidated after candidate swipe | Cache Key Design section; Invalidation Strategy section; ICachePort design |
| SCALE-02 | Candidate ranking by job cached in Redis (TTL 30s), invalidated after profile update | Cache Key Design section; Invalidation Strategy section; UpsertCandidateProfile use case flow |
| SCALE-03 | check-deps.ts updated to block `infrastructure/*` imports from `application/` | check-deps.ts Current State section; SCALE-03 Change Required section |
| SCALE-04 | 4 PostgreSQL indexes added (Swipe by candidateId, Swipe by jobId, Job by isActive/expiresAt, CandidateProfile by professionId) | Prisma @@index section; Current Schema Gaps section |
</phase_requirements>

---

## Summary

Phase 15 has four independent work tracks that can be parallelized across plans: (1) the Redis cache layer behind `ICachePort`; (2) tightening the `check-deps.ts` architectural gate; (3) four Prisma `@@index` additions; (4) validation tests for all four requirements.

The largest design decision is where cache read/write/invalidate logic lives. Because `application/` cannot import `infrastructure/`, the cache must be injected as a port (`ICachePort`) defined in `application/ports/` and implemented by a `RedisAdapter` in `adapters/`. The use cases receive `ICachePort` through constructor injection, the same pattern used today for `IHashPort`, `ITokenPort`, and `IGraphPort`.

The two existing use cases that need caching — `GetFeedUseCase` (SCALE-01) and `GetRankingUseCase` (SCALE-02) — already accept two constructor arguments each. Adding a third (`ICachePort`) is minimally invasive. Invalidation requires two more entry points: `RecordSwipeUseCase` (after a swipe succeeds, delete candidate's feed key) and `UpsertCandidateProfileUseCase` (after profile upsert, delete all ranking keys that include this candidateId across all jobs, which is not feasible by exact key — a pattern-based invalidation with `SCAN` + `DEL` is the standard solution).

`check-deps.ts` already blocks `application/` from importing `adapters/` and `infrastructure/` via the rule `application must not import adapters or infrastructure`. The SCALE-03 requirement says that specifically `infrastructure/*` imports from `application/` must be blocked with a failure message distinguishing it from `adapters/` imports. The current rule covers this but the wording in the violation message does not distinguish the two forbidden categories. SCALE-03 is about also verifying the gap is airtight for the new `infrastructure/cache/` subdirectory — a dry run against the current codebase is needed to confirm zero false negatives before writing any cache code.

**Primary recommendation:** Implement in three plans. Plan 01: TDD setup (RED) — `ICachePort` interface, unit test skeletons for GetFeedUseCase and GetRankingUseCase with a mock cache, check-deps tightening, four @@index additions. Plan 02: RedisAdapter + Docker Compose Redis service + inject into use cases (GREEN). Plan 03: Integration smoke tests and validation.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ICachePort interface | application/ports | — | Ports live in application/ to avoid domain needing infrastructure knowledge |
| RedisAdapter (ioredis) | adapters/services | — | Adapters bridge ports to infrastructure; ioredis client must not leak into application/ |
| Redis singleton (connection) | infrastructure/database | — | DB singletons (prisma, neo4j, redis) belong in infrastructure/database/ |
| Cache key construction | application/use-cases | — | Key names are business decisions (candidateId-based, jobId-based); belong with the use case that owns the data |
| Cache invalidation trigger | application/use-cases | — | RecordSwipeUseCase and UpsertCandidateProfileUseCase own the state mutation; they own invalidation |
| Prisma @@index | infrastructure/database schema | — | Schema change, migration generated via `prisma migrate dev` |
| check-deps.ts rule | scripts/ | — | Existing enforcement script; not a src/ layer concern |
| Redis Docker service | docker-compose.yml | — | Infrastructure provisioning |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | 5.10.1 | Redis client for Node.js | Industry standard; built-in TypeScript types; supports pattern scan; 100% TypeScript [VERIFIED: npm registry] |

**Version verification:**
```
npm view ioredis version → 5.10.1 (verified 2026-05-17)
```

### Supporting (dev/test)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis-mock | 8.13.1 | In-memory ioredis drop-in for unit tests | Unit tests that exercise ICachePort without a real Redis instance [VERIFIED: npm registry] |

### Types

ioredis v5 ships its own TypeScript declarations (`index.d.ts` included in the package) — no `@types/ioredis` needed. [VERIFIED: npm view @types/ioredis version → 5.0.0 exists but is not the ioredis team's package; ioredis 5.x bundles its own declarations]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ioredis | node-redis (v4) | node-redis is the "official" client but ioredis has better TypeScript DX and pattern scan stream API; ioredis 5.x is the ecosystem standard for Node.js backends |
| ioredis-mock | real Redis in unit tests | Slower CI; unit tests must not depend on external services per CLAUDE.md TDD rule |

**Installation:**
```bash
npm install ioredis
npm install --save-dev ioredis-mock
```

---

## Architecture Patterns

### System Architecture Diagram

```
POST /swipes
    │
    ▼
RecordSwipeUseCase.execute()
    │
    ├── SwipeRepository.createSwipe()  [PostgreSQL write]
    │
    └── cache.del(`feed:${candidateId}`)  [Redis DEL — SCALE-01 invalidation]

PUT /candidates/me
    │
    ▼
UpsertCandidateProfileUseCase.execute()
    │
    ├── CandidateRepository.upsertProfile()  [PostgreSQL write]
    │
    └── cache.invalidatePattern(`ranking:*:${candidateId}`)
            │
            └── Redis SCAN match + DEL  [SCALE-02 invalidation]

GET /jobs/feed
    │
    ▼
GetFeedUseCase.execute()
    │
    ├── cache.get(`feed:${candidateId}`)
    │       ├── HIT → return cached JSON  [no Neo4j call]
    │       └── MISS ─────────────────────────────────────────────┐
    │                                                              │
    ├── SwipeRepository.findFeedJobs()  [PostgreSQL]              │
    ├── rec.computeFitScore() × N  [Neo4j traversal]              │
    └── cache.set(`feed:${candidateId}`, JSON, TTL=60s)  ◄────────┘

GET /jobs/:jobId/ranking
    │
    ▼
GetRankingUseCase.execute()
    │
    ├── cache.get(`ranking:${jobId}:${candidateId_requester}`)
    │   NOTE: ranking is per-recruiter but keyed by jobId only
    │   (all recruiters for same job get same cached result — acceptable)
    │       ├── HIT → return cached JSON
    │       └── MISS ─────────────────────────────────────────────┐
    │                                                              │
    ├── SwipeRepository.findSwipesByJobId()  [PostgreSQL]          │
    ├── rec.computeFitScore() × N  [Neo4j traversal]              │
    └── cache.set(`ranking:${jobId}`, JSON, TTL=30s)  ◄───────────┘
```

**Cache key design (CRITICAL):**

```
feed:{candidateId}             — one key per candidate, invalidated on swipe
ranking:{jobId}                — one key per job, invalidated on candidate profile update
```

**Ranking invalidation gap:** After a candidate's profile is updated, ALL ranking keys for all jobs that candidate has swiped on become stale. The cache key `ranking:{jobId}` is not scoped to the candidateId, so a single candidate profile update could affect many job rankings. The safest invalidation is: use `SCAN MATCH ranking:*` + `DEL` for all ranking keys (blunt but correct) OR require the use case to know which jobs the candidate has swiped on and delete those specific keys. The blunt approach is acceptable for a single-node Redis at this scale.

**Recommended invalidation for SCALE-02:**

```typescript
// In UpsertCandidateProfileUseCase.execute() after upsertProfile():
await this.cache.invalidatePattern('ranking:*')
// Deletes ALL ranking keys — stale-safe at expense of next-request recompute
// Acceptable: single-node Redis, low write frequency, 30s TTL anyway
```

### Recommended Project Structure (additions only)

```
src/
├── application/
│   └── ports/
│       └── cache.port.ts          # ICachePort interface (NEW — SCALE-03 requires it lives here, not infrastructure/)
├── adapters/
│   └── services/
│       └── redis.adapter.ts       # RedisAdapter implements ICachePort (NEW)
├── infrastructure/
│   └── database/
│       └── redis.ts               # getRedisClient() singleton (NEW — mirrors neo4j.ts pattern)
```

### Pattern 1: ICachePort Interface

**What:** Port interface in `application/ports/` that use cases depend on — no ioredis import.
**When to use:** Any use case that needs to read, write, or delete from cache.

```typescript
// src/application/ports/cache.port.ts
// Source: pattern mirrors existing hash.port.ts in this codebase [VERIFIED: direct read]
export interface ICachePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  invalidatePattern(pattern: string): Promise<void>
}
```

**Why `invalidatePattern` on the port:** The use case must be able to express "delete all ranking keys" without knowing it's implemented via Redis SCAN. The port method name is abstract — the adapter decides how to implement it (SCAN+DEL for Redis, `Object.keys().filter()` for mock).

### Pattern 2: RedisAdapter Implementation

```typescript
// src/adapters/services/redis.adapter.ts
// Source: ioredis README [CITED: github.com/redis/ioredis/blob/main/README.md]
import Redis from 'ioredis'
import { ICachePort } from '../../application/ports/cache.port'

export class RedisAdapter implements ICachePort {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds)
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Use SCAN + DEL to avoid KEYS blocking Redis [CITED: ioredis README scanStream]
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
}
```

**NEVER use `KEYS *` in production** — it blocks the Redis event loop for the full scan duration. Always use SCAN with a stream. [CITED: github.com/redis/ioredis/blob/main/README.md — scanStream]

### Pattern 3: Redis Singleton

```typescript
// src/infrastructure/database/redis.ts
// Mirrors neo4j.ts and prisma.ts singleton pattern [VERIFIED: direct read of those files]
import Redis from 'ioredis'

let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    redisClient = new Redis(url)
  }
  return redisClient
}
```

### Pattern 4: Injecting ICachePort into GetFeedUseCase

```typescript
// src/application/use-cases/swipe/get-feed.use-case.ts (updated signature)
// Source: current file [VERIFIED: direct read]
export class GetFeedUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
    private readonly cache: ICachePort,  // NEW — third constructor arg
  ) {}

  async execute(userId: string, cursor: string | undefined, limit: number) {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    // Only cache the first page (no cursor) — paginated requests are uncached
    // Rationale: cursor-based pages are transient and rarely repeated
    const cacheKey = `feed:${candidate.id}`
    if (!cursor) {
      const cached = await this.cache.get(cacheKey)
      if (cached) return JSON.parse(cached)
    }

    const jobs = await this.repo.findFeedJobs(candidate.id, cursor, limit)
    const hasNext = jobs.length > limit
    const data = hasNext ? jobs.slice(0, limit) : jobs
    const nextCursor = hasNext ? data[data.length - 1].id : null

    const scoredData = await Promise.all(
      data.map(async (job) => ({
        ...job,
        fitScore: await this.rec.computeFitScore(/* ... */)
      }))
    )
    const result = { data: scoredData, nextCursor }

    if (!cursor) {
      await this.cache.set(cacheKey, JSON.stringify(result), 60)  // TTL 60s (SCALE-01)
    }
    return result
  }
}
```

**Cache scope for feed:** Only cache the first page (no `cursor` param). Paginated requests (with cursor) are not cached — cursors encode a position in time and are not repeated requests that benefit from caching. This also avoids cache explosion from arbitrary cursor values.

**Cache scope for ranking:** Cache the full ranking array by jobId. All recruiters for the same job get the same ranking — acceptable because rankings are recomputed on profile update.

### Pattern 5: RecordSwipeUseCase Invalidation

```typescript
// src/application/use-cases/swipe/record-swipe.use-case.ts (updated)
// After swipe creates successfully — del candidate's feed key (SCALE-01)
const swipe = await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })
await this.cache.del(`feed:${candidate.id}`)  // invalidate after swipe
```

This requires `RecordSwipeUseCase` to receive `ICachePort` as a third constructor argument.

### Pattern 6: Composition Root (app.ts) Wiring

```typescript
// src/app.ts additions — mirrors neo4j singleton pattern [VERIFIED: direct read]
import { getRedisClient } from './infrastructure/database/redis'
import { RedisAdapter } from './adapters/services/redis.adapter'

// In buildApp():
const redisAdapter = new RedisAdapter(getRedisClient())

// Inject into swipe routes (feed uses GetFeedUseCase + GetRankingUseCase)
await app.register(swipeRoutes, {
  prefix: '/swipes',
  chat: chatService,
  neo4j: neo4jAdapter,
  cache: redisAdapter,   // NEW
})
await app.register(swipeJobRoutes, {
  prefix: '/jobs',
  chat: chatService,
  neo4j: neo4jAdapter,
  cache: redisAdapter,   // NEW
})

// Inject into candidate routes (upsert triggers ranking invalidation)
await app.register(candidateRoutes, { prefix: '/candidates', cache: redisAdapter })
```

**candidateRoutes currently takes no opts** [VERIFIED: direct read of candidate.routes.ts]. Adding `cache` requires adding an opts type to `candidateRoutes`, passing it to `CandidateController`, and then into `UpsertCandidateProfileUseCase`. This is the main wiring change for SCALE-02.

### Anti-Patterns to Avoid

- **Using KEYS * for invalidation:** Blocks Redis, O(N) scan of entire keyspace. Use `scanStream` instead.
- **Importing RedisAdapter from application/:** Violates layer rule; ICachePort is the contract, not the implementation.
- **Caching paginated requests (cursor != null):** Cache explosion; cursors are position tokens, not stable keys.
- **Importing ioredis in application/ or domain/:** Only `adapters/` and `infrastructure/` may import ioredis.
- **Storing null in cache:** Distinguish cache miss (null from Redis) from valid empty result (serialize as empty array `[]`). If `cache.get()` returns `null`, always recompute.
- **Not handling Redis connection errors:** RedisAdapter must not propagate connection errors to use cases as fatal errors — if Redis is down, fall through to the source-of-truth (Neo4j + Postgres). Wrap `cache.get()` in try/catch at the use case level or make the adapter swallow connection errors.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis client connection | Custom TCP implementation | ioredis | Handles reconnection, pipelining, sentinel, Lua scripting, TypeScript types |
| Pattern scan invalidation | Synchronous KEYS loop | ioredis `scanStream` | KEYS blocks; scanStream is async, non-blocking, safe for production |
| Unit test Redis mock | Jest manual mock | `ioredis-mock` | Drop-in replacement; API-compatible; no process needed |
| Cache TTL | Manual setTimeout + DEL | ioredis `set(key, val, 'EX', ttl)` | Redis native TTL is atomic and survives crashes |

---

## SCALE-03: check-deps.ts Current State and Required Change

### Current State (VERIFIED: direct read of scripts/check-deps.ts)

```typescript
const RULES = [
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

### Current Compliance Analysis

The rule `application must not import adapters or infrastructure` with `forbids: [/^adapters\//, /^infrastructure\//]` already blocks `application/` from importing anything in `infrastructure/`. SCALE-03 says to "update check-deps.ts to block imports of `infrastructure/*` in `application/`."

**Two possible interpretations:**

1. **The gap is already covered** — the existing rule already blocks it. SCALE-03 is a documentation/label improvement, not a logic change. The label should mention `infrastructure/` explicitly.

2. **The gap is real** — there is an issue with how `madge` resolves paths relative to `src/`. The `from: /^application\//` matches paths relative to the `src/` directory (madge is called with `'src/'` as the root). If `application/` imports something from `infrastructure/`, madge would report the dependency as `infrastructure/...`, which the forbids `/^infrastructure\//` regex would match. So the rule is logically complete.

**Resolution:** The existing rule covers SCALE-03 logically. The work for SCALE-03 is:
1. Run `npm run check:deps` dry run to confirm zero violations in current codebase before adding any cache code.
2. Confirm the regex `/^infrastructure\//` correctly matches paths for any file inside `src/infrastructure/` including the not-yet-created `infrastructure/database/redis.ts`.
3. Add a regression test comment or split the application rule into two named rules for clarity, so if someone adds an `infrastructure/cache/` folder the rule name explicitly says "infrastructure/ is forbidden."

**Recommended change (minimal):** Split the rule into two for clarity and traceable violation messages:

```typescript
{
  label: 'application must not import adapters',
  from: /^application\//,
  forbids: [/^adapters\//],
},
{
  label: 'application must not import infrastructure (including infrastructure/cache)',
  from: /^application\//,
  forbids: [/^infrastructure\//],
},
```

This change makes `npm run check:deps` produce a violation message that specifically names infrastructure in its label, satisfying the spirit of SCALE-03 — a clear, named gate against `infrastructure/cache/` being imported from `application/`.

**Dry-run before writing cache code:** Run `npm run check:deps` on the current codebase (Phase 14 code) and confirm output is `Dependency rule: OK`. If any violation appears it must be fixed before Phase 15 adds new imports.

---

## SCALE-04: Prisma @@index Additions

### Current Schema (VERIFIED: direct read of prisma/schema.prisma)

**Existing indexes:**
- `RefreshToken @@index([familyId])` — exists
- `RefreshToken @@index([userId])` — exists
- `Swipe @@unique([candidateId, jobId])` — unique constraint (also creates an index)
- `Chat @@unique([candidateId, companyId, jobId])` — unique constraint
- `Unlock @@unique([companyId, candidateId, jobId])` — unique constraint

**Missing indexes for SCALE-04:**

| Query Pattern | Model | Field(s) | @@index to Add | Use Case |
|---------------|-------|----------|----------------|----------|
| Swipe by candidateId | Swipe | `candidateId` | `@@index([candidateId])` | findFeedJobs excludes already-swiped; findSwipesByJobId filters |
| Swipe by jobId | Swipe | `jobId` | `@@index([jobId])` | findSwipesByJobId — loads all swipes for a job's ranking |
| Active job lookup | Job | `isActive`, `expiresAt` | `@@index([isActive, expiresAt])` | findFeedJobs WHERE isActive=true AND expiresAt > now() |
| Candidate by professionId | CandidateProfile | `professionId` | `@@index([professionId])` | Future: recommendation filter by profession; supports current findFeedJobs indirectly |

**Note on Swipe:** The existing `@@unique([candidateId, jobId])` creates a composite unique index. PostgreSQL can use this index for queries filtering on `candidateId` alone (leading column), so `@@index([candidateId])` on Swipe may be partially redundant. However, a dedicated index on `jobId` alone does not exist and is needed for `findSwipesByJobId`. SCALE-04 explicitly requires four indexes — add all four.

### Prisma Schema Changes

```prisma
model Swipe {
  // ... existing fields ...
  @@unique([candidateId, jobId])
  @@index([candidateId])       // NEW — SCALE-04
  @@index([jobId])             // NEW — SCALE-04
}

model Job {
  // ... existing fields ...
  @@index([isActive, expiresAt])  // NEW — SCALE-04
}

model CandidateProfile {
  // ... existing fields ...
  @@index([professionId])         // NEW — SCALE-04
}
```

**Migration command:**
```bash
npx prisma migrate dev --name add_scale04_indexes
```

This generates a migration file with `CREATE INDEX` statements. Success criterion 5 requires `EXPLAIN` on the four query patterns shows `Index Scan` (not `Seq Scan`). Run `EXPLAIN SELECT ...` on each pattern against the test DB after migration.

---

## Test Isolation Strategy for Redis

### Strategy: Separate `redis_test` Docker Compose service on port 6380

**Rationale:** Integration tests run against real DB services (postgres_test on port 5433, neo4j). The same isolation pattern should apply to Redis: a separate Redis instance for tests, flushable between test runs without touching the dev Redis.

**docker-compose.yml additions:**
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

**Environment variable:**
- `REDIS_URL=redis://localhost:6379` — development
- `REDIS_URL_TEST=redis://localhost:6380` — test

**Test setup (`tests/helpers/setup.ts` addition):**
```typescript
// Override REDIS_URL to test instance before any module loads redis singleton
process.env.REDIS_URL = process.env.REDIS_URL_TEST!
```

**Between-test flush:** After each test, call `redis.flushdb()` to clear all test-written keys. This mirrors the `prisma.xxx.deleteMany()` pattern in `afterEach`.

**Alternative rejected: ioredis-mock in integration tests**
ioredis-mock is suitable for unit tests. Integration tests test the actual HTTP flow (supertest → Fastify → use case → adapter → Redis). Using ioredis-mock there would prevent testing that the cache actually works end-to-end. A real Redis instance is required.

**Alternative rejected: BYPASS_CACHE env flag**
An env flag that skips the cache in tests would mean integration tests never exercise the cache read/write path — success criterion 1 ("identical response on second request") would be untestable. A real Redis test instance is superior.

### Unit Test Strategy (ioredis-mock)

For unit tests of `GetFeedUseCase`, `GetRankingUseCase`, `RecordSwipeUseCase`, `UpsertCandidateProfileUseCase` with cache:

```typescript
// Use ioredis-mock as ICachePort implementation in unit tests
import RedisMock from 'ioredis-mock'
import { RedisAdapter } from '../../../src/adapters/services/redis.adapter'

function makeCache(): ICachePort {
  return new RedisAdapter(new RedisMock())
}
```

ioredis-mock is a drop-in replacement: same API as ioredis, in-memory, no process needed. [VERIFIED: npm registry — ioredis-mock 8.13.1]

---

## Common Pitfalls

### Pitfall 1: Cache Key Collision Between Environments

**What goes wrong:** Dev and test Redis instances share the same keyspace if both use port 6379. A test that writes `feed:{candidateId}` can poison the dev cache or vice versa.

**Why it happens:** Single Redis with no DB separation; both environments use the same default DB (0).

**How to avoid:** Use separate ports (6379 for dev, 6380 for test). Enforce via `REDIS_URL_TEST` env var overridden in `tests/jest.setup-env.ts` before any module imports the singleton.

**Warning signs:** Feed test fails intermittently due to stale cached data from a previous test run.

---

### Pitfall 2: Importing ioredis in application/ Layer

**What goes wrong:** A developer imports `Redis` from `ioredis` inside a use case to perform a cache operation directly.

**Why it happens:** Shortcutting the port/adapter indirection for convenience.

**How to avoid:** `ICachePort` in `application/ports/cache.port.ts` must be the only interface use cases see. `npm run check:deps` will catch this — but only AFTER the rule is confirmed to be airtight (see SCALE-03). Verify with dry run before writing any cache code.

**Warning signs:** `tsc` compiles fine but `npm run check:deps` reports `VIOLATION [application must not import infrastructure]: application/use-cases/swipe/get-feed.use-case.ts → infrastructure/database/redis.ts`.

---

### Pitfall 3: Caching Paginated Requests (cursor != null)

**What goes wrong:** Caching `GET /jobs/feed?cursor=<UUID>` with a key `feed:{candidateId}:{cursor}` creates an unbounded number of cache keys per candidate (one per cursor position).

**Why it happens:** Treating all feed requests as equivalent.

**How to avoid:** Only cache the first page (no cursor). If cursor is present, skip cache entirely (compute and return, do not write to cache). Document this in the use case with a comment.

---

### Pitfall 4: Redis Connection Errors Propagating as 500

**What goes wrong:** If Redis is unavailable (e.g., Docker restart), every feed request fails with a connection error rather than falling through to Neo4j + Postgres.

**Why it happens:** `await this.cache.get(key)` throws if Redis is down.

**How to avoid:** Wrap cache reads in try/catch at the use case level:
```typescript
let cached: string | null = null
try { cached = await this.cache.get(cacheKey) } catch { /* Redis down — fall through */ }
if (cached) return JSON.parse(cached)
```

Or implement the "cache aside fallback" pattern in `RedisAdapter` itself (swallow connection errors, return `null` for get). The use case approach is more explicit and testable.

---

### Pitfall 5: candidateRoutes opts typing

**What goes wrong:** `candidateRoutes` currently takes no opts parameter [VERIFIED: direct read]. Adding a `cache` opt requires: (1) define an opts type in `candidate.routes.ts`; (2) pass `cache` to `CandidateController`; (3) `CandidateController` must accept `ICachePort` and pass it to `UpsertCandidateProfileUseCase`; (4) `UpsertCandidateProfileUseCase` must accept `ICachePort`.

**Why it happens:** Profile update (SCALE-02 invalidation trigger) requires threading cache through a route/controller that was designed cache-unaware.

**How to avoid:** Design the wiring chain before writing any use case code. Three files need coordinated changes: `candidate.routes.ts`, `candidate.controller.ts`, `upsert-candidate-profile.use-case.ts`.

---

### Pitfall 6: Prisma Unique vs Index — Redundant Index on Swipe.candidateId

**What goes wrong:** Adding `@@index([candidateId])` on `Swipe` when `@@unique([candidateId, jobId])` already exists — some engineers assume the composite unique index already covers single-column `candidateId` queries and skip adding the dedicated index.

**Why it happens:** PostgreSQL CAN use a composite index `(candidateId, jobId)` for queries filtering on `candidateId` alone (the leading column). So `@@index([candidateId])` is technically redundant.

**How to avoid:** SCALE-04 explicitly requires four index entries in the schema. Add the explicit `@@index([candidateId])` as required. It signals intent clearly and costs minimal storage.

---

## Code Examples

### ICachePort (full interface)

```typescript
// src/application/ports/cache.port.ts
// Mirrors IHashPort pattern [VERIFIED: direct read of hash.port.ts]
export interface ICachePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  invalidatePattern(pattern: string): Promise<void>
}
```

### ioredis set with EX (TTL)

```typescript
// Source: ioredis README [CITED: github.com/redis/ioredis/blob/main/README.md]
await redis.set('key', 'value', 'EX', 60)  // expires in 60 seconds
```

### ioredis scanStream for pattern invalidation

```typescript
// Source: ioredis README scanStream section [CITED: github.com/redis/ioredis/blob/main/README.md]
const stream = redis.scanStream({ match: 'ranking:*', count: 100 })
stream.on('data', (keys: string[]) => {
  keys.forEach((key) => pipeline.del(key))
})
```

### Prisma @@index syntax

```prisma
// Source: Prisma schema syntax [ASSUMED — Prisma docs standard pattern]
model Swipe {
  @@index([candidateId])
  @@index([jobId])
}
model Job {
  @@index([isActive, expiresAt])
}
model CandidateProfile {
  @@index([professionId])
}
```

### Docker Compose Redis service

```yaml
# [VERIFIED: docker hub redis:7 image standard]
redis:
  image: redis:7
  ports:
    - '6379:6379'
redis_test:
  image: redis:7
  ports:
    - '6380:6379'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-redis (official) dominant | ioredis equally popular; bundled TypeScript types preferred | ~2020 | ioredis 5.x is the standard for TypeScript backends |
| `KEYS *` pattern matching | `SCAN` with cursor iteration | Redis 2.8+ | KEYS blocks; SCAN is non-blocking and production-safe |
| @types/ioredis separate package | Types bundled in ioredis v5 | ioredis v5 (2022) | No @types/ install needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Only cache first page of feed (no cursor) — paginated pages uncached | Architecture Patterns | If second-page responses are also expensive, caching strategy needs revision |
| A2 | Blunt `invalidatePattern('ranking:*')` (invalidate ALL rankings) is acceptable for SCALE-02 | Cache key design narrative | If there are hundreds of active jobs, this causes mass cache miss on every profile update — could add candidate's jobIds to context and delete selectively |
| A3 | Prisma `@@index([isActive, expiresAt])` on Job covers the feed query's WHERE clause | SCALE-04 section | If Prisma generates a different index name or PostgreSQL query planner doesn't use it, EXPLAIN must be verified post-migration |
| A4 | Ranking is keyed by `jobId` only (not per-recruiter) — all recruiters for a job share the cached result | Cache Key Design | If different recruiters can see different ranking results (e.g., future recruiter-scoped access), key must include recruiterId |

**If this table is empty:** It does not apply — 4 assumptions listed above.

---

## Open Questions

1. **Redis error handling strategy**
   - What we know: Redis connection errors will throw from ioredis
   - What's unclear: Should RedisAdapter swallow all errors (simple, opaque) or should use cases wrap cache calls in try/catch (explicit, testable)?
   - Recommendation: Use cases wrap with try/catch — it keeps `RedisAdapter.get()` throwing on real errors (so tests can detect failures) while allowing the feed to gracefully degrade

2. **Ranking cache scope: per-recruiter or per-job?**
   - What we know: Current `GetRankingUseCase` returns the same data for all recruiters who own the job (ownership check is per-recruiter but result set is the same)
   - What's unclear: Will Phase 16 (Recruiter Skill Preview) or later phases add per-recruiter customization to the ranking response?
   - Recommendation: Key by `ranking:{jobId}` for now; easy to scope to `ranking:{jobId}:{recruiterId}` in a later phase

3. **Feed invalidation granularity: per-page or all-pages?**
   - What we know: Only first page is cached (recommendation above)
   - What's unclear: Should the cache key include the `limit` param? (e.g., `feed:{candidateId}:20`)
   - Recommendation: No — default limit is 20, caching one key per candidate is sufficient; non-default limits are uncommon

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Redis service | Yes | 29.2.0 | — |
| Docker Compose | Redis service | Yes | v5.0.2 | — |
| redis-cli | Manual inspection | No | — | Use `docker exec -it redis redis-cli` |
| ioredis | RedisAdapter | Not installed | (5.10.1 on npm) | Install via `npm install ioredis` |
| ioredis-mock | Unit tests | Not installed | (8.13.1 on npm) | Install via `npm install --save-dev ioredis-mock` |
| Redis Docker image | redis service | Available via Docker Hub | redis:7 | — |

**Missing dependencies that require installation before implementation:**
- `ioredis` — not in node_modules [VERIFIED: checked node_modules]; install in Wave 0
- `ioredis-mock` — not in node_modules; install in Wave 0

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest tests/unit --runInBand --no-coverage` |
| Full suite command | `npx jest --runInBand --no-coverage` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCALE-01 | Second feed request (same candidateId, no cursor) returns identical response without Neo4j call | integration | `npx jest tests/integration/swipe.test.ts -t "cache"` | Add to existing file |
| SCALE-01 | After swipe, next feed request re-runs Neo4j (cache miss) | integration | `npx jest tests/integration/swipe.test.ts -t "invalidate feed"` | Add to existing file |
| SCALE-01 | GetFeedUseCase returns cached value on second call (unit) | unit | `npx jest tests/unit/get-feed.use-case.test.ts` | New file |
| SCALE-02 | After profile update, ranking cache is invalidated | integration | `npx jest tests/integration/swipe.test.ts -t "invalidate ranking"` | Add to existing file |
| SCALE-02 | GetRankingUseCase.execute() calls cache.invalidatePattern after delegate | unit | `npx jest tests/unit/get-ranking.use-case.test.ts` | New file |
| SCALE-03 | `npm run check:deps` exits 1 when application/ imports infrastructure/ | script | `npx jest tests/unit/check-deps.test.ts` | New file |
| SCALE-04 | EXPLAIN on swipe-by-candidateId uses index seek | integration | `npx jest tests/integration/indexes.test.ts` | New file |
| SCALE-04 | EXPLAIN on job-by-isActive-expiresAt uses index seek | integration | `npx jest tests/integration/indexes.test.ts` | New file |

### Sampling Rate

- **Per task commit:** `npx jest tests/unit --runInBand --no-coverage`
- **Per wave merge:** `npx jest --runInBand --no-coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/get-feed.use-case.test.ts` — covers SCALE-01 unit (cache hit, cache miss, no-cursor-only caching)
- [ ] `tests/unit/get-ranking.use-case.test.ts` — covers SCALE-02 unit (cache hit, invalidation on ranking result)
- [ ] `tests/integration/indexes.test.ts` — covers SCALE-04 (EXPLAIN queries confirm index seeks)
- [ ] Install: `npm install ioredis` and `npm install --save-dev ioredis-mock`
- [ ] `docker-compose.yml` redis and redis_test services — required before integration tests can connect

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | JWT path unchanged |
| V3 Session Management | No | Cache is data-only, not session state (REQUIREMENTS.md Out of Scope: "JWT is stateless, cache is apenas para dados de leitura") |
| V4 Access Control | Yes | Cached feed is scoped to candidateId in the key — one candidate cannot access another's cached feed |
| V5 Input Validation | No | Cache keys are constructed from authenticated userId/candidateId, never from user-controlled input |
| V6 Cryptography | No | Redis data is not encrypted at rest (acceptable for non-PII feed/ranking data at this scale) |

### Known Threat Patterns for Redis + Clean Architecture

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cache key injection — if key includes user-controlled data | Tampering | Keys use internal IDs (candidateId UUID from DB), never raw user input |
| Sensitive data in Redis — ranking exposes profile data | Information Disclosure | Ranking response already censors DISLIKE profiles (existing logic); cached version preserves censoring |
| Redis accessible without auth in dev | Elevation of Privilege | Dev Redis (port 6379) should be localhost-only; Docker default is acceptable |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 15 |
|-----------|-------------------|
| Clean Architecture: routes → service → repository; no layer skipping | ICachePort must live in `application/ports/`, RedisAdapter in `adapters/`, getRedisClient() in `infrastructure/database/` |
| SOLID: SRP; services do not import DB clients directly | Use cases import ICachePort (interface), not Redis or RedisAdapter |
| Módulos isolados: módulos não importam diretamente de outros módulos | RedisAdapter in adapters/ does NOT import from any other module's files |
| Queries via Prisma ORM only — no raw SQL interpolation | Prisma @@index additions use schema syntax, not raw SQL |
| Inputs validated with Zod | No new endpoints in this phase; existing endpoints unaffected |
| TDD obrigatório: test primeiro, depois implementação | Wave 0 in Plan 01 must create failing tests before any use case code is written |
| Unitários: `tests/unit/` — por service, sem DB | GetFeedUseCase and GetRankingUseCase unit tests use ioredis-mock, no real Redis |
| Integração: `tests/integration/` — contra DB real (Docker) | Integration tests require real Redis (redis_test on port 6380) |
| Sem mocks de banco nos testes de integração | ioredis-mock is allowed in `tests/unit/`; `tests/integration/` must use real Redis |

---

## Sources

### Primary (HIGH confidence — codebase direct inspection)

- `src/application/ports/hash.port.ts` — ICachePort structural model
- `src/application/use-cases/swipe/get-feed.use-case.ts` — current feed use case
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — current ranking use case
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — swipe invalidation trigger
- `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` — profile update invalidation trigger
- `src/adapters/repositories/swipe.repository.ts` — findFeedJobs, findSwipesByJobId query patterns
- `src/adapters/repositories/candidate.repository.ts` — upsertProfile implementation
- `src/adapters/controllers/candidate.controller.ts` — current no-opts design
- `src/infrastructure/http/routes/candidate.routes.ts` — no-opts route design
- `src/infrastructure/http/routes/swipe.routes.ts` — opts type pattern (model for adding cache)
- `src/infrastructure/database/neo4j.ts` / `prisma.ts` — singleton patterns to mirror for Redis
- `src/app.ts` — composition root; injection patterns for neo4jAdapter
- `scripts/check-deps.ts` — current rules (SCALE-03 current state)
- `prisma/schema.prisma` — current indexes; models for @@index additions
- `docker-compose.yml` — existing services; Redis service additions
- `tests/helpers/setup.ts` — afterEach cleanup pattern for Redis flush
- `package.json` — confirmed ioredis not installed

### Secondary (MEDIUM confidence — verified from official sources)

- [CITED: github.com/redis/ioredis/blob/main/README.md] — set EX, scanStream, connection string format
- [VERIFIED: npm registry] — ioredis 5.10.1 latest; ioredis-mock 8.13.1 latest; ioredis bundles its own types

### Tertiary (LOW confidence — assumed)

- Prisma `@@index` migration command syntax [ASSUMED — standard Prisma pattern]
- `invalidatePattern('ranking:*')` blunt approach acceptable at this scale [ASSUMED — depends on write frequency]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm verified versions, ioredis type bundling confirmed
- Architecture: HIGH — ICachePort/RedisAdapter pattern traced against existing codebase port patterns
- SCALE-03 check-deps: HIGH — direct read of check-deps.ts confirms current rule coverage
- SCALE-04 Prisma indexes: HIGH — schema directly read; indexes mapped to query patterns in swipe.repository.ts
- Test isolation strategy: HIGH — mirrors existing postgres_test / neo4j test isolation pattern
- Cache invalidation: MEDIUM — blunt `invalidatePattern('ranking:*')` correctness assumed acceptable at this scale (A2)

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (stable stack; ioredis 5.x is not in active breaking-change development)
