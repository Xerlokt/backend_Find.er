# Roadmap: Job Tinder Backend

## Overview

Eight phases deliver the complete Job Tinder backend — from bare scaffolding through authentication, domain entities, the Neo4j recommendation engine (the core value), real-time chat, and the credits economy. Each phase delivers a coherent, testable capability. The Neo4j fit-scoring engine stands alone in Phase 6 because without it, the product is just another job board.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation** - Project scaffolding, Docker, Prisma schema, test infrastructure
- [x] **Phase 2: Authentication** - JWT + Google OAuth2, refresh tokens, route guards
- [x] **Phase 3: Profiles & Companies** - Candidate profiles, company accounts, admin user management
- [x] **Phase 4: Jobs** - Job creation, editing, expiry scheduler, recruiter job view
- [x] **Phase 5: Swipe** - Like/Dislike mechanics, duplicate prevention, ranking visibility rules
- [x] **Phase 6: Recommendation** - Neo4j graph seed, fit-score algorithm, ranked candidate list
- [x] **Phase 7: Credits** - Credit balance, unlock flow, audit log, admin credit grants
- [ ] **Phase 8: Chat** - WebSocket real-time chat, auto-creation on match/unlock, message persistence

## Phase Details

### Phase 1: Foundation
**Goal**: The project skeleton runs, tests pass green, and every developer tool is operational
**Depends on**: Nothing (first phase)
**Requirements**: (project constraints — no explicit REQ-IDs; enables all subsequent phases)
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts PostgreSQL and Neo4j with no errors
  2. `npm run test` finds and runs test suites (zero tests pass/fail — harness works)
  3. `npm run dev` starts the Fastify server and returns 200 on `GET /health`
  4. Prisma schema is applied and migrations run cleanly against the test DB
  5. TypeScript compiles with zero errors (`npm run build`)
**Plans**: TBD

Plans:
- [x] 01-01: Docker Compose, environment setup, Prisma schema + migrations
- [x] 01-02: Fastify app factory, shared plugins skeleton, Jest + Supertest test harness
- [x] 01-03: Neo4j driver singleton, error handler, health route

### Phase 2: Authentication
**Goal**: Users can securely create accounts and access protected routes using JWT or Google
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. User can register with email/password and receive a JWT access token + refresh token
  2. User can log in with email/password and receive valid tokens
  3. User can authenticate via Google OAuth2 and receive the same token pair
  4. User can exchange a valid refresh token for a new access token
  5. User can log out and subsequent use of the refresh token is rejected
  6. A request to any protected route without a valid JWT receives 401
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Schema RefreshToken, rate-limit plugin, errorHandler update, AuthRepository + AuthService (register + login) — TDD
- [ ] 02-02-PLAN.md — AuthService (refresh + logout), auth.routes.ts, app.ts wiring, integration tests — TDD
- [ ] 02-03-PLAN.md — Google OAuth2 (google-auth-library, loginWithGoogle, POST /auth/google) — TDD

### Phase 3: Profiles & Companies
**Goal**: Candidates and recruiters have complete, editable profiles linked to companies; admins can manage users
**Depends on**: Phase 2
**Requirements**: CAND-01, CAND-02, COMP-01, COMP-02, COMP-03, ADMIN-01, ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. Candidate can create and update their profile (name, bio, location, skills, salary expectation, work modes, search radius)
  2. Admin can create a company record
  3. Recruiter can create and edit a profile linked to an existing company
  4. Admin can set and adjust a company's credit balance
  5. Admin routes return 403 for non-ADMIN roles
  6. Admin can list all users and view individual profiles
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Prisma migration (salaryExpectation), CandidateRepository + CandidateService + candidateRoutes (PUT/GET /candidates/me) — TDD
- [x] 03-02-PLAN.md — CompanyRepository + CompanyService + companyRoutes (POST /companies, GET /companies/:id, PATCH /companies/admin/:id/credits) — TDD
- [x] 03-03-PLAN.md — RecruiterRepository + RecruiterService + recruiterRoutes (PUT/GET /recruiters/me) + AdminService + adminRoutes (GET /admin/users, GET /admin/users/:id, PATCH /admin/companies/:id/credits) — TDD

### Phase 4: Jobs
**Goal**: Recruiters can manage the full lifecycle of job postings; expired jobs deactivate automatically
**Depends on**: Phase 3
**Requirements**: JOB-01, JOB-02, JOB-03, JOB-04
**Success Criteria** (what must be TRUE):
  1. Recruiter can create a job with all required fields (title, description, profession, skills, salary range, location, work mode, expiry date)
  2. Recruiter can edit job details and deactivate a job
  3. A job past its expiry date is automatically marked inactive (scheduler fires)
  4. Recruiter can view a job's detail page with a placeholder for the candidate ranking
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Prisma migration (recruiterId), JobRepository + JobService (CRUD + ownership) — TDD unit + integration tests
- [x] 04-02-PLAN.md — Job expiry scheduler (node-cron plugin, runExpiryCheck) — unit tests
- [x] 04-03-PLAN.md — Job HTTP routes (POST/PATCH/DELETE deactivate/GET mine/GET :id) + full integration tests
- [x] 04-04-PLAN.md — Gap closure: GET /:id access control fix, RankingItem export, ADMIN 403 test

