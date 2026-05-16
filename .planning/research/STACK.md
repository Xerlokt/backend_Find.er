# Stack Research — v3.0

**Researched:** 2026-05-16
**Confidence:** HIGH for Redis/metrics/k6 (verified against npm/official sources), MEDIUM for DISC (no canonical npm package exists — build-from-scratch is the correct call)

---

## New Dependencies

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| `@fastify/redis` | `^7.2.0` | Redis connection plugin — feed/ranking/fit-score cache | Official Fastify org plugin. v7.x targets Fastify ^5.x (project uses Fastify 5.8.5). Uses ioredis 5 under the hood — do NOT install ioredis separately; it comes as a transitive dependency. No competing client needed. |
| `fastify-metrics` | `^13.1.0` | HTTP request counter + Prometheus `/metrics` endpoint | Supports Fastify >=4, Node >=20. Wraps `prom-client`. Exposes `http_requests_total` counter per route out-of-the-box — covers the Admin Dashboard "total requests" requirement without custom middleware. One plugin replaces the custom counter idea. |
| `prom-client` | `^15.1.0` | Prometheus metrics (pulled transitively by fastify-metrics) | Do not install separately. fastify-metrics manages its own prom-client version. Listed here for awareness only. |

### NOT installed as direct dependencies
- `ioredis` — comes transitively through `@fastify/redis`
- `@redis/client` (node-redis) — do NOT install. It is the newer official Redis client but `@fastify/redis` explicitly depends on ioredis. Mixing both clients creates two separate connection pools with no benefit.
- `prom-client` — comes transitively through `fastify-metrics`

### Dev / Tooling (no npm install — Docker only)
| Tool | Version | Purpose | How to run |
|------|---------|---------|-----------|
| k6 | `1.0` (released 2025-05-07) | Load testing baseline for Horizontal Scale phase | `grafana/k6:1.0` Docker image. Add a `k6` service to `docker-compose.yml`. Scripts are `.js` files mounted via volume. No npm package — k6 is a Go binary distributed as a Docker image. |

---

## Schema Additions (Prisma)

### New model: `DiscResult`

Stores the raw dimension scores (D, I, S, C on a 0-100 scale) and the computed dominant profile for a candidate. One row per candidate (upsert on re-test).

```prisma
model DiscResult {
  id          String           @id @default(uuid())
  candidateId String           @unique
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  scoreD      Float            // Dominance, 0-100
  scoreI      Float            // Influence, 0-100
  scoreS      Float            // Steadiness, 0-100
  scoreC      Float            // Conscientiousness, 0-100
  profile     String           // e.g. "D", "DI", "IS" — dominant dimension(s)
  completedAt DateTime         @default(now())
}
```

Add back-relation to `CandidateProfile`:
```prisma
// inside model CandidateProfile:
discResult DiscResult?
```

### New model: `CandidateWeights`

Stores per-candidate fit score weights learned from like history. One row per candidate (upsert after each batch of likes). All weights must sum to 1.0 — enforced in application layer, not DB constraint.

```prisma
model CandidateWeights {
  id            String           @id @default(uuid())
  candidateId   String           @unique
  candidate     CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  wProfession   Float            @default(0.30)
  wSkills       Float            @default(0.35)
  wLocation     Float            @default(0.20)
  wModality     Float            @default(0.10)
  wSalary       Float            @default(0.05)
  updatedAt     DateTime         @updatedAt
}
```

Add back-relation to `CandidateProfile`:
```prisma
// inside model CandidateProfile:
weights CandidateWeights?
```

### Job model additions (DISC desired profile)

Add a nullable `discProfile` field to `Job` — jobs can optionally declare a desired DISC profile. DISC factor is a soft signal, not a gate.

```prisma
// inside model Job:
discProfile String?  // nullable — e.g. "D", "SC", null means DISC not factored
```

### Indexes to add

Performance for swipe feed queries (needed before Redis cache lands — Redis reduces pressure but index is the foundation):

```prisma
// inside model Swipe:
@@index([candidateId])
@@index([jobId])

// inside model Job:
@@index([isActive, expiresAt])

// inside model CandidateProfile:
@@index([professionId])
```

### No new model for Admin Dashboard counters

`http_requests_total` is served by `fastify-metrics` from in-process Prometheus counters — not persisted in PostgreSQL. Persisting request counts to DB would be a write-amplification anti-pattern at scale. DAU (Daily Active Users) is computed at query time from `User.createdAt` and `Swipe.swipedAt` — no new table needed.

