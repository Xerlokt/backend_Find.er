# Roadmap: Job Tinder Backend

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-05-03) — [archive](.planning/milestones/v1.0-ROADMAP.md)
- ✅ **v2.0 Clean Architecture Refactor** — Phases 9–13 (shipped 2026-05-15) — [archive](milestones/v2.0-ROADMAP.md)
- 🔄 **v3.0 Intelligence, Growth & Scale** — Phases 14–19 (in progress)

---

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–8) — SHIPPED 2026-05-03</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-04-18
- [x] Phase 2: Authentication (3/3 plans) — completed 2026-04-18
- [x] Phase 3: Profiles & Companies (4/4 plans) — completed 2026-04-19
- [x] Phase 4: Jobs (4/4 plans) — completed 2026-04-25
- [x] Phase 5: Swipe (3/3 plans) — completed 2026-05-01
- [x] Phase 6: Recommendation (3/3 plans) — completed 2026-05-02
- [x] Phase 7: Credits (3/3 plans) — completed 2026-05-02
- [x] Phase 8: Chat (4/4 plans) — completed 2026-05-03

</details>

<details>
<summary>✅ v2.0 Clean Architecture Refactor (Phases 9–13) — SHIPPED 2026-05-15</summary>

- [x] Phase 9: Domain Layer Scaffold (3/3 plans) — completed 2026-05-07
- [x] Phase 10: Infrastructure + Auth Migration (4/4 plans) — completed 2026-05-07
- [x] Phase 11: Core Modules Migration (4/4 plans) — completed 2026-05-08
- [x] Phase 12: Swipe, Credits, Recommendation, Chat Migration (4/4 plans) — completed 2026-05-09
- [x] Phase 13: Cleanup + Unit Test Layer (3/3 plans) — completed 2026-05-15

</details>

### v3.0 Intelligence, Growth & Scale (Phases 14–19)

- [x] **Phase 14: Graph Recommendation** — Neo4j traversal with skill adjacency decay replaces exact-match fit score — completed 2026-05-16
- [ ] **Phase 15: Redis Caching** — Feed and ranking cached with invalidation; architectural layer rule extended to block all infrastructure imports from application
- [x] **Phase 16: Recruiter Skill Preview** — Censored candidate cards expose matching skills and fit reasons without any identity data — completed 2026-05-17
- [x] **Phase 17: DISC Personality Assessment** — Candidates complete DISC survey; result stored and additively factors into fit score for jobs that opt in — completed 2026-05-29
- [ ] **Phase 18: Learning System** — Per-candidate fit weights drift with each LIKE; feed personalizes after cold-start threshold
- [ ] **Phase 19: Admin Dashboard API + Load Testing** — Aggregated platform metrics behind admin guard; k6 baseline committed to repo

---

## Phase Details

### Phase 14: Graph Recommendation
**Goal:** The fit score engine uses real Neo4j graph traversal (`RELATED_TO*1..2`) so that adjacent skills contribute to ranking with weight decay, replacing the previous exact-match-only calculation.
**Requirements:** GRAPH-01, GRAPH-02, GRAPH-03
**Depends on:** —
**Success criteria:**
1. A candidate with skill "SQL" receives a nonzero skill-component score on a job requiring "PostgreSQL" (1-hop adjacency at 0.8x decay) without holding "PostgreSQL" directly.
2. The seed script populates at least 50 `RELATED_TO` edges covering common tech adjacencies (SQL→PostgreSQL, React→JavaScript, Docker→DevOps, etc.) without import errors.
3. Neo4j `Skill` and `Profession` nodes have unique constraints so every `computeFitScore` call uses `NodeIndexSeek` instead of `NodeByLabelScan`.
4. Cypher queries are depth-bounded at `*1..2` — no unbounded traversal pattern exists anywhere in the adapter.
5. All existing 172 tests remain green after the Neo4j adapter and seed script are updated.
**Plans:** 3 plans

Plans:
- [x] 14-01-PLAN.md — Wave 0: TDD test setup (unit + integration, RED state — factories, mock driver, adjacency cases)
- [x] 14-02-PLAN.md — Wave 1: Interface rename + callers update (tsc clean, tests still RED at runtime)
- [x] 14-03-PLAN.md — Wave 2: Neo4j traversal engine + expanded seed + constraints (all tests GREEN)

