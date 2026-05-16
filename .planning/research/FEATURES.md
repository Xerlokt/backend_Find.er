# Feature Landscape — v3.0 Intelligence, Growth & Scale

**Domain:** Job matching platform (swipe + fit score + credits + chat)
**Researched:** 2026-05-16
**Mode:** Ecosystem — existing platform, adding 6 features

---

## 1. Graph Recommendation (Neo4j Skill Traversal)

**Table stakes:**
- Skills modeled as nodes with `RELATED_TO` edges and a `weight` property (0.0–1.0) expressing adjacency strength (e.g., SQL→PostgreSQL weight 0.9, SQL→MongoDB weight 0.5)
- Cypher traversal with depth limit (max 2 hops) to avoid runaway scoring
- Scores from adjacent matches decay by traversal depth: direct match = full contribution, 1-hop = partial, 2-hop = smaller partial
- Final fit score for skills dimension = sum of matched skill scores, normalized against job's required skill count
- Backward-compatible: exact matches still score highest; zero-match jobs disappear from feed

**Differentiators:**
- Seeded RELATED_TO graph covering common tech stacks (JS ecosystem, SQL family, cloud tools) — the richer the graph, the smarter the recommendation
- Recruiter-visible "matched via: PostgreSQL ≈ SQL" label explaining why a candidate appeared
- Bi-directional traversal: candidate skill SQL matches job skill PostgreSQL AND vice versa

**Anti-features:**
- Do not use Neo4j GDS (Graph Data Science library) — overkill for this scale; raw Cypher traversal is sufficient and avoids GDS licensing/complexity
- Do not auto-generate RELATED_TO edges from training data — manually seed the graph; ML-generated edges require a separate data pipeline and training corpus that doesn't exist yet
- Do not score beyond depth 2 — deeper traversal produces semantically meaningless matches and hurts precision

**Complexity:** High — Neo4j graph seeding is a data problem (must hand-craft or import a meaningful skill taxonomy); the Cypher query logic is medium complexity but the IGraphPort adapter change ripples through Clean Architecture layers; existing REC tests must be updated

**Depends on:** Fit score (Phase 6, REC-01), IGraphPort adapter, Neo4j node/relationship schema for skills already in graph

---

## 2. Learning System (Per-Candidate Weight Adjustment)

**Table stakes:**
- Track swipe history per candidate: how often they LIKE jobs weighted heavily on salary vs skills vs location
- Maintain a `CandidateWeights` record in PostgreSQL (5 floats that must sum to 1.0): skills, profession, location, modality, salary
- On each LIKE, slightly shift weights toward the dominant factors of the liked job vs candidate profile (e.g., if they liked a job despite salary gap but strong skill match, increase skills weight)
- Apply personalized weights at fit score query time: inject per-candidate weights into the Neo4j score calculation instead of global defaults
- Cold start: use global defaults (35/30/20/10/5) until N likes threshold (e.g., N=5)

**Differentiators:**
- Per-candidate weight drift visible to the candidate ("Your profile is weighted toward: skills 42%, salary 8%") — transparency increases trust
- Weight recomputation is incremental (no batch jobs), triggered on each swipe event
- DISLIKE signals optionally used to counter-adjust weights (lower weight of dimension where job was strong but candidate rejected)

**Anti-features:**
- Do not build a full ML model (matrix factorization, ALS, neural nets) — the candidate base doesn't justify it yet; simple exponential moving average or Bayesian update on 5 floats is sufficient
- Do not share weights across candidates (collaborative filtering) — that requires enough users for statistical significance; content-based weight personalization is simpler and more explainable
- Do not compute in real-time during swipe feed generation — precompute weights on swipe event, cache result, apply at query time

**Complexity:** Medium — weight storage is a simple Prisma table addition; the learning algorithm is basic arithmetic (weighted average update); the integration with fit score calculation (passing per-candidate weights to Neo4j query) is the tricky coupling point; must not break existing REC tests

**Depends on:** Swipe mechanic (Phase 5, SWIPE-01/02), fit score (Phase 6, REC-01), IGraphPort adapter (must accept configurable weights), PostgreSQL for weight storage

---

## 3. Recruiter Skill Preview