---

## DISC Algorithm — Build from Scratch (No Library)

No maintained npm library implements the DISC 28-question forced-choice scoring algorithm. The two or three GitHub projects found are toy implementations in unmaintained repos.

**Algorithm is simple enough to own:**

- 28 question blocks, each with 4 adjectives (one per D/I/S/C dimension)
- Forced choice: candidate picks "most like me" and "least like me" per block
- Scoring per block: most=2, least=0, the other two=1
- Sum per dimension across all 28 blocks → raw score (range: 28-56)
- Normalize to 0-100: `(raw - 28) / 28 * 100`
- Dominant profile: dimension(s) with score >= 70 (or top 1-2 if none reach threshold)

**Implementation location:** `src/domain/disc/disc-scorer.ts` — pure function, no DB, no framework dependency. Unit-testable with zero mocks. Question bank lives in `src/domain/disc/disc-questions.ts` as a typed constant array.

**Why not a library:** DISC scoring weights and question banks are proprietary to Wiley/Inscape Publishing for the official DiSC. Public implementations are either legally ambiguous clones of the proprietary assessment or simplified toy models. Owning a clean 28-question domain function costs ~80 LOC and avoids any IP concern.

---

## What NOT to Add

| Package / Approach | Why Avoid |
|-------------------|-----------|
| `ioredis` (direct install) | `@fastify/redis` already pulls it in. Double-install causes version conflicts and two connection pools. |
| `@redis/client` (node-redis) | The official `@fastify/redis` plugin is built on ioredis. Switching clients would require forking the plugin or writing a wrapper. No benefit for this use case. |
| `bull` / `bullmq` (job queues) | None of the v3.0 features require async job queues. BullMQ also needs ioredis as a peer dep — wait until there is an actual queue requirement. |
| `prom-client` (direct install) | Comes with `fastify-metrics`. Direct install risks version skew with what the plugin expects. |
| Redis Pub/Sub for cache invalidation | Single-process monolith. No need for distributed cache invalidation. Simple key-delete on write is sufficient. |
| Separate metrics store (InfluxDB, Grafana) | Over-engineering for an API-only backend. `fastify-metrics` exposes a `/metrics` Prometheus endpoint that can be scraped later if needed. The Admin Dashboard reads computed SQL aggregates — no time-series DB needed at v3.0. |
| `@nestjs/swagger` / OpenAPI generators | No OpenAPI requirement in v3.0 scope. Fastify's JSON Schema is sufficient. |
| GraphQL layer | REST is already validated across all v2.0 phases. No consumer benefits from GraphQL at this stage. |
| Separate Redis cluster for test environment | Integration tests do not require caching correctness. Cache layer can be bypassed in test config via env flag. A `redis_test` Docker service would add startup time with no test-quality benefit. |

---

## Integration Notes

### @fastify/redis into Fastify/Clean Architecture

Register as a Fastify plugin in `src/infrastructure/http/plugins/`. Do NOT inject the Redis client into domain or application layers — only the infrastructure layer touches it.

```typescript
// src/infrastructure/http/plugins/redis.plugin.ts
import fp from 'fastify-plugin'
import redis from '@fastify/redis'

export default fp(async (app) => {
  await app.register(redis, { url: process.env.REDIS_URL })
})
```

The cache-aside logic belongs in a new `RedisCache` adapter class in `src/adapters/services/redis-cache.adapter.ts`. Use cases receive an `ICache` port (interface in `src/domain/ports/`), keeping the domain layer ignorant of Redis. This is consistent with how `IHashPort`, `ITokenPort`, and `IGraphPort` already work in v2.0.

### fastify-metrics into Fastify

Register before route plugins. Exposes `GET /metrics` Prometheus endpoint. The Admin Dashboard "total requests" endpoint becomes a direct read of the `http_requests_total` counter via `app.metrics.client`.

```typescript
// src/infrastructure/http/plugins/metrics.plugin.ts
import fp from 'fastify-plugin'
import metricsPlugin from 'fastify-metrics'

export default fp(async (app) => {
  await app.register(metricsPlugin, { endpoint: '/metrics' })
})
```

Admin Dashboard route for total requests aggregates via `app.metrics.client.getMetricsAsJSON()` — no additional middleware counter needed.

### k6 in Docker Compose

