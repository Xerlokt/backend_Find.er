# Research Summary — v3.0 Intelligence, Growth & Scale

**Synthesized:** 2026-05-16
**Source files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

v3.0 adds six cohesive features to a well-structured Clean Architecture Node.js backend: Neo4j skill adjacency traversal, per-candidate weight learning, recruiter skill preview, DISC personality assessment, an admin metrics API, and Redis caching with load testing. The stack additions are minimal — two npm packages (`@fastify/redis ^7.2.0`, `fastify-metrics ^13.1.0`), one Docker-only tool (k6 1.0), and the DISC scorer is built from scratch (~80 LOC) because no maintained npm implementation exists. Three Prisma migrations cover all new data needs.

The recommended build order is Graph Recommendation first (highest core value, no migration), then Redis Caching (infrastructure foundation for all subsequent write-then-read patterns), then Skill Preview (zero infrastructure, pure use-case change), then DISC (self-contained new module), then Learning System (touches the most existing files), then Admin Dashboard last (no upstream v3.0 dependencies). This ordering minimizes ripple risk across shared files like `IRecommendationRepository` and `RecordSwipeUseCase`.

The two highest risks are architectural hygiene (cache logic must not leak into application use cases — update `check-deps.ts` before writing any Redis code) and legal exposure (DISC must never act as a filter or hard gate — additive-only scoring with an opt-in per-job default of 0). All other risks are preventable with patterns already established in v2.0.

---

## Stack Additions

