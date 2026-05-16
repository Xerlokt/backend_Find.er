# Architecture: v3.0 Feature Integration

**Project:** Job Tinder Backend v3.0
**Researched:** 2026-05-16
**Base:** v2.0 Clean Architecture — 4-layer rule mechanically enforced via `scripts/check-deps.ts`

---

## Layer Rule Reference

```
domain/          — pure interfaces + entities. Imports nothing from the project.
application/     — use cases + ports + domain errors. Imports domain only.
adapters/        — controllers + Prisma repos + service adapters. Imports application + domain.
                   May import infrastructure/database (prisma.ts, neo4j.ts). Must NOT import
                   infrastructure/http (routes, plugins, hooks).
infrastructure/  — Fastify app, routes, plugins, DB singletons. Imports all layers.
```

`scripts/check-deps.ts` enforces this mechanically via madge on every CI run.

---

## Feature 1: Graph Recommendation (Neo4j Skill Adjacency)

**New components:**
- `scripts/seed-neo4j.ts` — update to import from `src/infrastructure/database/neo4j` (the v2.0 path) and `src/adapters/services/recommendation.repository` (existing seed logic already in `RecommendationRepository.seedTaxonomy()`). The current script still references old v1.0 module paths — fix the import paths, no logic change needed.
- No new files required: `RELATED_TO` edges already seeded in `RecommendationRepository.seedTaxonomy()`. The traversal Cypher query is the missing piece.

**Modified components:**
- `src/domain/interfaces/recommendation.repository.interface.ts` — extend `IRecommendationRepository` with `computeFitScoreWithAdjacency(candidate: FitScoreInput, job: FitScoreJobInput, adjacencyBoost?: number): Promise<number>`. Alternatively, add an optional `useAdjacency?: boolean` flag to the existing `computeFitScore` signature — keep the interface minimal and backward-compatible.
- `src/adapters/services/recommendation.repository.ts` — add Cypher traversal for `RELATED_TO` edges in the skills factor. Query: for each required skill, also match skills one hop away via `RELATED_TO`. Apply a weight multiplier (e.g., 0.8, already seeded on the relationship) to adjacent skill matches. Replace the current in-memory exact-match loop with a Neo4j read query.
- `src/adapters/services/neo4j.adapter.ts` — thin wrapper over `RecommendationRepository`; no interface change needed unless you expose the adjacency variant separately.

**Data flow:**
`GetFeedUseCase` / `GetRankingUseCase` → `IRecommendationRepository.computeFitScore()` → `RecommendationRepository` (adapters) → Neo4j Cypher traversal via `RELATED_TO` edges → weighted skill score returned → fit score computed and returned.

**Layer placement:**
- Interface change: `domain/interfaces/`
- Cypher query logic: `adapters/services/recommendation.repository.ts`
- Seed script fix: `scripts/` (outside src, not subject to layer check)

**Key constraint:** The adjacency traversal goes into the adapter layer only. The use cases (`GetFeedUseCase`, `GetRankingUseCase`) call `IRecommendationRepository` exactly as today — no use-case changes needed unless you want to expose adjacency as a toggle.

---

## Feature 2: Learning System (Per-Candidate Weight Adjustments)

**New components:**
- `src/domain/entities/learning-weights.entity.ts` — `LearningWeights { candidateId: string; weights: WeightAdjustments; updatedAt: Date }`. `WeightAdjustments` is a plain object: `{ professionBoost?: number; skillsBoost?: number; locationBoost?: number; modalityBoost?: number; salaryBoost?: number }` — all optional, defaulting to 1.0 multiplier in the use case.
- `src/domain/interfaces/learning.repository.interface.ts` — `ILearningRepository { findByCandidateId(id: string): Promise<LearningWeights | null>; upsert(id: string, weights: WeightAdjustments): Promise<void> }`.
- `src/application/use-cases/swipe/update-learning-weights.use-case.ts` — called after a LIKE swipe is recorded. Reads current weights, increments the weight dimension(s) that contributed most to the fit score of the liked job, calls `ILearningRepository.upsert()`. Pure arithmetic in application layer — no DB imports.
- `src/adapters/repositories/learning.repository.ts` — Prisma repository implementing `ILearningRepository`. Stores JSON in a new `CandidateLearningWeights` PostgreSQL table.

