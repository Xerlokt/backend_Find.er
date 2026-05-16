# Domain Pitfalls — v3.0 Intelligence, Growth & Scale

**Project:** Job Tinder Backend  
**Milestone:** v3.0 — Graph Recommendation, Learning System, DISC, Admin Dashboard, Redis  
**Researched:** 2026-05-16  
**Scope:** Pitfalls specific to adding these features to the existing Clean Architecture Node.js stack

---

## Critical Pitfalls

### 1. Unbounded Graph Traversal Depth (Neo4j)

**Risk:** High  
**Warning sign:** `computeFitScore` Cypher queries using `[:RELATED_TO*]` without an upper depth bound. Queries become unresponsive when skill graphs grow (TypeScript → JavaScript → ECMAScript → ... chain). PROFILE output shows db hits growing exponentially.  
**Prevention:** Always bound variable-length traversals: `[:RELATED_TO*1..2]` for skill adjacency (depth-2 catches `SQL → PostgreSQL` and `React → JavaScript` without runaway). Add `EXPLAIN` assertions in the integration test `recommendation.test.ts` to catch unbounded patterns before they reach production. Neo4j 5 community does not cap traversal depth automatically.  
**Responsible phase:** Graph Recommendation phase (first phase that adds Cypher traversal to `RecommendationRepository`).

---

### 2. Missing Neo4j Indexes on Skill and Profession Nodes

**Risk:** High  
**Warning sign:** Cypher planner uses `NodeByLabelScan` instead of `NodeIndexSeek` when looking up `Skill {id}` or `Profession {id}`. Visible via `PROFILE` (high db hits on MATCH). The current `seedTaxonomy()` uses MERGE but does not create indexes. With 10 skills it is imperceptible; with 500+ skills in a real taxonomy seed it degrades every `computeFitScore` call.  
**Prevention:** Add `CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE` and the equivalent for `Profession` as part of the graph seed/migration step. A unique constraint in Neo4j 5 automatically creates a backing index. Run this in a `setupIndexes()` function called before `seedTaxonomy()`. Verify with `SHOW INDEXES` assertion in integration test.  
**Responsible phase:** Graph Recommendation phase (add alongside the traversal Cypher additions).

---

### 3. Relationship Direction Inconsistency in Bidirectional RELATED_TO

**Risk:** High  
**Warning sign:** `seedTaxonomy()` currently creates `(a)-[:RELATED_TO]->(b)` AND `(b)-[:RELATED_TO]->(a)` (bidirectional via two MERGE statements). A traversal query that specifies direction `(s)-[:RELATED_TO]->(adj)` will only follow one direction. If future Cypher is written with `(s)<-[:RELATED_TO]-(adj)` it silently returns different results. Score differences between identical candidate/job pairs that are non-deterministic based on query authorship.  
**Prevention:** Adopt a convention now: skill adjacency is undirected in queries, written as `-[:RELATED_TO]-` (no arrow). Document this as an architecture decision. Enforce via a code review checklist item: "all RELATED_TO patterns must be undirected." Alternatively, store only one direction and always query undirected; this halves relationship count and eliminates the ambiguity.  
**Responsible phase:** Graph Recommendation phase.

---

### 4. Cache Stampede on Feed/Ranking Endpoints (Redis)

**Risk:** High  
**Warning sign:** Multiple concurrent requests hit a cold feed cache key simultaneously (after TTL expiry or first deploy). Each triggers a full Neo4j graph traversal + PostgreSQL query for every candidate in the ranking. Under load testing (k6) the DB shows spike of concurrent connections exactly at cache expiry intervals.  
**Prevention:** Use a distributed lock (Redis SET key NX EX pattern) so only one request rebuilds the cache; other concurrent requests either wait or return the slightly stale value. Implement via an `ICachePort` interface in `src/application/ports/cache.port.ts` — the lock logic lives in the `RedisAdapter`, not in any use case. The `GetFeedUseCase` calls `cachePort.getOrSet(key, ttl, fetcher)` which encapsulates stampede prevention. Never expose raw Redis SET/GET to use cases.  
**Responsible phase:** Redis Caching phase.

---

### 5. Cache Logic Leaking into Use Cases (Clean Architecture Violation)