### Phase 15: Redis Caching
**Goal:** Feed and ranking responses are served from Redis on warm cache hits with correct invalidation on swipe and profile update; the architectural layer rule is extended to block all `infrastructure/` imports from `application/` before any cache code is written.
**Requirements:** SCALE-01, SCALE-02, SCALE-03, SCALE-04
**Depends on:** Phase 14
**Success criteria:**
1. A candidate's feed response is identical on the second request within 60 seconds, served from Redis without re-running the Neo4j traversal.
2. After a candidate submits a swipe, the next feed request reflects the updated state (cached entry invalidated).
3. After a candidate profile is updated, the ranking response reflects the new fit score on the next request (cached entry invalidated).
4. `npm run check:deps` fails if any file inside `src/application/` imports any `src/infrastructure/` subdirectory including `infrastructure/cache/`.
5. PostgreSQL query plans for swipe-by-candidate, swipe-by-job, active-job, and candidate-by-profession lookups use index seeks (four new `@@index` entries live in the Prisma schema).
**Plans:** 3 plans

Plans:
- [ ] 15-01-PLAN.md — Wave 0: ICachePort interface + RED unit tests + check-deps tightening + Prisma indexes + Docker Redis services
- [ ] 15-02-PLAN.md — Wave 1: RedisAdapter + redis singleton + use case cache injection + wiring + Prisma migration (GREEN)
- [ ] 15-03-PLAN.md — Wave 2: Redis test isolation + integration cache/invalidation tests + EXPLAIN index verification

### Phase 16: Recruiter Skill Preview
**Goal:** Recruiters see which skills a DISLIKE or not-yet-unlocked candidate shares with the job, plus labeled fit reasons, without any identity information being exposed.
**Requirements:** REC-01, REC-02, REC-03
**Depends on:** Phase 14
**Success criteria:**
1. The ranking endpoint returns a `matchingSkills[]` list for censored candidates containing only skills that appear in both the candidate profile and the job requirements.
2. The ranking response includes a `fitReasons[]` array for censored candidates (e.g., "4/6 skills match", "salary outside range") describing fit without identifying the candidate.
3. Name, email, photo, and location fields are `null` for any candidate who has not liked the job and has not been unlocked — no partial leakage through the preview fields.
4. A single `censorProfile()` pure function is the only code path that determines what is revealed for any given candidate state (LIKE / DISLIKE-unlocked / DISLIKE-locked), fully covered by unit tests.
**Plans:** 2 plans

Plans:
- [x] 16-01-PLAN.md — Wave 1: TDD RED — stub exports + failing unit tests for censorProfile, buildFitReasons, all 3 candidate states
- [x] 16-02-PLAN.md — Wave 2: GREEN — implement censorProfile + buildFitReasons, replace inline ternary, update RankingItem type

### Phase 17: DISC Personality Assessment
**Goal:** Candidates can complete a simplified DISC assessment whose result is stored on their profile and optionally adds up to 10% to fit score for jobs that declare a desired DISC profile.
**Requirements:** DISC-01, DISC-02, DISC-03, DISC-04
**Depends on:** Phase 14
**Success criteria:**
1. A candidate can submit 4 DISC answers via `POST /candidates/:id/disc` and retrieve their dominant profile (D/I/S/C) via `GET /candidates/:id/disc`.
2. The dominant DISC profile label appears on the censored candidate card in the ranking response, visible to recruiters before unlock.
3. A job posting can set an optional `discProfile` field; jobs without the field have DISC weight defaulted to 0 in fit score calculation.
4. When a job defines a `discProfile` and a candidate's dominant profile matches, the fit score receives a positive additive bonus capped at 10%; a mismatch produces no penalty.
5. The DISC factor is never used as a hard filter or exclusion condition anywhere in the codebase — only as an additive score component.
**Plans:** 3 plans

Plans:
- [x] 17-01-PLAN.md — Wave 0: Prisma schema (DiscResult + Job.discProfile) + db push + domain layer + TDD RED test stubs
- [x] 17-02-PLAN.md — Wave 1: SubmitDiscUseCase + GetDiscUseCase + DiscRepository + computeFitScore + censorProfile + adapter extensions (all unit tests GREEN)
- [x] 17-03-PLAN.md — Wave 2: DiscController + disc.routes.ts + app.ts registration + integration tests GREEN (full suite passing)