**Modified components:**
- `prisma/schema.prisma` — add `CandidateLearningWeights` model: `{ id String @id; candidateId String @unique; weights Json; updatedAt DateTime @updatedAt }`. Relation from `CandidateProfile` optional — or standalone with `candidateId` as a bare string FK (simpler, avoids adding a Prisma relation field to `CandidateProfile` which would require a migration touching existing data).
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — after recording a LIKE, call `UpdateLearningWeightsUseCase` (or inline the weight update call if keeping things simple). Inject `ILearningRepository` as a new constructor param.
- `src/application/use-cases/swipe/get-feed.use-case.ts` and `get-ranking.use-case.ts` — inject `ILearningRepository`; fetch `LearningWeights` for the candidate before calling `computeFitScore`; pass `weights` as a parameter to a new `computeFitScoreWithWeights(candidate, job, weights)` overload on `IRecommendationRepository`.
- `src/domain/interfaces/recommendation.repository.interface.ts` — add `WeightAdjustments` type and extend `computeFitScore` to accept an optional weights parameter.

**Data store decision — new table (not JSON column on CandidateProfile):**
A separate `CandidateLearningWeights` table with `candidateId String @unique` and `weights Json` keeps the learning concern isolated. Storing it as a JSON column on `CandidateProfile` would couple the learning domain to the candidate profile schema and require touching a high-traffic row on every feed request for an unrelated concern. The standalone table allows independent migration, clear ownership, and the `ILearningRepository` interface stays cleanly separated.

**Layer placement:**
- Entity + interface: `domain/`
- Weight-update algorithm: `application/use-cases/swipe/`
- Prisma repository: `adapters/repositories/`
- Schema: `prisma/schema.prisma`

---

## Feature 3: Recruiter Skill Preview

**New components:**
- None strictly required — this is a data-shaping change in an existing use case.

**Modified components:**
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — currently returns `profile: null` for DISLIKE + not-unlocked candidates. Extend to return a `skillPreview` field for those candidates: `{ skillMatches: string[]; fitReasons: string[] }`. `skillMatches` = intersection of candidate skills and job requiredSkills (computed from the already-fetched `swipe.candidate.skills` and `job.requiredSkills` — no extra DB query). `fitReasons` = string array derived from which fit factors contributed most (profession match, top skills, modality). These are computed in-memory in the use case from already-loaded data.

**Data flow:**
`GetRankingUseCase.execute()` → for DISLIKE + not-unlocked: compute `skillMatches` from `swipe.candidate.skills ∩ job.requiredSkills`; derive `fitReasons` from factor scores already computed; return `{ candidateId, fitScore, rank, profile: null, skillPreview: { skillMatches, fitReasons } }`.

**Layer placement:**
- All logic: `application/use-cases/swipe/get-ranking.use-case.ts`
- No new domain types needed unless you want a named `SkillPreview` interface — add it to `src/domain/entities/` or inline the return type.

**Key constraint:** `swipe.candidate.skills` is already fetched by `ISwipeRepository.findSwipesByJobId()`. No new repository method needed. The censoring guarantee is preserved: `profile` remains `null` (name, avatarUrl, bio, salaryExpectation hidden). Only skill intersection and fit factor labels are exposed — no identity data.

---

## Feature 4: DISC Assessment