**Risk:** High  
**Warning sign:** `GetFeedUseCase` or `GetRankingUseCase` directly importing `ioredis` or a Redis client. `check-deps.ts` will NOT catch this because `adapters/` can import `infrastructure/database/` — but an application use case importing a concrete Redis client breaks the dependency rule (`application/` must not import `adapters/` or `infrastructure/`). The madge check will catch it if the import goes through infrastructure, but a developer may create a `src/infrastructure/database/redis.ts` and accidentally import it from a use case.  
**Prevention:** Define `ICachePort` in `src/application/ports/cache.port.ts` with methods `get<T>(key: string): Promise<T | null>`, `set<T>(key: string, value: T, ttlSeconds: number): Promise<void>`, `del(key: string): Promise<void>`. Implement `RedisAdapter` in `src/adapters/services/redis.adapter.ts`. Inject via constructor. The existing `check-deps.ts` enforces `application/ cannot import adapters/` — verify the rule regex also covers any new `infrastructure/cache/` directory.  
**Responsible phase:** Redis Caching phase (define the port before any caching code is written).

---

### 6. Stale Fit Scores After Candidate Profile Update

**Risk:** High  
**Warning sign:** A candidate updates their skills (adds "Docker"). Their cached feed or ranking entry still shows the old score for 5 minutes. Recruiter sees a candidate ranked at 45% immediately after the candidate added the skill that would bring them to 80%. No error is thrown — the bug is silent.  
**Prevention:** In `UpsertCandidateProfileUseCase.execute()`, after saving to PostgreSQL, call `cachePort.del(feedCacheKey(candidateId))` and `cachePort.del(rankingCacheKeyPattern(candidateId))`. This is an explicit event-driven invalidation. The use case only calls the port interface — it does not know about Redis. Similarly, when a job is updated, invalidate the ranking cache for that job. Add a test: update profile → call ranking endpoint → assert the score reflects the new profile (not the pre-update cache).  
**Responsible phase:** Redis Caching phase, with a dependency on profile update use cases being aware of the cache port.

---

### 7. Recruiter Skill Preview Information Disclosure

**Risk:** High  
**Warning sign:** The ranking endpoint returns a `profile: null` for DISLIKE + not-unlocked candidates (current behavior in `GetRankingUseCase`). The v3.0 skill preview adds partial data (matched skills, fit reasons) for those same candidates. If the censoring logic branches are not synchronized, a refactor could restore `name`, `avatarUrl`, or other PII fields alongside the preview data. The risk is inconsistency: one branch shows `null`, another shows preview, a third accidentally shows full profile.  
**Prevention:** Create a single `censorProfile(swipe, unlockedSet, previewData)` pure function in `application/utils/` that is the only place censoring decisions are made. It returns a discriminated union: `{ type: 'full', ...profile }`, `{ type: 'preview', matchedSkills, fitReasons }`, `{ type: 'censored' }`. All ranking and feed use cases call this function. Validate with a unit test matrix: LIKE → full, DISLIKE + unlocked → full, DISLIKE + not-unlocked → preview only (no name, no avatarUrl, no bio), no swipe record → not returned at all.  
**Responsible phase:** Recruiter Skill Preview phase.

---

### 8. DISC Score Influencing Hiring Decisions (Legal and Ethical Risk)

**Risk:** High  
**Warning sign:** DISC fit score component is presented to recruiters as a filtering criterion that reduces a candidate's overall fit score. A candidate with a DISC profile that does not match the job's desired DISC profile receives a lower ranking, systematically excluding them. No disclosure to candidates that DISC affects ranking.  
**Prevention:** DISC must be additive/optional, never a blocker. Do not reduce fit score for DISC mismatch — add a small positive boost for strong alignment (e.g., +5% cap on the fit score bonus). Never use DISC as a hard filter or mandatory field for job applications. Add explicit API documentation noting DISC is informational. In the fit score formula, make the DISC weight configurable and defaulting to 0 (opt-in per job). Do not store DISC scores in a format that could be subpoenaed to demonstrate discriminatory filtering. The DISC assessment was not designed for hiring and has low predictive validity for job performance (confirmed by multiple HR research sources).  
**Responsible phase:** DISC Integration phase, plus a security/legal review checkpoint before shipping the DISC weight in the fit score formula.

---

### 9. DISC Scoring Edge Cases (Incomplete or All-Same Responses)

**Risk:** Medium  
**Warning sign:** A candidate answers all 28 questions with the same selection, or submits only 10 of 28 questions. The scoring algorithm produces a degenerate result (e.g., 100% D, 0% I, 0% S, 0% C). This degenerate result is then stored and applied to fit score, producing nonsensical rankings.  
**Prevention:** Validate DISC submission at the application layer: require all 28 answers, reject submissions where a single dimension accounts for >80% of total score (flag for re-evaluation rather than storing). Store DISC results as `{ d: number, i: number, s: number, c: number, completedAt: Date, isValid: boolean }` with the validity flag computed at scoring time. Use cases that read DISC results must check `isValid` before including the score in fit calculation.  
**Responsible phase:** DISC Integration phase.