**Table stakes:**
- For non-liked candidates in ranking: return structured fit reasons (which dimensions matched, which didn't) without revealing identity or full profile
- Response shape: `{ fit_score: 72, match_reasons: [{dimension: "skills", matched: true, detail: "Python, SQL"}, {dimension: "salary", matched: false, detail: "gap +20%"}], identity_locked: true }`
- Only matched skill names visible (not full candidate skill list); unmatched dimensions show reason without sensitive data
- Existing paywall (unlock with credits) remains the gate for contact + identity access

**Differentiators:**
- "Why this candidate scored 72%" label gives recruiters actionable signal before spending credits — increases unlock conversion rate
- Per-dimension match/mismatch displayed with clear symbols (matched / gap), not just a number
- Skill overlap displayed as list: "Matches: Python, SQL, Django" (only overlapping skills — not candidate's full skill inventory)

**Anti-features:**
- Do not expose candidate location or job title before unlock — these are identity-adjacent signals that break privacy model
- Do not add a new credit tier for "partial preview" — the current binary (locked/unlocked) is the revenue model; preview is free signal to increase conversion, not a new paywall
- Do not require a new DB query — fit reasons are derivable from the already-computed fit score breakdown; cache the dimension breakdown alongside the score

**Complexity:** Low-Medium — the fit score calculation already produces per-dimension sub-scores; this feature is primarily about exposing that breakdown in the API response and enforcing what fields are redacted. No new Neo4j queries needed. Main work: update ranking response schema + add redaction layer in controller

**Depends on:** Fit score dimension breakdown (Phase 6, REC-01/02), Recruiter ranking endpoint (REC-02), credits unlock (Phase 7), existing candidate censorship logic (SWIPE-04)

---

## 4. DISC Personality Assessment

**Table stakes:**
- 28-question forced-choice questionnaire (classic DISC Classic 2.0 format: each block has 4 adjectives, candidate selects Most and Least like them)
- Scoring: tally raw D/I/S/C scores from adjective selections; normalize to 0–100 scale per dimension; dominant style = highest dimension
- Store `DISCProfile` on candidate: `{D: 78, I: 45, S: 30, C: 62, dominant: "D", secondary: "C"}`
- Job stores `desired_disc: {primary: "C", secondary: "D", tolerance: "medium"}` — optional field, no disc preference = disc not factored in score
- DISC fit score: compare candidate's dominant/secondary against job's desired; full match = 100%, partial = weighted, no preference = neutral (doesn't help or hurt)
- DISC weight added to fit score formula (e.g., 5–10%, with corresponding reduction to another dimension)

**Differentiators:**
- Assessment is one-time, stored permanently (not re-taken per application) — low friction
- Recruiter sees candidate DISC profile label (e.g., "DC — Results-Oriented Analyst") even for locked candidates (DISC type is non-identifying)
- DISC is optional for both sides — platform works without it; enables progressive enrichment

**Anti-features:**
- Do not implement DISC as a hard filter (exclude candidates below DISC threshold) — this creates legal risk (personality-based discrimination) and reduces candidate pool; score only, never gate
- Do not build a custom psychometric validation — use the established 28-question/forced-choice format; inventing questions requires clinical validation
- Do not add DISC to the fit score before the graph recommendation is stable — DISC adds noise if base scoring is unreliable; phase ordering matters

**Complexity:** High — not technically complex (DISC math is straightforward) but the question bank (28 items × 4 adjectives = 112 adjectives mapped to D/I/S/C) must be authored, scored, and stored; fit score formula changes require updating Neo4j query + existing tests; 28-question survey flow requires new API endpoints (start session, submit answers, get results); must handle partial completion (candidate abandons mid-test)

**Depends on:** Candidate profile (Phase 3, CAND-01/02), fit score (Phase 6, REC-01), job schema (Phase 4, JOB-01–04), Graph Recommendation must land first (DISC weight displaces an existing dimension weight)

---

## 5. Admin Dashboard API

**Table stakes:**
- `GET /admin/metrics/users` — total users by role (candidate/company/recruiter), new users last 7/30 days
- `GET /admin/metrics/revenue` — total credits sold, credits spent, credits outstanding, revenue by period
- `GET /admin/metrics/engagement` — DAU, swipe funnel (impressions → LIKE → unlock), top 10 jobs by fit requests
- `GET /admin/metrics/health` — DB connection status, Neo4j status, job queue depth (if applicable)
- All endpoints behind a dedicated `ADMIN` role guard — JWT + role check; no public access

**Differentiators:**
- Swipe funnel metric (views → likes → matches → unlocks) is the product-specific insight that generic analytics tools can't provide without custom instrumentation
- Revenue metric tracks credit economy health (credits sold vs spent ratio = platform liquidity signal)
- Minimal implementation: raw SQL aggregates via Prisma `$queryRaw` — no separate analytics DB, no event streaming, no BI tool

**Anti-features:**
- Do not build a full analytics pipeline (Kafka, ClickHouse, Segment) — this is an internal admin API; PostgreSQL aggregates are sufficient at current scale
- Do not add real-time push/WebSocket for admin metrics — polling on dashboard reload is sufficient
- Do not expose individual user behavioral data in admin API — aggregate only; individual-level data in admin endpoints is a privacy/GDPR risk
- Do not build admin UI — this is a backend API project; UI is out of scope

**Complexity:** Low — all metrics are SQL aggregates against existing tables (users, swipes, credits, unlocks); new `ADMIN` role adds one JWT middleware guard; main risk is query performance on large tables (add indexes on created_at columns); no new domain logic

**Depends on:** Auth + roles (Phase 2, AUTH-01–06), swipe data (Phase 5), credits data (Phase 7), all existing entities in PostgreSQL

---

## 6. Horizontal Scale (Redis Cache + Query Optimization + k6)

**Table stakes:**
- Redis cache for job feed: cache candidate's recommended job list with TTL (e.g., 5 min); invalidate on new job creation or candidate profile update
- Redis cache for ranking: cache recruiter's ranked candidate list per job with TTL (e.g., 2 min); invalidate on new swipe
- Cache-aside pattern (Lazy Loading): check Redis → miss → query DB/Neo4j → write to Redis → return
- PostgreSQL query audit: add missing indexes (swipe lookup by candidate+job, credits by company, messages by conversation); measure with EXPLAIN ANALYZE
- k6 load test scenarios: swipe feed (100 VUs), ranking (50 VUs), login (200 VUs) — baseline latency targets (e.g., p95 < 500ms)

**Differentiators:**
- Cache key design includes version hash of candidate profile — stale profile doesn't serve stale feed (avoids manual invalidation complexity)
- k6 test suite committed to repo as `tests/load/` — becomes part of CI smoke test baseline
- Redis not in existing stack: adding it is an infrastructure decision that affects Docker Compose, connection management, and error handling paths

**Anti-features:**
- Do not cache authentication tokens in Redis as a session store — JWT is stateless; Redis session adds complexity without benefit given short token TTLs (15min)
- Do not cache Neo4j fit score computation results long-term — fit scores change when candidate profile or job updates; short TTL only (2–5 min), never persist to DB
- Do not implement Redis Cluster for this scale — single Redis instance with persistence is sufficient; cluster adds operational complexity without payoff at current user volume
- Do not add full APM/distributed tracing (Datadog, New Relic) — k6 + Fastify built-in request logging is the right instrumentation level for now

**Complexity:** Medium — Redis setup is mechanical (Docker Compose service + ioredis client + adapter layer); cache-aside logic is straightforward but must be implemented behind the IGraphPort/repository interfaces to respect Clean Architecture; cache invalidation correctness is the hard part (when to invalidate, not how); k6 scripts are write-once; real complexity is ensuring cache doesn't silently serve wrong data after profile/job mutations

**Depends on:** All existing endpoints (cache wraps existing services), Neo4j fit score (Phase 6), PostgreSQL schema (all phases), Docker Compose infrastructure (existing)

---

## Feature Dependencies Map

```
Graph Recommendation
  └─ required before Learning System (weights feed into graph query)
  └─ required before DISC (adding DISC weight requires stable formula)

Learning System
  └─ requires Graph Recommendation (weights applied in graph query)
  └─ requires Swipe history (Phase 5)

Recruiter Skill Preview
  └─ requires Graph Recommendation (per-dimension breakdown)
  └─ independent of Learning System and DISC

DISC Personality
  └─ requires Graph Recommendation stable (fit score formula change)
  └─ independent of Learning System

Admin Dashboard
  └─ independent of all v3.0 features (reads existing data)
  └─ deploy early for visibility

Horizontal Scale
  └─ wraps all existing endpoints; deploy last (measure what exists first)
  └─ k6 baselines need stable endpoints to test
```

## Phase Ordering Recommendation

1. **Admin Dashboard** — lowest risk, highest visibility, no dependencies on v3.0 features; gives metrics baseline before scale work
2. **Graph Recommendation** — core intelligence feature; unblocks Learning System and DISC
3. **Recruiter Skill Preview** — low complexity, high conversion value; depends only on Graph Rec breakdown
4. **Learning System** — depends on Graph Rec; medium complexity; can run in parallel with Skill Preview
5. **DISC Personality** — highest content-authoring burden; should land after graph scoring is stable
6. **Horizontal Scale** — wraps everything; Redis + k6 after all endpoints are stable

## Complexity Summary

| Feature | Complexity | Primary Risk |
|---------|-----------|-------------|
| Graph Recommendation | High | Graph seed data quality; Cypher query design; layer ripple |
| Learning System | Medium | Weight coupling with fit score; cold start behavior |
| Recruiter Skill Preview | Low-Medium | Schema change + redaction correctness |
| DISC Personality | High | Question bank authoring; formula change; partial-completion state |
| Admin Dashboard | Low | Query performance on large tables; role guard |
| Horizontal Scale | Medium | Cache invalidation correctness; Docker Compose infra addition |