**New components:**
- `src/domain/entities/disc-result.entity.ts` — `DISCResult { id: string; candidateId: string; d: number; i: number; s: number; c: number; dominantType: 'D'|'I'|'S'|'C'; takenAt: Date }`. Pure data shape, no methods.
- `src/domain/interfaces/disc.repository.interface.ts` — `IDISCRepository { save(result: DISCResult): Promise<void>; findByCandidateId(candidateId: string): Promise<DISCResult | null> }`.
- `src/application/use-cases/disc/disc-scorer.ts` — pure function (not a class) `scoreDISC(answers: number[]): { d: number; i: number; s: number; c: number; dominantType: string }`. Takes an array of 24–28 integer answers (standard DISC format), outputs normalized scores 0–100 per dimension. Lives in application layer as a utility function — domain entity holds only the result shape, not the scoring algorithm.
- `src/application/use-cases/disc/submit-disc-assessment.use-case.ts` — `SubmitDISCAssessmentUseCase`: receives `{ candidateId, answers }`, calls `scoreDISC()`, constructs a `DISCResult`, calls `IDISCRepository.save()`.
- `src/application/use-cases/disc/get-disc-profile.use-case.ts` — `GetDISCProfileUseCase`: calls `IDISCRepository.findByCandidateId()`, returns result or throws `DomainError('NOT_FOUND')`.
- `src/adapters/repositories/disc.repository.ts` — Prisma implementation of `IDISCRepository`.
- `src/adapters/controllers/disc.controller.ts` — `DiscController`: handles `POST /candidates/:id/disc` and `GET /candidates/:id/disc`.
- `src/infrastructure/http/routes/disc.routes.ts` — registers routes, injects `IDISCRepository` into use cases via DI.

**Modified components:**
- `prisma/schema.prisma` — add `DISCResult` model: `{ id String @id; candidateId String @unique; d Float; i Float; s Float; c Float; dominantType String; takenAt DateTime @default(now()) }`. `candidateId @unique` because one result per candidate (re-taking overwrites via upsert).
- `src/app.ts` — register `discRoutes` under `/candidates` prefix.
- `src/domain/interfaces/recommendation.repository.interface.ts` — optionally extend `FitScoreInput` with `discResult?: { d: number; i: number; s: number; c: number }` so the fit score can incorporate DISC matching against job DISC profile. The job entity would need a `discProfile` field too — add to `Job` schema and `FitScoreJobInput`. This is a deferred concern: can be wired in the same phase or the next.

**DISC scoring placement rationale:**
The domain entity `DISCResult` is a pure data bag — it holds the scored output. The scoring algorithm (`scoreDISC()`) lives in `application/use-cases/disc/disc-scorer.ts` because it is business logic with no external dependencies. Domain should not know how DISC answers map to scores — that is a business rule, not a data contract. The use case orchestrates: receive answers → score → persist. This preserves the Clean Architecture principle that domain entities are data contracts and application use cases are behavior.

**Layer placement:**
- Entity + repository interface: `domain/`
- Scoring function + use cases: `application/use-cases/disc/`
- Prisma repository + controller: `adapters/`
- Routes: `infrastructure/http/routes/`

---

## Feature 5: Admin Dashboard

**New components:**
- `src/application/use-cases/admin/get-platform-metrics.use-case.ts` — `GetPlatformMetricsUseCase`: queries `IUserRepository.count()`, `ICreditRepository.sumRevenue()`, and reads from an in-memory/plugin-provided `IMetricsStore` (see below) for request counts. Returns `{ totalUsers, activeJobs, totalRevenue, requestCount }`.
- `src/application/ports/metrics.port.ts` — `IMetricsPort { getRequestCount(): number; incrementRequestCount(): void }`. Lives in `application/ports/` (same layer as `IHashPort`, `ITokenPort`, `IGraphPort` — this is the right location for ports consumed by use cases but implemented in infrastructure/adapters).
- `src/adapters/services/metrics.adapter.ts` — `InMemoryMetricsAdapter implements IMetricsPort`. Simple in-memory counter (`private count = 0`). Singleton pattern — one instance created at app startup, shared between the Fastify hook and the use case.
- `src/infrastructure/http/plugins/metrics.plugin.ts` — Fastify plugin that receives the `InMemoryMetricsAdapter` instance and registers a `onRequest` hook: `app.addHook('onRequest', async () => metricsAdapter.incrementRequestCount())`. This is the CORRECT way to count requests without polluting route handlers.