### Phase 5: Swipe
**Goal**: Candidates can swipe on jobs, and the ranking view enforces LIKE/DISLIKE visibility rules
**Depends on**: Phase 4
**Requirements**: SWIPE-01, SWIPE-02, SWIPE-03, SWIPE-04, SEC-03, SEC-05, ARCH-01, ARCH-04
**Success Criteria** (what must be TRUE):
  1. Candidate can POST a LIKE or DISLIKE on a job and the swipe is persisted
  2. A second swipe on the same job by the same candidate is rejected with 409
  3. In the recruiter ranking view, candidates who swiped LIKE have their full profile visible
  4. In the recruiter ranking view, candidates who swiped DISLIKE have identity fields censored (name, photo hidden; rank position visible)
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — SwipeRepository + SwipeService (recordSwipe + getFeed) + createSwipe factory — TDD unit tests
- [x] 05-02-PLAN.md — swipe.routes.ts (POST /swipes + GET /jobs/feed) + app.ts wiring + integration tests
- [x] 05-03-PLAN.md — SwipeService.getRanking (Haversine + LIKE/DISLIKE gate) + GET /jobs/:jobId/ranking route + integration tests

### Phase 6: Recommendation
**Goal**: The Neo4j fit-score engine calculates match percentages and the candidate ranking is ordered by fit score
**Depends on**: Phase 5
**Requirements**: REC-01, REC-02, REC-03, CAND-03
**Success Criteria** (what must be TRUE):
  1. The Neo4j graph contains seeded profession/skill nodes and relationships
  2. Calling the recommendation service for a job returns a list of candidates with numeric fit scores (0–100)
  3. Fit score accounts for all five factors: profession match, skills overlap, location proximity, work mode, salary range
  4. The recruiter ranking view on a job is sorted by fit score descending
  5. A candidate with no skill or location overlap scores lower than one with partial overlap
  6. GET /jobs/feed response items include a numeric fitScore field per job (CAND-03)
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — Neo4j driver config (disableLosslessIntegers), IRecommendationService interface (ARCH-04), RecommendationRepository skeleton + seedTaxonomy (6 professions, 10 skills, REQUIRES + RELATED_TO), seed CLI script, Wave 0 test stubs
- [x] 06-02-PLAN.md — 5-factor computeFitScore algorithm (profession 30%, skills 35%, location 20%, work mode 10%, salary 5%) — TDD, all 12 unit test cases GREEN
- [x] 06-03-PLAN.md — Wire IRecommendationService into SwipeService (constructor injection), replace fitScore:0 placeholder, sort ranking by fitScore DESC, add fitScore to feed (CAND-03), update existing swipe tests + integration assertions
**UI hint**: no

### Phase 7: Credits
**Goal**: Companies can spend credits to unlock censored candidates; every transaction is audited
**Depends on**: Phase 6
**Requirements**: CREDIT-01, CREDIT-02, CREDIT-03, CREDIT-04, SEC-03, ARCH-01, ARCH-04
**Success Criteria** (what must be TRUE):
  1. Recruiter can call the unlock endpoint for a DISLIKE candidate and the candidate's full profile becomes visible
  2. Unlock deducts the correct credit amount from the company's balance
  3. An unlock attempt when the company has insufficient credits is rejected with 402
  4. Every credit deduction and admin grant is recorded in the transaction audit log
  5. Admin can grant credits to a company and the balance updates immediately
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — Prisma Unlock model + migration [BLOCKING], haversineKm shared utility, CreditRepository + CreditService (unlockCandidate + grantCredits), unit tests TDD GREEN
- [x] 07-02-PLAN.md — credits.routes.ts (POST /jobs/:jobId/candidates/:candidateId/unlock) + app.ts wiring + full integration tests GREEN
- [x] 07-03-PLAN.md — AdminService refactor (ICreditService injection), GET /admin/companies/:id/transactions audit endpoint, SwipeRepository.findUnlocksByJobAndCompany + SwipeService.getRanking reveal update + swipe/admin integration tests GREEN

### Phase 8: Chat
**Goal**: Candidates and recruiters can exchange messages in real time after a match or unlock; history persists
**Depends on**: Phase 7
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04
**Success Criteria** (what must be TRUE):
  1. A WebSocket connection is established between candidate and recruiter for an active chat
  2. A chat room is created automatically when a candidate swipes LIKE on a job
  3. A chat room is created automatically when a company unlocks a DISLIKE candidate
  4. Messages sent via WebSocket are persisted to PostgreSQL
  5. A participant opening a chat receives the full message history via a REST endpoint
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md — Wave 0: @types/ws install, @@unique migration [BLOCKING], createChat/createMessage factories, unit + integration test stubs
- [x] 08-02-PLAN.md — IChatService interface (ARCH-04), ChatRepository, ChatService (TDD: recruiter-first rule, participant check, cursor pagination) — unit tests GREEN
- [ ] 08-03-PLAN.md — chat.routes.ts (REST + WS gateway + in-memory broadcast), app.ts wiring (fastifyWebsocket + IChatService injection into SwipeService/CreditService), integration tests GREEN

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-04-18 |
| 2. Authentication | 3/3 | Complete | 2026-04-18 |
| 3. Profiles & Companies | 3/3 | Complete | 2026-04-19 |
| 4. Jobs | 4/4 | Complete | 2026-04-25 |
| 5. Swipe | 3/3 | Complete | 2026-05-01 |
| 6. Recommendation | 3/3 | Complete | 2026-05-02 |
| 7. Credits | 3/3 | Complete | 2026-05-02 |
| 8. Chat | 2/3 | In progress | - |
