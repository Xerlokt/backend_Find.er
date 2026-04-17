# Roadmap: Job Tinder Backend

## Overview

Eight phases deliver the complete Job Tinder backend — from bare scaffolding through authentication, domain entities, the Neo4j recommendation engine (the core value), real-time chat, and the credits economy. Each phase delivers a coherent, testable capability. The Neo4j fit-scoring engine stands alone in Phase 6 because without it, the product is just another job board.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - Project scaffolding, Docker, Prisma schema, test infrastructure
- [ ] **Phase 2: Authentication** - JWT + Google OAuth2, refresh tokens, route guards
- [ ] **Phase 3: Profiles & Companies** - Candidate profiles, company accounts, admin user management
- [ ] **Phase 4: Jobs** - Job creation, editing, expiry scheduler, recruiter job view
- [ ] **Phase 5: Swipe** - Like/Dislike mechanics, duplicate prevention, ranking visibility rules
- [ ] **Phase 6: Recommendation** - Neo4j graph seed, fit-score algorithm, ranked candidate list
- [ ] **Phase 7: Credits** - Credit balance, unlock flow, audit log, admin credit grants
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
- [ ] 01-02: Fastify app factory, shared plugins skeleton, Jest + Supertest test harness
- [ ] 01-03: Neo4j driver singleton, error handler, health route

### Phase 2: Authentication
**Goal**: Users can securely create accounts and access protected routes using JWT or Google
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. User can register with email/password and receive a JWT access token + refresh token
  2. User can log in with email/password and receive valid tokens
  3. User can authenticate via Google OAuth2 and receive the same token pair
  4. User can exchange a valid refresh token for a new access token
  5. User can log out and subsequent use of the refresh token is rejected
  6. A request to any protected route without a valid JWT receives 401
**Plans**: TBD

Plans:
- [ ] 02-01: Auth service (register, login, token pair generation) — unit tests first
- [ ] 02-02: Refresh token + logout flow, JWT plugin, authenticate hook — unit + integration tests
- [ ] 02-03: Google OAuth2 plugin and callback route — integration tests

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
**Plans**: TBD

Plans:
- [ ] 03-01: Candidate profile service + routes — unit + integration tests
- [ ] 03-02: Company service + routes (admin-guarded company creation, credit balance) — unit + integration tests
- [ ] 03-03: Recruiter profile service + routes, requireRole hook, admin user management routes

### Phase 4: Jobs
**Goal**: Recruiters can manage the full lifecycle of job postings; expired jobs deactivate automatically
**Depends on**: Phase 3
**Requirements**: JOB-01, JOB-02, JOB-03, JOB-04
**Success Criteria** (what must be TRUE):
  1. Recruiter can create a job with all required fields (title, description, profession, skills, salary range, location, work mode, expiry date)
  2. Recruiter can edit job details and deactivate a job
  3. A job past its expiry date is automatically marked inactive (scheduler fires)
  4. Recruiter can view a job's detail page with a placeholder for the candidate ranking
**Plans**: TBD

Plans:
- [ ] 04-01: Job service + repository (CRUD) — unit + integration tests
- [ ] 04-02: Job expiry scheduler (cron via `@fastify/schedule`) — unit tests with fake clock
- [ ] 04-03: Recruiter job-detail route (ranking placeholder returns empty list)

### Phase 5: Swipe
**Goal**: Candidates can swipe on jobs, and the ranking view enforces LIKE/DISLIKE visibility rules
**Depends on**: Phase 4
**Requirements**: SWIPE-01, SWIPE-02, SWIPE-03, SWIPE-04
**Success Criteria** (what must be TRUE):
  1. Candidate can POST a LIKE or DISLIKE on a job and the swipe is persisted
  2. A second swipe on the same job by the same candidate is rejected with 409
  3. In the recruiter ranking view, candidates who swiped LIKE have their full profile visible
  4. In the recruiter ranking view, candidates who swiped DISLIKE have identity fields censored (name, photo hidden; rank position visible)
**Plans**: TBD

Plans:
- [ ] 05-01: Swipe service + repository — unit + integration tests
- [ ] 05-02: Swipe routes (candidate swipe endpoint, duplicate guard) — integration tests
- [ ] 05-03: Ranking view serialization (LIKE = full profile, DISLIKE = censored) — integration tests

### Phase 6: Recommendation
**Goal**: The Neo4j fit-score engine calculates match percentages and the candidate ranking is ordered by fit score
**Depends on**: Phase 5
**Requirements**: REC-01, REC-02, REC-03
**Success Criteria** (what must be TRUE):
  1. The Neo4j graph contains seeded profession/skill nodes and relationships
  2. Calling the recommendation service for a job returns a list of candidates with numeric fit scores (0–100)
  3. Fit score accounts for all five factors: profession match, skills overlap, location proximity, work mode, salary range
  4. The recruiter ranking view on a job is sorted by fit score descending
  5. A candidate with no skill or location overlap scores lower than one with partial overlap
**Plans**: TBD

Plans:
- [ ] 06-01: Neo4j graph seed (profession/skill taxonomy Cypher), Neo4j repository queries — unit tests with Neo4j test container
- [ ] 06-02: Fit-score algorithm in recommendation service — unit tests covering each scoring factor
- [ ] 06-03: Wire recommendation into job ranking endpoint; integration tests for ranked output
**UI hint**: no

### Phase 7: Credits
**Goal**: Companies can spend credits to unlock censored candidates; every transaction is audited
**Depends on**: Phase 6
**Requirements**: CREDIT-01, CREDIT-02, CREDIT-03, CREDIT-04
**Success Criteria** (what must be TRUE):
  1. Recruiter can call the unlock endpoint for a DISLIKE candidate and the candidate's full profile becomes visible
  2. Unlock deducts the correct credit amount from the company's balance
  3. An unlock attempt when the company has insufficient credits is rejected with 402
  4. Every credit deduction and admin grant is recorded in the transaction audit log
  5. Admin can grant credits to a company and the balance updates immediately
**Plans**: TBD

Plans:
- [ ] 07-01: Credits service + repository (balance management, deduction, audit log) — unit tests
- [ ] 07-02: Unlock route (validates balance, deducts, reveals candidate) — integration tests
- [ ] 07-03: Admin credit-grant route + audit log endpoint — integration tests

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
**Plans**: TBD

Plans:
- [ ] 08-01: Chat service + repository (room creation, message persistence) — unit tests
- [ ] 08-02: WebSocket gateway (`@fastify/websocket`), real-time message broadcast — integration tests
- [ ] 08-03: Chat auto-creation hooks (LIKE event, unlock event), message history REST endpoint — integration tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/3 | In progress | - |
| 2. Authentication | 0/3 | Not started | - |
| 3. Profiles & Companies | 0/3 | Not started | - |
| 4. Jobs | 0/3 | Not started | - |
| 5. Swipe | 0/3 | Not started | - |
| 6. Recommendation | 0/3 | Not started | - |
| 7. Credits | 0/3 | Not started | - |
| 8. Chat | 0/3 | Not started | - |