**Modified components:**
- `src/adapters/controllers/admin.controller.ts` — add `getPlatformMetrics()` method. Inject `IMetricsPort` (alongside existing `ICreditGrantPort`).
- `src/infrastructure/http/routes/admin.routes.ts` — add `GET /metrics` route bound to `ctrl.getPlatformMetrics()`.
- `src/application/use-cases/admin/get-transactions.use-case.ts` — extend or add a `sumRevenue()` method to `ICompanyRepository` (or `ICreditRepository`) for revenue aggregation.
- `src/domain/interfaces/credit.repository.interface.ts` — add `sumRevenue(): Promise<number>` (sum of `CreditTransaction.amount` where `amount > 0`).
- `src/adapters/repositories/credit.repository.ts` — implement `sumRevenue()` via `prisma.creditTransaction.aggregate({ _sum: { amount: true } })`.
- `src/app.ts` — create `InMemoryMetricsAdapter` singleton; pass to `metricsPlugin` and to `adminRoutes`.

**Request metrics without route handler pollution:**
Use a Fastify `onRequest` lifecycle hook registered as a plugin. This fires before route handlers, is completely transparent to individual routes, and requires no change to any controller. The hook increments the counter on the shared `InMemoryMetricsAdapter`. The admin use case reads from the same adapter via `IMetricsPort`. The adapter lives in `adapters/services/` — it is infrastructure-adjacent but does not import Fastify, keeping it testable.

**Layer placement:**
- `IMetricsPort`: `application/ports/`
- `GetPlatformMetricsUseCase`: `application/use-cases/admin/`
- `InMemoryMetricsAdapter`: `adapters/services/`
- `metricsPlugin` (hook registration): `infrastructure/http/plugins/`
- Routes: `infrastructure/http/routes/`

---

## Feature 6: Redis Caching

**New components:**
- `src/application/ports/cache.port.ts` — `ICachePort { get<T>(key: string): Promise<T | null>; set<T>(key: string, value: T, ttlSeconds: number): Promise<void>; del(key: string): Promise<void> }`. Lives in `application/ports/` — same layer as all other ports. Use cases depend on this interface, not on the Redis client.
- `src/adapters/services/redis.adapter.ts` — `RedisAdapter implements ICachePort`. Uses `ioredis` (the standard Redis client for Node.js — full TypeScript types, cluster support, connection retry). Constructor accepts an `ioredis.Redis` instance injected from infrastructure. Implements `get/set/del` with JSON serialization.
- `src/infrastructure/database/redis.ts` — Redis singleton: `export function getRedisClient(): Redis { ... }`. Mirrors the `neo4j.ts` and `prisma.ts` singleton pattern. Reads `REDIS_URL` from env. Lazy init.

**Modified components:**
- `src/application/use-cases/swipe/get-feed.use-case.ts` — inject `ICachePort` as optional third constructor parameter. Before querying the recommendation layer, check cache: `key = feed:${candidateId}:${cursor ?? 'start'}:${limit}`. On miss: compute, cache for 60s. Cache invalidation: on `RecordSwipeUseCase` LIKE/DISLIKE, call `cache.del(`feed:${candidateId}:*`)`. Note: wildcard delete requires ioredis `keys` + bulk `del` — document this as a pattern in the adapter.
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — inject `ICachePort`. Cache key: `ranking:${jobId}`. TTL: 30s (ranking changes as new swipes arrive; shorter TTL avoids stale paywall decisions). Invalidation: on `RecordSwipeUseCase`.
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — inject `ICachePort`. After recording, call `cache.del()` for affected feed and ranking keys.
- `src/app.ts` — create `RedisAdapter` singleton from `getRedisClient()`; inject into swipe use cases via route opts. Add `REDIS_URL` to env requirements.
- `docker-compose.yml` — add Redis service.