### Phase 18: Learning System
**Goal:** Each candidate's fit score weights drift toward their revealed preferences as they accumulate LIKEs, personalizing the recommendation feed after a cold-start threshold of 5 likes.
**Requirements:** LEARN-01, LEARN-02, LEARN-03
**Depends on:** Phase 14, Phase 15
**Success criteria:**
1. Every LIKE action immediately writes an updated `CandidateWeights` record — the weights reflect the new preference before the next feed request is served.
2. A candidate with fewer than 5 LIKEs receives feed ordering identical to global-default weights; a candidate with 5+ LIKEs receives ordering influenced by their personal weights.
3. The fit score calculation for a candidate with personal weights uses those weights instead of global defaults, producing measurably different score distributions for candidates with divergent like histories.
**Plans:** 4 plans

Plans:
- [x] 18-01-PLAN.md — Wave 1: Domain layer (entity + interface + constants) + Prisma schema (CandidateWeights model) + TDD RED stubs in all unit tests
- [x] 18-02-PLAN.md — Wave 2: TDD GREEN — WeightsRepository adapter + RecordSwipeUseCase EMA update (LEARN-01)
- [x] 18-03-PLAN.md — Wave 2: TDD GREEN — computeFitScore optional weights param + GetFeedUseCase personal weights injection (LEARN-02/03)
- [x] 18-04-PLAN.md — Wave 3: Wiring (routes/controller) + [BLOCKING] prisma db push + setup.ts cleanup + integration tests GREEN

### Phase 19: Admin Dashboard API + Load Testing
**Goal:** Admin users can query aggregated platform metrics (users, revenue, engagement, health) via authenticated REST endpoints, and k6 load scripts committed to the repo establish a repeatable performance baseline.
**Requirements:** ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, SCALE-05
**Depends on:** Phase 14, Phase 15, Phase 17, Phase 18
**Success criteria:**
1. `GET /admin/metrics/users` returns total counts per role and daily-active-user counts for the last 7 days; requests with a non-ADMIN JWT are rejected with 403.
2. `GET /admin/metrics/revenue` returns total credits purchased and total credits consumed in unlocks, aggregated across all companies.
3. `GET /admin/metrics/engagement` returns a swipe funnel: total swipes, total likes, total matches, total unlocks, total chats initiated.
4. `GET /admin/metrics/health` returns server uptime and total HTTP request count; the Prometheus `/metrics` endpoint is reachable at runtime.
5. Running `docker compose --profile load-test run k6 run tests/load/feed.js` completes without error and prints a p95 latency result to stdout.
**Plans:** TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-04-18 |
| 2. Authentication | v1.0 | 3/3 | Complete | 2026-04-18 |
| 3. Profiles & Companies | v1.0 | 4/4 | Complete | 2026-04-19 |
| 4. Jobs | v1.0 | 4/4 | Complete | 2026-04-25 |
| 5. Swipe | v1.0 | 3/3 | Complete | 2026-05-01 |
| 6. Recommendation | v1.0 | 3/3 | Complete | 2026-05-02 |
| 7. Credits | v1.0 | 3/3 | Complete | 2026-05-02 |
| 8. Chat | v1.0 | 4/4 | Complete | 2026-05-03 |
| 9. Domain Layer Scaffold | v2.0 | 3/3 | Complete | 2026-05-07 |
| 10. Infrastructure + Auth Migration | v2.0 | 4/4 | Complete | 2026-05-07 |
| 11. Core Modules Migration | v2.0 | 4/4 | Complete | 2026-05-08 |
| 12. Swipe, Credits, Recommendation, Chat Migration | v2.0 | 4/4 | Complete | 2026-05-09 |
| 13. Cleanup + Unit Test Layer | v2.0 | 3/3 | Complete | 2026-05-15 |
| 14. Graph Recommendation | v3.0 | 3/3 | Complete | 2026-05-16 |
| 15. Redis Caching | v3.0 | 0/? | Not started | — |
| 16. Recruiter Skill Preview | v3.0 | 2/2 | Complete | 2026-05-17 |
| 17. DISC Personality Assessment | v3.0 | 3/3 | Complete | 2026-05-29 |
| 18. Learning System | v3.0 | 0/4 | Not started | — |
| 19. Admin Dashboard API + Load Testing | v3.0 | 0/? | Not started | — |

---

*Last updated: 2026-05-30 — Phase 18 planned (4 plans, 3 waves). Phase 17 complete (3/3 plans, 94 tests GREEN).*
