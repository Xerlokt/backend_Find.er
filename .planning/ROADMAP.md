# Roadmap: Job Tinder Backend

## Overview

Eight phases delivered the complete Job Tinder backend (v1.0). Five more phases (9–13) deliver the Clean Architecture refactor (v2.0) — migrating from `src/modules/` flat structure to a strict 4-layer architecture: domain → application → adapters → infrastructure. The refactor is module-by-module so the 41 existing integration tests remain green after every phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

**v1.0 — Complete**

- [x] **Phase 1: Foundation** - Project scaffolding, Docker, Prisma schema, test infrastructure
- [x] **Phase 2: Authentication** - JWT + Google OAuth2, refresh tokens, route guards
- [x] **Phase 3: Profiles & Companies** - Candidate profiles, company accounts, admin user management
- [x] **Phase 4: Jobs** - Job creation, editing, expiry scheduler, recruiter job view
- [x] **Phase 5: Swipe** - Like/Dislike mechanics, duplicate prevention, ranking visibility rules
- [x] **Phase 6: Recommendation** - Neo4j graph seed, fit-score algorithm, ranked candidate list
- [x] **Phase 7: Credits** - Credit balance, unlock flow, audit log, admin credit grants
- [x] **Phase 8: Chat** - WebSocket real-time chat, auto-creation on match/unlock, message persistence

**v2.0 — Clean Architecture Refactor**

- [ ] **Phase 9: Domain Layer Scaffold** - Create src/domain/ and src/application/ skeletons: entities, repository interfaces, ports, DomainError
- [ ] **Phase 10: Infrastructure + Auth Migration** - Migrate shared infrastructure and the full auth module end-to-end into the new layer structure
- [ ] **Phase 11: Core Modules Migration** - Migrate candidate, company, recruiter, job, and admin modules; all tests remain green
- [ ] **Phase 12: Swipe, Credits, Recommendation, Chat Migration** - Migrate remaining modules; 41 integration tests green; all use cases wired via interfaces only
- [ ] **Phase 13: Cleanup + Unit Test Layer** - Delete src/modules/ and src/shared/; enforce dependency rule; add use-case unit tests

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
- [x] 02-01-PLAN.md — Schema RefreshToken, rate-limit plugin, errorHandler update, AuthRepository + AuthService (register + login) — TDD
- [x] 02-02-PLAN.md — AuthService (refresh + logout), auth.routes.ts, app.ts wiring, integration tests — TDD
- [x] 02-03-PLAN.md — Google OAuth2 (google-auth-library, loginWithGoogle, POST /auth/google) — TDD

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
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Prisma migration (salaryExpectation), CandidateRepository + CandidateService + candidateRoutes (PUT/GET /candidates/me) — TDD
- [x] 03-02-PLAN.md — CompanyRepository + CompanyService + companyRoutes (POST /companies, GET /companies/:id, PATCH /companies/admin/:id/credits) — TDD
- [x] 03-03-PLAN.md — RecruiterRepository + RecruiterService + recruiterRoutes (PUT/GET /recruiters/me) + AdminService + adminRoutes (GET /admin/users, GET /admin/users/:id, PATCH /admin/companies/:id/credits) — TDD
- [x] 03-04-PLAN.md — Gap closure: CompanyService.adjustCredits Clean Architecture fix ($transaction movido para CompanyRepository); 6 unit tests GREEN

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
**Plans**: 4 plans

Plans:
- [x] 08-01-PLAN.md — Wave 0: @types/ws install, @@unique migration [BLOCKING], createChat/createMessage factories, unit + integration test stubs
- [x] 08-02-PLAN.md — IChatService interface (ARCH-04), ChatRepository, ChatService (TDD: recruiter-first rule, participant check, cursor pagination) — unit tests GREEN
- [x] 08-03-PLAN.md — chat.routes.ts (REST + WS gateway + in-memory broadcast), app.ts wiring (fastifyWebsocket + IChatService injection into SwipeService/CreditService), integration tests GREEN
- [x] 08-04-PLAN.md — Gap closure: replace 6 stub integration tests with real WS + credit-unlock assertions — all 12 tests GREEN