---

## Moderate Pitfalls

### 10. Learning System Cold Start — New Candidates Have No Weight History

**Risk:** Medium  
**Warning sign:** A new candidate completes their profile and immediately sees a feed. The learning system has no like history, so all profession weights default to 1.0. After 3 likes the system starts adjusting weights, but the first swipes are made with zero personalization. If the default weights are wrong (e.g., slightly favoring remote jobs), the first feed is biased without the candidate realizing it.  
**Prevention:** Use neutral defaults (all weights = 1.0, no pre-seeded preferences). Do not attempt to infer preferences from profile data alone — that couples the learning system to the profile structure and creates hidden assumptions. Document that personalization activates after a minimum of N likes (suggest N=5). The `GetFeedUseCase` applies weights only if a `CandidateLearningProfile` record exists with at least N data points; otherwise it uses the raw fit score. Write a unit test for both code paths (cold start → raw score, warm → weighted score).  
**Responsible phase:** Learning System phase.

---

### 11. Learning Weight Drift Over Time

**Risk:** Medium  
**Warning sign:** A candidate liked many frontend jobs early in their job search, then updated their profile to backend. The learning weights still heavily favor frontend (high React weight, low Node.js weight). The feed shows frontend jobs despite the candidate's explicit profile saying backend. The candidate cannot see or reset their weights.  
**Prevention:** Apply a decay factor to historical weights: older likes count less than recent likes (exponential decay with a half-life of ~30 days). Provide a `DELETE /candidates/learning-profile` endpoint that resets all weights to 1.0. Surface the existence of the learning profile to the candidate (privacy transparency). Cap weight values: max 2.0, min 0.1 per dimension to prevent runaway amplification.  
**Responsible phase:** Learning System phase.

---

### 12. Admin Metrics Request Counter Race Condition

**Risk:** Medium  
**Warning sign:** The admin dashboard counts API requests via a counter. If implemented as `SELECT count + 1 → UPDATE` in PostgreSQL without an atomic operation, concurrent requests will lose increments. At 100 req/s, counts will be off by 10-40% under load. Manifests as suspiciously low request counts in the dashboard.  
**Prevention:** Use `INCR` in Redis (atomic, no read-modify-write) for real-time counters. Periodically flush Redis counters to PostgreSQL for persistence (e.g., every minute via the existing scheduler infrastructure in `src/infrastructure/scheduler/`). For PostgreSQL-only counters, use `UPDATE metrics SET count = count + 1 WHERE ...` (atomic in PostgreSQL) or `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`. Never do separate read + write.  
**Responsible phase:** Admin Dashboard phase.

---

### 13. Admin Metric Aggregation Computed at Query Time

**Risk:** Medium  
**Warning sign:** The admin endpoint queries `SELECT COUNT(*) FROM users WHERE role = 'CANDIDATE'` and similar aggregations on every request. With 100K users this is a full table scan. The admin dashboard makes 6 such queries per page load. Response time degrades to 2-5 seconds as data grows.  
**Prevention:** Pre-aggregate counters. Maintain a `PlatformMetrics` table with columns for `totalCandidates`, `totalRecruiters`, `totalJobs`, `totalRevenue`, `dailySwipes`, updated by the scheduler or via triggers. The admin endpoint reads one row, not a COUNT scan. For revenue, sum `CreditTransaction` totals daily via the scheduler and store the aggregate. Use the existing job-expiry scheduler pattern as the template.  
**Responsible phase:** Admin Dashboard phase.

---

### 14. Neo4j Shared Instance Between Tests (No Database Isolation)

**Risk:** Medium  
**Warning sign:** The current `neo4j-setup.ts` runs `MATCH (n) DETACH DELETE n` before seeding, which is called from `recommendation.test.ts` `beforeAll`. If v3.0 adds a second test file that also runs graph queries (e.g., a DISC skill mapping test), and both test files call `setupNeo4j()` in their `beforeAll`, the files will interfere if Jest runs them in parallel. One test's `DETACH DELETE` wipes the graph while the other test is mid-query.  
**Prevention:** Configure Jest to run integration test files sequentially (`--runInBand` or `maxWorkers: 1` for integration suite). Add an explicit note in test files that use Neo4j: "This test requires exclusive Neo4j access — do not parallelize." For v3.0, do not add a second test file that calls `DETACH DELETE` — centralize all graph setup in `neo4j-setup.ts`. If multiple test suites need different graph states, each must call `setupNeo4j()` in its own `beforeAll` and accept sequential execution.  
**Responsible phase:** All phases that add Neo4j integration tests.