### New npm Dependencies

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@fastify/redis` | `^7.2.0` | Redis connection plugin for feed/ranking cache | Uses ioredis 5 transitively. Do NOT install ioredis or `@redis/client` separately. |
| `fastify-metrics` | `^13.1.0` | Prometheus `/metrics` endpoint + request counter | Pulls prom-client transitively. Do NOT install prom-client directly. |

### Docker-only Tooling (no npm install)

| Tool | Version | Purpose | How to run |
|------|---------|---------|-----------|
| k6 | `1.0` | Load testing for feed, ranking, and login scenarios | `grafana/k6:1.0` image. Add to `docker-compose.yml` under `profiles: [load-test]`. Scripts in `tests/load/`. |

### DISC Scorer — Build from Scratch

No maintained npm library exists. Algorithm is 28 forced-choice questions, ~80 LOC pure function. Location: `src/domain/disc/disc-scorer.ts`. Avoids IP risk from proprietary DiSC implementations.

### Prisma Schema Additions

| Model / Field | Type | Purpose |
|--------------|------|---------|
| `DiscResult` | new model | Stores D/I/S/C scores (0-100) + dominant profile. `@unique candidateId`. |
| `CandidateWeights` | new model | Per-candidate fit score weights (5 floats, sum = 1.0). `@unique candidateId`. |
| `Job.discProfile` | `String?` | Optional desired DISC type for a job posting. Nullable means DISC not factored. |
| `Swipe.@@index([candidateId])` | index | Feed query performance. |
| `Swipe.@@index([jobId])` | index | Ranking query performance. |
| `Job.@@index([isActive, expiresAt])` | index | Active job filtering. |
| `CandidateProfile.@@index([professionId])` | index | Feed match filtering. |

---

## Feature Table Stakes

### 1. Graph Recommendation (Neo4j Skill Adjacency)

**Ship:** Cypher `RELATED_TO*1..2` traversal with weight decay (adjacent match = 0.8x). Depth-bounded, score normalized, backward-compatible with exact-match.
**Differentiator:** Skill taxonomy seed quality — the richer the RELATED_TO graph, the smarter the feed.
**Anti-feature:** Do not use Neo4j GDS, do not auto-generate edges from ML, do not traverse beyond depth 2.

### 2. Learning System (Per-Candidate Weights)

**Ship:** `CandidateWeights` table (5 floats), weight update triggered on each LIKE, applied at fit-score query time. Cold start uses global defaults until N=5 likes.
**Differentiator:** Per-candidate weight drift surfaced to the candidate ("Your profile weights: skills 42%, salary 8%").
**Anti-feature:** No ML models (ALS, matrix factorization), no collaborative filtering, no real-time weight computation during swipe.

### 3. Recruiter Skill Preview

**Ship:** Skill intersection + fit reason labels in the ranking response for DISLIKE + not-unlocked candidates. Identity fields remain `null`.
**Differentiator:** "Why 72%?" breakdown increases credit unlock conversion without a new paywall tier.
**Anti-feature:** Do not expose location or job title before unlock. Do not create a "partial preview" credit tier.

### 4. DISC Personality Assessment

**Ship:** 28-question forced-choice survey (`POST /candidates/:id/disc`, `GET /candidates/:id/disc`). D/I/S/C scoring normalized 0-100 stored in `DiscResult`. DISC factor added to fit score at 10% weight, opt-in per job, default 0.
**Differentiator:** One-time assessment, low friction. DISC type label visible on locked candidate cards (non-identifying).
**Anti-feature:** DISC must never be a hard filter or mandatory field. Do not invent custom questions.

### 5. Admin Dashboard API

**Ship:** `GET /admin/metrics/users`, `/revenue`, `/engagement`, `/health`. All behind `ADMIN` role JWT guard. SQL aggregates via Prisma — no new analytics infrastructure.
**Differentiator:** Swipe funnel metric (impressions to LIKE to unlock) is platform-specific insight no generic tool provides without custom instrumentation.
**Anti-feature:** No analytics pipeline (Kafka, ClickHouse), no real-time WebSocket push, no individual user behavioral data, no admin UI.

### 6. Horizontal Scale (Redis + Indexes + k6)

**Ship:** Redis cache-aside for feed (TTL 60s) and ranking (TTL 30s). Cache invalidation on swipe and profile update. PostgreSQL index audit via EXPLAIN ANALYZE. k6 load scripts committed to `tests/load/`.
**Differentiator:** k6 suite committed to repo becomes a CI smoke test baseline.
**Anti-feature:** No Redis Cluster, no JWT session store in Redis, no long-term caching of Neo4j scores, no APM/distributed tracing at this scale.

---

## Suggested Build Order

FEATURES.md recommends starting with Admin Dashboard for early visibility; ARCHITECTURE.md recommends Graph Recommendation first as the lowest-risk, highest-value change that unblocks everything else. Architecture wins — you cannot instrument a recommendation engine that does not yet exist.

1. **Graph Recommendation** — Adapter-only Cypher traversal update in `RecommendationRepository`. No migration. Fix broken `scripts/seed-neo4j.ts` import paths in the same phase. Add Neo4j indexes and depth-bounded traversal before any other feature reads the graph.

2. **Redis Caching** — Infrastructure foundation all subsequent features depend on for correct cache invalidation. No migration. Update `check-deps.ts` first to forbid `application/` from importing any `infrastructure/` subdirectory. Add Redis service to `docker-compose.yml`. Define `ICachePort` before writing any caching code.

3. **Recruiter Skill Preview** — Zero new infrastructure. Single use-case method change in `GetRankingUseCase`. Implement `censorProfile()` as the single censoring decision point — a pure function covering the full locked/preview/full-access decision matrix.

4. **DISC Assessment** — Self-contained new module (8 new files, 1 migration). No coupling to Learning System. Wire DISC weight into fit score at the end of this phase, after the module is independently tested.

5. **Learning System** — Highest touch-count of existing files (`RecordSwipeUseCase`, `GetFeedUseCase`, `GetRankingUseCase`, `IRecommendationRepository`). Place last among feature phases so earlier phases have already stabilized those files. Requires 1 migration.

6. **Admin Dashboard** — Additive only, no upstream v3.0 dependencies. Build last so traffic from all other features generates meaningful metrics on day one. Use `fastify-metrics` for request counts. Pre-aggregate daily counters via scheduler rather than COUNT scans at query time.

---

## Critical Pitfalls

### P1 — Unbounded Neo4j Graph Traversal (Risk: Critical)

Using `[:RELATED_TO*]` without a depth bound causes exponentially growing db hits as the skill graph grows. Always write `[:RELATED_TO*1..2]`. Add `EXPLAIN` assertions in `recommendation.test.ts` to catch unbounded patterns in CI before they reach production.

**Phase:** Graph Recommendation (Phase 1).

### P2 — Missing Neo4j Indexes on Skill/Profession Nodes (Risk: Critical)

Without unique constraints the Cypher planner uses NodeByLabelScan instead of NodeIndexSeek. With 500+ skill nodes every `computeFitScore` call degrades. Run `CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE` in a `setupIndexes()` function called before `seedTaxonomy()`.

**Phase:** Graph Recommendation (Phase 1).

### P3 — Cache Logic Leaking into Use Cases (Risk: Critical)

The current `check-deps.ts` forbids `application/` from importing `infrastructure/http/` but does NOT block `infrastructure/database/` or `infrastructure/cache/`. A use case importing `ioredis` directly would pass the current check. Update the `application/` rule to forbid all `infrastructure/` imports before writing any Redis code — this is the first task of Phase 2.

**Phase:** Redis Caching (Phase 2).

### P4 — Cache Stampede on Feed/Ranking (Risk: High)

Concurrent requests against a cold cache key each trigger a full Neo4j traversal simultaneously. Prevent with a Redis `SET key NX EX` distributed lock encapsulated inside `ICachePort.getOrSet()` in `RedisAdapter` — lock logic must never appear in use cases.

**Phase:** Redis Caching (Phase 2).

### P5 — Stale Fit Scores After Profile Update (Risk: High)

A candidate adds a skill; their cached ranking entry shows the old score for the full TTL window. `UpsertCandidateProfileUseCase` must call `cachePort.del()` for both feed and ranking keys after saving. Validate with a test: update profile, call ranking endpoint, assert score reflects the new profile.

**Phase:** Redis Caching (Phase 2).

### P6 — Recruiter Skill Preview Information Disclosure (Risk: High)

Partial preview data in the DISLIKE + not-unlocked branch creates an inconsistency risk: a future refactor may accidentally restore PII alongside preview fields. Implement a single `censorProfile(swipe, unlockedSet, previewData)` pure function as the only place censoring decisions are made. Cover the full decision matrix with unit tests.

**Phase:** Recruiter Skill Preview (Phase 3).

### P7 — DISC Used as a Hiring Filter (Risk: High — Legal)

DISC has low predictive validity for job performance and carries discrimination risk in hiring contexts. DISC weight must be additive-only (small positive boost for alignment, never a penalty for mismatch), opt-in per job (default = 0), and never a hard exclusion filter. Add a legal review checkpoint before shipping DISC weight in the fit score formula.

**Phase:** DISC Assessment (Phase 4).

---

## Open Questions

1. **DISC question bank authoring.** The 28-question forced-choice format requires 112 adjectives mapped to D/I/S/C dimensions. Who authors or sources these? This is the highest content bottleneck for Phase 4 and must be resolved before the phase begins.

2. **Skill taxonomy seed scope.** Graph Recommendation quality depends entirely on the RELATED_TO graph. How many skills and edges are seeded at launch? Is there an existing taxonomy (O*NET, ESCO) to import, or is this hand-crafted? A sparse graph produces sparse recommendation benefit.

3. **CandidateWeights weight update algorithm.** FEATURES.md proposes exponential moving average or Bayesian update but does not decide. The choice affects adaptation speed and weight-drift behavior (see PITFALLS.md P11). Needs a decision before Phase 5 begins.

4. **check-deps.ts tightening impact.** Changing the `application/` import rule from "forbids `infrastructure/http/`" to "forbids all `infrastructure/`" may break existing imports. A `tsc + npm run check:deps` dry run against the v2.0 codebase is needed to confirm zero existing violations before Phase 2 starts.

5. **Redis test isolation strategy.** Two options: (a) add a `redis_test` service on port 6380 with `FLUSHDB` between test files, or (b) bypass caching entirely in the test environment via an env flag. A consistent decision is needed before Phase 2 integration tests are written.

6. **Admin scheduler availability.** PITFALLS.md recommends pre-aggregating admin metrics via the scheduler in `src/infrastructure/scheduler/`. Is this scheduler operational in v2.0, or does it need to be built as part of Phase 6?

7. **DISC fit score integration timing.** Should wiring DISC into the fit score formula be part of Phase 4 or deferred to a follow-on commit after the DISC module is independently stable? Deferring reduces Phase 4 risk at the cost of DISC not affecting rankings until a later deploy.