**TTL strategy:**
- Feed cache: 60s. Feed is personalized per candidate + cursor. Stale for up to 60s is acceptable for UX.
- Ranking cache: 30s. Recruiters need near-real-time ranking updates as candidates swipe. 30s cap is a reasonable tradeoff.
- Invalidation trigger: `RecordSwipeUseCase` — any new swipe invalidates both the candidate's feed and the job's ranking.

**Where Redis fits in the layer diagram:**
```
application/ports/cache.port.ts     — ICachePort interface (domain-adjacent, no Redis import)
adapters/services/redis.adapter.ts  — RedisAdapter implements ICachePort (imports ioredis)
infrastructure/database/redis.ts    — Redis client singleton (imports ioredis, reads env)
```
Use cases import only `ICachePort` — they never touch `ioredis` directly. `app.ts` (infrastructure) wires `RedisAdapter(getRedisClient())` and injects it via constructor DI into use cases through route opts. This preserves the layer rule: `adapters/` imports `infrastructure/database/` (allowed) but not `infrastructure/http/` (forbidden, as enforced by `check-deps.ts`).

**Layer placement:**
- Interface: `application/ports/cache.port.ts`
- Adapter: `adapters/services/redis.adapter.ts`
- Singleton: `infrastructure/database/redis.ts`
- DI wiring: `src/app.ts`

---

## Cross-Feature Concerns

### Dependency Injection Pattern (consistent with v2.0)
All new dependencies (ICachePort, ILearningRepository, IDISCRepository, IMetricsPort) are injected via constructor parameters in use cases. Route files receive concrete instances via `opts` passed to `app.register()`. `app.ts` is the composition root — the only place where concrete adapters are instantiated and wired. No use case or controller instantiates a concrete class.

### check-deps.ts Compliance
Every new file must respect the layer rules:
- New `application/ports/cache.port.ts`, `metrics.port.ts` — import nothing. OK.
- New `adapters/services/redis.adapter.ts` — imports `application/ports/cache.port.ts` and `infrastructure/database/redis.ts`. The adapters → infrastructure/database import is currently allowed by the checker (only `infrastructure/http` is forbidden). OK.
- New `infrastructure/database/redis.ts` — imports `ioredis` only. OK.
- `adapters/services/metrics.adapter.ts` — imports `application/ports/metrics.port.ts` only. OK.
- `infrastructure/http/plugins/metrics.plugin.ts` — imports `adapters/services/metrics.adapter.ts`. Infrastructure importing adapters is allowed. OK.

### Prisma Migrations
Three new migrations are needed:
1. `CandidateLearningWeights` table (Feature 2)
2. `DISCResult` table (Feature 4)
3. `Job.discProfile Json?` column if DISC is wired into fit score in this milestone

Run `prisma migrate dev` for each new model. All existing 41 integration tests must stay green after each migration (additive-only schema changes).

---

## Suggested Build Order

### Phase 1 — Graph Recommendation
**Rationale:** Highest core-value feature. Pure adapter change (Cypher query update in `RecommendationRepository`). No new interfaces, no schema migration. Lowest risk — all 172 existing tests cover the integration surface. Fix the broken `scripts/seed-neo4j.ts` import paths in the same phase.

**Files touched:** `src/adapters/services/recommendation.repository.ts`, `scripts/seed-neo4j.ts`, optionally `src/domain/interfaces/recommendation.repository.interface.ts` (if adjacency is a toggle).

### Phase 2 — Redis Caching
**Rationale:** Redis infrastructure must be in place before the learning system adds more write-then-read patterns that would compound cache invalidation complexity. Also unblocks load testing baseline (k6). No schema migration. Pure infrastructure addition.