---

### 15. Redis Test Isolation — Cache Contamination Between Integration Tests

**Risk:** Medium  
**Warning sign:** Test A caches a feed result for `candidateId: abc`. Test B creates a candidate with the same `abc` ID (shared factory without unique IDs), then asserts the feed returns updated data. Test B gets the stale result from Test A's cache. Tests pass individually but fail in suite order, non-deterministically.  
**Prevention:** The docker-compose.yml does not include a Redis service yet. When adding Redis, add a `redis_test` service on a separate port (e.g., 6380) analogous to the existing `postgres_test`. In `jest.global-setup.ts`, flush the test Redis after each test file via `FLUSHDB`. Use a `beforeEach` hook in integration tests that use the cache to call `cachePort.flushAll()` (add `flushAll()` to `ICachePort`). Use sufficiently unique cache keys (include timestamp or UUID prefix) to reduce collision probability.  
**Responsible phase:** Redis Caching phase (when Redis is added to docker-compose).

---

### 16. Madge check-deps.ts Does Not Cover New Infrastructure Directories

**Risk:** Medium  
**Warning sign:** A developer adds `src/infrastructure/cache/redis.ts` and imports it directly from `src/application/use-cases/swipe/get-feed.use-case.ts`. The current `check-deps.ts` rule forbids `application/` from importing `adapters/` or `infrastructure/http/`. It does NOT forbid importing `infrastructure/cache/` or `infrastructure/database/`. The violation is invisible to the automated check.  
**Prevention:** Update the `RULES` in `check-deps.ts` before writing any Redis code. Change the application rule from `forbids: [/^adapters\//, /^infrastructure\/http\//]` to `forbids: [/^adapters\//, /^infrastructure\//]` — application cannot import any infrastructure. The current softening that allows `adapters/` to import `infrastructure/database/` should be preserved for the adapters rule. Validate this change does not break existing imports: `tsc` + `npm run check:deps` must stay green before adding any Redis code.  
**Responsible phase:** Redis Caching phase (update check-deps.ts as the first task, before any Redis infrastructure is written).

---

## Minor Pitfalls

### 17. Integration Tests That Pass on Cache Hit But Fail Cold

**Risk:** Low  
**Warning sign:** A test for `GET /candidates/feed` passes when run second (warm cache from a previous test) but fails when run first (cold — Neo4j traversal returns unexpected data). Intermittent CI failures that are hard to reproduce locally.  
**Prevention:** In every integration test for a cached endpoint, explicitly call `cachePort.del(key)` in `beforeEach` to guarantee cold start. Write a dedicated test case: "returns correct data from cold cache" where the test primes the DB, deletes any cache entry, then calls the endpoint and asserts on the computed result, not a cached one. Document this as a testing convention.  
**Responsible phase:** Redis Caching phase.

---

### 18. DISC Weight Added to Fit Score Without Rebalancing Other Weights

**Risk:** Low  
**Warning sign:** Current fit score = 0.30 profession + 0.35 skills + 0.20 location + 0.10 modality + 0.05 salary = 1.00 (100%). Adding a DISC component of 0.10 without rebalancing produces a potential score of 1.10, breaking the 0-100 range guarantee. Tests that assert `score <= 100` will fail.  
**Prevention:** When adding DISC to the fit score, reduce other weights proportionally to maintain sum = 1.00. Example rebalance: profession 0.27, skills 0.30, location 0.18, modality 0.10, salary 0.05, DISC 0.10. Update all unit tests in `recommendation.service.test.ts` that assert exact scores — these will all change. Consider making DISC weight configurable (default 0.0) so DISC can be toggled without rebalancing every time.  
**Responsible phase:** DISC Integration phase.

---

### 19. Neo4j Seed Data Grows Between Test Runs If DETACH DELETE Is Not Called