Add to the existing `docker-compose.yml` as a standalone service. Do not add to the default `up` — run explicitly with `docker compose run k6`:

```yaml
k6:
  image: grafana/k6:1.0
  volumes:
    - ./tests/load:/scripts
  profiles:
    - load-test
  depends_on:
    - postgres
    - neo4j
  network_mode: host
```

Scripts live in `tests/load/` (separate from `tests/unit/` and `tests/integration/`). Run with:
```
docker compose --profile load-test run k6 run /scripts/swipe-feed.js
```

Using `profiles: [load-test]` means k6 does not start with `docker compose up` — it is opt-in only.

### Neo4j graph traversal — no new package

The `RecommendationRepository` already has `RELATED_TO {weight: 0.8}` edges seeded. The v3.0 change is a Cypher query update inside `computeFitScore()` — replace the in-memory exact-match loop with a parameterized Cypher `MATCH (s:Skill)-[:RELATED_TO*1..2]->(adj)` traversal. The neo4j-driver v6.0.1 already installed handles this. No new npm package.

The traversal weight reduces the adjacent skill's contribution: a directly required skill scores 1.0, a first-degree adjacent skill scores 0.8 (the `RELATED_TO.weight`), so the skills factor remains bounded between 0 and 1.

### DISC in the fit score pipeline

DISC is a new factor added to `computeFitScore()`. Weight allocation recommendation:

| Factor | v2.0 weight | v3.0 weight |
|--------|------------|------------|
| Profession | 0.30 | 0.25 |
| Skills (graph) | 0.35 | 0.30 |
| Location | 0.20 | 0.20 |
| Modality | 0.10 | 0.10 |
| Salary | 0.05 | 0.05 |
| DISC | 0.00 | 0.10 |

DISC factor is 0 when either the candidate has no `DiscResult` or the job has no `discProfile` (null-safe fallback — proportionally redistribute the 10% across other factors so the total still sums to 1.0).

### Learning System weights and the fit score pipeline

`CandidateWeights` rows are read from PostgreSQL at recommendation time, overriding the default factor weights. The `IRecommendationRepository.computeFitScore()` signature needs a new optional `weights` parameter:

```typescript
computeFitScore(
  candidate: FitScoreInput,
  job: FitScoreJobInput,
  weights?: CandidateWeightInput   // from CandidateWeights table, falls back to defaults
): Promise<number>
```

The weight update logic (recalculate based on like history) runs in a new use case `UpdateCandidateWeightsUseCase` triggered after each `LIKE` swipe. This is a PostgreSQL write — no new infrastructure.

---

## Sources

- [@fastify/redis npm](https://www.npmjs.com/package/@fastify/redis) — v7.2.0, Fastify ^5.x, ioredis ^5.3.2 dependency (MEDIUM confidence via WebSearch, verified against release history)
- [fastify/fastify-redis GitHub](https://github.com/fastify/fastify-redis) — confirms ioredis is the underlying client
- [fastify-metrics npm](https://www.npmjs.com/package/fastify-metrics) — v13.1.0, Fastify >=4, Node >=20 (HIGH confidence — multiple sources agree)
- [ioredis npm](https://www.npmjs.com/package/ioredis) — v5.10.1 latest (HIGH confidence)
- [oneuptime.com: ioredis vs node-redis](https://oneuptime.com/blog/post/2026-03-31-redis-choose-node-redis-vs-ioredis/view) — confirms @fastify/redis uses ioredis under the hood
- [redis.io migration guide](https://redis.io/docs/latest/develop/clients/nodejs/migration/) — official docs confirm node-redis as the new recommended client, but @fastify/redis has not migrated (MEDIUM confidence)
- [k6 GitHub releases](https://github.com/grafana/k6/releases) — v1.0 released 2025-05-07 (HIGH confidence)
- [grafana/k6 Docker Hub](https://hub.docker.com/r/grafana/k6) — Docker image confirmed
- [discprofile.com — How DiSC works](https://www.discprofile.com/what-is-disc/how-disc-works) — 28-question forced-choice structure (HIGH confidence)
- [kisu-io/disc-assessment GitHub](https://github.com/kisu-io/disc-assessment) — reviewed for algorithm, not suitable as a library dependency
- [Neo4j recommendation engine tutorial](https://neo4j.com/docs/getting-started/appendix/tutorials/guide-build-a-recommendation-engine/) — Cypher traversal patterns (HIGH confidence — official Neo4j docs)