**Files touched:** `src/application/ports/cache.port.ts` (new), `src/adapters/services/redis.adapter.ts` (new), `src/infrastructure/database/redis.ts` (new), `src/application/use-cases/swipe/get-feed.use-case.ts` (inject ICachePort), `src/application/use-cases/swipe/get-ranking.use-case.ts` (inject ICachePort), `src/application/use-cases/swipe/record-swipe.use-case.ts` (inject ICachePort for invalidation), `src/app.ts` (wire RedisAdapter), `docker-compose.yml`.

### Phase 3 — Recruiter Skill Preview
**Rationale:** Zero new infrastructure. Pure use-case logic change in `GetRankingUseCase`. Should be built after Redis caching is wired (so the updated ranking response is cached correctly). Depends on no other v3.0 feature.

**Files touched:** `src/application/use-cases/swipe/get-ranking.use-case.ts` (add `skillPreview` to DISLIKE branch).

### Phase 4 — DISC Assessment
**Rationale:** Self-contained new module (entity, interface, use cases, adapter, controller, routes). Schema migration required. Building before the learning system keeps scope isolated. DISC fit-score integration (if done) modifies `IRecommendationRepository` — do this last within the phase to avoid destabilizing the already-changed ranking use case.

**Files touched:** 8 new files (entity, interface, scorer, 2 use cases, repository, controller, routes), schema migration, `src/app.ts`.

### Phase 5 — Learning System
**Rationale:** Depends on Redis (Phase 2) for cache invalidation on swipes, and on a stable fit-score interface (Phase 1). Schema migration required. Modifies `RecordSwipeUseCase`, `GetFeedUseCase`, `GetRankingUseCase`, and `IRecommendationRepository` — high-touch, so it goes after smaller changes to those files are already committed and tested.

**Files touched:** `src/domain/entities/learning-weights.entity.ts` (new), `src/domain/interfaces/learning.repository.interface.ts` (new), `src/application/use-cases/swipe/update-learning-weights.use-case.ts` (new), `src/adapters/repositories/learning.repository.ts` (new), `src/application/use-cases/swipe/record-swipe.use-case.ts` (inject ILearningRepository), `src/application/use-cases/swipe/get-feed.use-case.ts` (inject ILearningRepository), `src/application/use-cases/swipe/get-ranking.use-case.ts` (inject ILearningRepository), `src/domain/interfaces/recommendation.repository.interface.ts` (add WeightAdjustments param), schema migration.

### Phase 6 — Admin Dashboard
**Rationale:** Additive admin feature. Depends only on existing `IUserRepository` and `ICreditRepository`. `IMetricsPort` + `InMemoryMetricsAdapter` + `metricsPlugin` are new but isolated. Build last because it has no upstream dependencies on other v3.0 features and its metrics (request count) are most meaningful once all other features are live and generating traffic.

**Files touched:** `src/application/ports/metrics.port.ts` (new), `src/application/use-cases/admin/get-platform-metrics.use-case.ts` (new), `src/adapters/services/metrics.adapter.ts` (new), `src/infrastructure/http/plugins/metrics.plugin.ts` (new), `src/adapters/controllers/admin.controller.ts` (extend), `src/infrastructure/http/routes/admin.routes.ts` (add GET /metrics), `src/domain/interfaces/credit.repository.interface.ts` (add sumRevenue), `src/adapters/repositories/credit.repository.ts` (implement sumRevenue), `src/app.ts` (wire metrics).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Layer placement | HIGH | Verified against `check-deps.ts` rules directly |
| Redis adapter pattern | HIGH | Matches existing `neo4j.ts` singleton + adapter pattern exactly |
| ICachePort in application/ports | HIGH | Consistent with IHashPort, ITokenPort, IGraphPort placement |
| DISC scoring in application layer | HIGH | No external dependencies — pure function, fits application/use-cases |
| LearningWeights as separate table | HIGH | Avoids coupling to CandidateProfile migration; cleaner IRepository boundary |
| Metrics via Fastify onRequest hook | HIGH | Confirmed by Fastify lifecycle docs; no route handler pollution |
| Build order dependencies | MEDIUM | DISC-to-fit-score integration timing is flexible; ordering is advisory |