**Risk:** Low  
**Warning sign:** A test adds a new `Skill` node to test skill adjacency traversal (e.g., a v3.0 test adds `{ id: 'graphql', name: 'GraphQL' }`). If the test does not clean up, subsequent runs accumulate orphaned skill nodes. The idempotency test in `recommendation.test.ts` (line 69: "expect(count).toBe(16)") will start failing because the node count is higher than expected.  
**Prevention:** All test-specific Neo4j data must be added inside a try/finally that deletes those specific nodes in the finally block. Do not rely on `DETACH DELETE n` across tests — it is only safe in `beforeAll` for the whole suite. Prefer parameterized MERGE with cleanup: `MERGE (s:Skill {id: 'test-graphql'}) ... finally: MATCH (s:Skill {id: 'test-graphql'}) DETACH DELETE s`.  
**Responsible phase:** All phases adding Neo4j integration tests.

---

### 20. Privacy Exposure of Learning Weight Data

**Risk:** Low  
**Warning sign:** The learning profile stores per-skill preference weights derived from a candidate's swipe behavior. If this table is returned by a `/candidates/me` endpoint or logged in any request/response logger, it exposes behavioral patterns (e.g., "this candidate always skipes startups" inferred from weights). GDPR right-to-erasure requests must include this table.  
**Prevention:** Store learning weights in a separate `CandidateLearningProfile` table (not embedded in `CandidateProfile`). Exclude this table from any GET /candidates/:id response. Add to the GDPR data deletion cascade: when a candidate's account is deleted, also delete their `CandidateLearningProfile`. The admin endpoint must not expose individual learning weights — only aggregate platform statistics.  
**Responsible phase:** Learning System phase.

---

## Phase-Specific Warning Index

| Feature / Phase | Pitfall # | Pitfall Name |
|----------------|-----------|--------------|
| Graph Recommendation | 1 | Unbounded traversal depth |
| Graph Recommendation | 2 | Missing indexes on Skill/Profession nodes |
| Graph Recommendation | 3 | Bidirectional RELATED_TO direction inconsistency |
| Recruiter Skill Preview | 7 | Information disclosure via partial profile |
| Learning System | 10 | Cold start — no weight history |
| Learning System | 11 | Weight drift after profile change |
| Learning System | 20 | Privacy exposure of behavioral weights |
| DISC Integration | 8 | Legal/ethical risk in hiring decisions |
| DISC Integration | 9 | Scoring edge cases (degenerate inputs) |
| DISC Integration | 18 | Weight rebalancing breaks 0-100 range |
| Admin Dashboard | 12 | Request counter race condition |
| Admin Dashboard | 13 | Aggregation computed at query time |
| Redis Caching | 4 | Cache stampede on feed/ranking |
| Redis Caching | 5 | Cache logic leaking into use cases |
| Redis Caching | 6 | Stale fit scores after profile update |
| Redis Caching | 15 | Test cache contamination |
| Redis Caching | 16 | check-deps.ts does not cover new infra dirs |
| Redis Caching | 17 | Tests pass on cache hit but fail cold |
| All Neo4j tests | 14 | Shared Neo4j instance between test files |
| All Neo4j tests | 19 | Accumulated orphan nodes between runs |

---

## Sources

- Neo4j Cypher variable-length pattern documentation: https://neo4j.com/docs/cypher-manual/current/patterns/variable-length-patterns/
- Neo4j query tuning and PROFILE/EXPLAIN: https://neo4j.com/docs/cypher-manual/current/planning-and-tuning/query-tuning/
- Neo4j search-performance indexes: https://neo4j.com/docs/cypher-manual/current/indexes/search-performance-indexes/
- Cache stampede prevention with Redis: https://redis.io/docs/latest/commands/incr/ and https://hackernoon.com/explaining-what-a-cache-stampede-is-and-how-to-prevent-it-using-redis
- Redis atomic INCR for counters: https://redis.io/docs/latest/commands/incr/
- Cache invalidation on database updates: https://oneuptime.com/blog/post/2026-01-25-redis-cache-invalidation/view
- DISC assessment hiring validity: https://www.prevuehr.com/resources/science-lab/disc-assessment-not-used-hiring-process/
- DISC legal risks in hiring: https://www.shipmangoodwin.com/insights/beware-the-legal-risks-of-personality-tests-in-hiring.html
- OWASP API excessive data exposure: https://tyk.io/blog/res-oasp-api-security-3-excessive-data-exposure/
- Slow Cypher diagnosis: https://medium.com/neo4j/slow-cypher-statements-and-how-to-fix-them-0596e380d964
- Redis integration test isolation: https://www.wednesday.is/writing-tutorials/integration-tests-for-node-applications-with-docker-images-redis-and-postgresql
- Cold start problem in recommender systems: https://en.wikipedia.org/wiki/Cold_start_(recommender_systems)