---

### Phase 9: Domain Layer Scaffold
**Goal**: The domain and application skeleton exists with entities, repository interfaces, ports, and error types — no behavior changes, no tests broken
**Depends on**: Phase 8
**Requirements**: ARCH-05, ARCH-06, ARCH-08
**Success Criteria** (what must be TRUE):
  1. All domain entity files exist under `src/domain/entities/` with zero imports from external libraries (Prisma, Fastify, bcrypt, JWT)
  2. All repository interfaces exist under `src/domain/interfaces/` and define data-access contracts using only domain entity types
  3. All port interfaces exist under `src/application/ports/` — `IHashPort`, `ITokenPort`, `IGraphPort` — with no concrete implementation
  4. `DomainError` class exists at `src/application/errors/domain.error.ts` as the sole application error type
  5. All 41 existing integration tests continue to pass after the scaffold is created (no imports changed yet)
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md — Domain entity files: 11 pure TypeScript interfaces in src/domain/entities/, UserRole/Modality/SwipeDirection/ChatInitiator union types, zero external imports, tsc clean
- [x] 09-02-PLAN.md — Application layer: ports (IHashPort, ITokenPort, IGraphPort) + DomainError in src/application/
- [x] 09-03-PLAN.md — Repository interfaces: 10 files in src/domain/interfaces/ covering all modules; IUserRepository, IRefreshTokenRepository, ICandidateRepository, ICompanyRepository, IRecruiterRepository, IJobRepository, ISwipeRepository, ICreditRepository, IChatRepository, IRecommendationRepository; helper types co-located; zero @prisma/client imports; tsc clean

### Phase 10: Infrastructure + Auth Migration
**Goal**: The shared infrastructure files and the complete auth module are migrated into the new layer structure; the auth integration tests run against the new wiring
**Depends on**: Phase 9
**Requirements**: ARCH-09, ARCH-10, ARCH-11, ARCH-12
**Success Criteria** (what must be TRUE):
  1. `src/infrastructure/database/prisma.ts` and `src/infrastructure/database/neo4j.ts` are the canonical database singletons — no other files instantiate clients
  2. All Fastify plugins live under `src/infrastructure/http/plugins/` and are imported from there
  3. `AuthController` in `src/adapters/controllers/auth.controller.ts` dispatches to use cases and contains no business logic
  4. Auth use cases (`register`, `login`, `refresh-token`, `logout`, `login-with-google`) live under `src/application/use-cases/auth/` and receive all dependencies via `IUserRepository`, `IHashPort`, `ITokenPort` — no direct Prisma or bcrypt imports
  5. Auth repository implementation `src/adapters/repositories/user.repository.ts` implements `IUserRepository` and maps Prisma rows to domain entities
  6. All 41 integration tests remain green after the auth module is fully migrated
**Plans**: 4 plans

Plans:
- [ ] 10-01-PLAN.md — Infrastructure copies (database + plugins) + IRefreshTokenRepository.revokeByHash extension + errorHandler DomainError branch
- [ ] 10-02-PLAN.md — Adapter services (BcryptAdapter, JwtAdapter) + repository implementations (UserRepository, RefreshTokenRepository)
- [ ] 10-03-PLAN.md — Auth use cases: RegisterUseCase, LoginUseCase, RefreshTokenUseCase, LogoutUseCase, LoginWithGoogleUseCase
- [ ] 10-04-PLAN.md — AuthController + auth.routes.ts (new) + app.ts import swap + integration test verification

### Phase 11: Core Modules Migration
**Goal**: Candidate, company, recruiter, job, and admin modules are fully migrated; repository implementations are tested against real DB
**Depends on**: Phase 10
**Requirements**: TEST-03
**Success Criteria** (what must be TRUE):
  1. Candidate, company, recruiter, job, and admin use cases live under `src/application/use-cases/` and depend only on domain interfaces — no Prisma imports inside use case files
  2. All five module repository implementations live under `src/adapters/repositories/` and each implements its corresponding `IXxxRepository` interface
  3. Repository implementations are exercised by integration tests running against the real Docker DB — no mocks for DB interaction
  4. Controllers for these modules live under `src/adapters/controllers/` and contain no business logic
  5. All 41 existing integration tests remain green after each module is migrated
**Plans**: 4 plans

Plans:
- [x] 11-01-PLAN.md — Candidate + Recruiter modules (repos, use cases, controllers, routes, app.ts swap)
- [ ] 11-02-PLAN.md — Company module (ICompanyRepository.getTransactions extension, repo, use cases, controller, routes, app.ts swap)
- [ ] 11-03-PLAN.md — Job module (scheduler infrastructure, repo, 5 use cases, controller, routes, app.ts swap)
- [ ] 11-04-PLAN.md — Admin module (IUserRepository extensions, UserRepository update, 4 use cases, controller, routes, app.ts swap)

### Phase 12: Swipe, Credits, Recommendation, Chat Migration
**Goal**: All remaining modules are migrated; every use case receives dependencies exclusively via interfaces; the full 41-test suite is green
**Depends on**: Phase 11
**Requirements**: ARCH-07, TEST-01
**Success Criteria** (what must be TRUE):
  1. Swipe, credits, recommendation, and chat use cases live under `src/application/use-cases/` and receive every dependency (repositories, ports, graph port) via constructor injection of interfaces — zero concrete implementation imports inside use case files
  2. Service adapters (`BcryptAdapter`, `JwtAdapter`, `Neo4jAdapter`) live under `src/adapters/services/` and implement their respective port interfaces
  3. Route files under `src/infrastructure/http/routes/` only register endpoints and instantiate controllers — no business logic, no direct use-case logic
  4. All 41 integration tests pass green — zero regressions introduced by the migration
  5. Running the app end-to-end (register → swipe → recommendation → unlock → chat) produces correct responses via the new wiring
**Plans**: TBD

### Phase 13: Cleanup + Unit Test Layer
**Goal**: The old module structure is gone, the dependency rule is mechanically enforced, and use cases are independently unit-testable without a database
**Depends on**: Phase 12
**Requirements**: ARCH-13, TEST-02, MIGRATE-01, MIGRATE-02
**Success Criteria** (what must be TRUE):
  1. `src/modules/` directory does not exist — all logic has migrated to the new 4-layer structure
  2. `src/shared/` directory does not exist — all shared utilities, plugins, and errors live in the appropriate layer
  3. A static import-check (or `madge --circular` / custom script) confirms: `domain/` has no project imports; `application/` imports only `domain/`; `adapters/` imports only `application/` and `domain/`; `infrastructure/` is the only layer that imports all others
  4. At least one use case per module (auth, candidate, job, swipe, credits, chat) has a Jest unit test that runs with mocked interfaces — no DB, no HTTP server required
  5. All 41 integration tests continue to pass after cleanup; `npm run build` produces zero TypeScript errors
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13

**v1.0 — Complete**

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-04-18 |
| 2. Authentication | 3/3 | Complete | 2026-04-18 |
| 3. Profiles & Companies | 4/4 | Complete | 2026-04-19 |
| 4. Jobs | 4/4 | Complete | 2026-04-25 |
| 5. Swipe | 3/3 | Complete | 2026-05-01 |
| 6. Recommendation | 3/3 | Complete | 2026-05-02 |
| 7. Credits | 3/3 | Complete | 2026-05-02 |
| 8. Chat | 4/4 | Complete | 2026-05-03 |

**v2.0 — Clean Architecture Refactor**

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Domain Layer Scaffold | 3/3 | Complete | 2026-05-07 |
| 10. Infrastructure + Auth Migration | 0/4 | Not started | - |
| 11. Core Modules Migration | 1/4 | In progress | - |
| 12. Swipe, Credits, Recommendation, Chat Migration | 0/? | Not started | - |
| 13. Cleanup + Unit Test Layer | 0/? | Not started | - |
