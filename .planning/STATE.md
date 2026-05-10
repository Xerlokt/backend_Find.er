---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: Phase 13 Plan 01 COMPLETE — import surgery done; 8 new layer files created; 28 files updated; npm run build 0 errors; tsc clean
last_updated: "2026-05-10T14:02:00Z"
last_activity: 2026-05-10 -- Plan 13-01 complete — fixed all 6 cross-boundary import chains; created 8 new files (haversine, recommendation.repository, chat.service, credit.service, require-role.hook, error-handler, app.error, health.routes); updated 29 source+test files; jest.config @shared/@modules aliases removed; npm run build exits 0
progress:
  total_phases: 13
  completed_phases: 12
  total_plans: 46
  completed_plans: 43
  percent: 98
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-03)

**Core value:** Neo4j recommendation engine that calculates fit score between candidate and job — without it, the product does not exist
**Current focus:** Phase 09 — Domain Layer Scaffold (v2.0 start)

## Current Position

Phase: 13 — Cleanup + Unit Test Layer (in progress)
Plan: 13-01 complete; 13-02 next (delete src/modules/ and src/shared/)
Status: Plan 13-01 complete — all 6 cross-boundary import chains fixed; 8 new layer files created; 29 files updated; npm run build 0 errors; jest.config aliases removed
Last activity: 2026-05-10 -- Plan 13-01 complete — import surgery done; haversine/recommendation.repository/chat.service/credit.service/require-role.hook/error-handler/app.error/health.routes created; neo4j.adapter/get-ranking/credits.controller/authenticate.hook/chat.routes/app.ts updated; all 7 infra route files updated; test helpers+integration tests repointed; unit tests appError/errorHandler/job.scheduler/recommendation.service updated; jest.config @shared/@modules aliases removed; npm run build exits 0

Progress: [█████████░] 98% (Phase 13 in progress, plan 1/3 done)

## Performance Metrics

**v1.0 Velocity (reference):**

- Total plans completed: 27
- Average duration: ~20min
- Total execution time: ~9 hours

**v1.0 By Phase:**

| Phase | Plans | Avg/Plan |
|-------|-------|----------|
| 1. Foundation | 3 | ~15min |
| 2. Authentication | 3 | ~20min |
| 3. Profiles & Companies | 4 | ~25min |
| 4. Jobs | 4 | ~19min |
| 5. Swipe | 3 | ~20min |
| 6. Recommendation | 3 | ~20min |
| 7. Credits | 3 | ~20min |
| 8. Chat | 4 | ~22min |

**v2.0 By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 9. Domain Layer Scaffold | TBD | - | - |
| 10. Infrastructure + Auth Migration | TBD | - | - |
| 11. Core Modules Migration | TBD | - | - |
| 12. Swipe, Credits, Recommendation, Chat Migration | TBD | - | - |
| 13. Cleanup + Unit Test Layer | TBD | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization: Neo4j for fit scoring (graph traversal required), PostgreSQL via Prisma for relational data, Fastify over Express, WebSocket for chat, credits only for companies
- 01-01: Prisma v7 datasource URL moved to prisma.config.ts (breaking change — url in schema datasource block is no longer supported)
- 01-01: prisma-client-js generator kept in schema (still works in v7, generates to node_modules/@prisma/client)
- 01-03: FastifyJWT module augmentation used for request.user typing instead of FastifyRequest directly — avoids conflict with @fastify/jwt's existing user property declaration
- 03-02: PATCH /companies/admin/:id/credits lives in companyRoutes (prefix /companies), NOT a separate admin module — full URL is PATCH /companies/admin/:id/credits; ADMIN-02 canonical path is PATCH /admin/companies/:id/credits in adminRoutes
- 04-01: companyId removed from CreateJobSchema — service derives it from recruiter profile to prevent IDOR (any recruiter posting to any company)
- 04-04: GET /jobs/:id uses [authenticate] only — any authenticated role (CANDIDATE, RECRUITER, ADMIN) can read job details; required by Phase 5 swipe flow
- 04-04: RankingItem interface exported from job.routes.ts as Phase 6 contract — shape: candidateId/fitScore/profile
- 06-01: disableLosslessIntegers: true added to Neo4j driver config — JS numbers returned from Cypher (not neo4j.Integer objects)
- 06-01: IRecommendationService interface at src/shared/interfaces/recommendation.interface.ts — ARCH-04 boundary between swipe and recommendation modules
- 06-02: computeFitScore is pure TypeScript math (no Neo4j calls in v1) — profession 30%, skills 35%, location 20%, modality 10%, salary 5%
- 06-03: swipe.service.ts depends on IRecommendationService (type-only import) — RecommendationRepository injected at route level in swipe.routes.ts
- 07-03: ICreditService interface defined in admin.service.ts co-located with consumer (ARCH-04) — AdminService depends on interface, not concrete CreditRepository
- 07-03: SwipeRepository.findUnlocksByJobAndCompany queries prisma.unlock directly — repositories may cross Prisma models; modules must not import other modules
- 07-03: GET /admin/companies/:id/transactions uses admin-trusted IDOR disposition (T-07-03) — admin role trusted to query any company
- 08-01: Used prisma db push + migrate resolve --applied workflow when migrate dev is non-interactive (CI/non-TTY environment); migration file created manually with correct index name
- 08-01: Chat @@unique([candidateId, companyId, jobId]) live in dev+test DBs — DB-level guard against duplicate chat rooms
- 08-02: IChatService interface at src/shared/interfaces/chat.interface.ts — ARCH-04 boundary; swipe/credits modules must import type IChatService, never ChatService/ChatRepository directly
- 08-02: Recruiter-first rule enforced by countRecruiterMessages(chatId, recruiterUserId) — uses actual userId from DB, NOT role field (avoids Pitfall 5)
- 08-02: verifyParticipant never throws — returns false for chat-not-found or non-participant; safe for WS handler pre-check without try/catch
- 08-02: Optional chaining (chat.candidate?.userId ?? null) required in sendMessage — unit test mock for NOT_PARTICIPANT case omits nested candidate object from findChatWithParticipants result
- 08-03: IChatRouteService extends IChatService in chat.routes.ts opts type — verifyParticipant/getMessages/listChats declared inline; IChatService kept minimal for ARCH-04 consumers (swipe/credits)
- 08-03: IChatService passed via opts.chat to swipe.routes.ts and credits.routes.ts — keeps internal service instantiation; less invasive than moving to app.ts composition root
- 08-03: fastifyWebsocket registered before chatRoutes in buildApp (RESEARCH Pitfall 1 — plugin must precede any route using websocket: true)
- v2.0 roadmap: Migration strategy is module-by-module (not layer-by-layer) — keeps 41 integration tests green after every phase; Phase 9 creates the skeleton before any imports change
- 09-01: Domain entities use TypeScript string union types (not enum keyword) — matches plan-architecture.md canonical examples; Job entity includes recruiterId field from Prisma schema
- 09-03: Repository interfaces derive ALL methods verbatim from existing src/modules/*/*.repository.ts files (D-02) — no ad-hoc method invention; method contracts locked before Phase 10 adapter implementations begin
- 09-03: IRefreshTokenRepository created per D-03 — required by auth use cases; helper types (SwipeWithCandidateInfo, RecruiterWithCompany, UnlockResult, ChatParticipants, ChatListItem, FitScoreInput, FitScoreJobInput) co-located with consuming interface files
- 09-03: Zero Prisma/modules/shared imports in src/domain/interfaces/ — ARCH-06 enforced; all types come exclusively from src/domain/entities/
- 11-01: CandidateRepository.toDomain() maps every field explicitly — no spread — to enforce domain/adapter boundary and allow safe Modality enum cast (Prisma enum → domain union type)
- 11-01: RecruiterRepository.findCompanyById() calls prisma.company directly with ARCH-04 module isolation comment — never imports CompanyRepository
- 11-01: Old src/modules/candidate/ and src/modules/recruiter/ files NOT deleted — additive migration pattern; cleanup deferred to Phase 13
- 11-02: ICompanyRepository.getTransactions declared on interface so admin use case (plan 04) can query credit transactions via ICompanyRepository contract without importing Prisma directly
- 11-02: CompanyRepository.getTransactions returns Prisma rows directly — CreditTransaction entity shape exactly matches Prisma creditTransaction model, no toDomain needed
- 11-02: adjustCredits uses DomainError(message, code, statusCode) — opposite arg order from AppError(message, statusCode, code); both error cases updated correctly
- 11-02: Old src/modules/company/ files NOT deleted — additive migration pattern; cleanup deferred to Phase 13
- 11-03: scheduler.plugin.ts now imports JobRepository from adapters/repositories and runExpiryCheck from infrastructure/scheduler — removes last modules/job/ import from infrastructure layer
- 11-03: job-expiry.scheduler.ts accepts IJobRepository interface — scheduler decoupled from concrete adapter; can be tested without DB
- 11-03: findRecruiterProfileByUserId uses direct prisma.recruiterProfile.findUnique inside JobRepository — ARCH-04 module isolation: JobRepository must not import RecruiterRepository
- 11-03: Old src/modules/job/ files NOT deleted — additive migration; modules/job/job.routes.ts stays because swipe.routes.ts imports RankingItem from it; cleanup in Phase 13
- 11-03: /mine route registered before /:id in job.routes.ts — Fastify registration-order sensitive; 'mine' treated as UUID param and fails Zod validation if /:id registered first
- 11-04: ICreditGrantPort defined locally in adjust-admin-credits.use-case.ts and admin.controller.ts — avoids importing CreditService from src/modules/credits/ (Phase 12 migration); TypeScript structural typing ensures compatibility
- 11-04: UserPublic = Omit<User, 'passwordHash' | 'googleId'> exported from user.repository.interface.ts — findMany and findByIdPublic return this safe projection; sensitive fields never reach the controller (T-11-04-02)
- 11-04: Old src/modules/admin/ files NOT deleted — additive migration pattern; cleanup deferred to Phase 13
- 12-02: Neo4jAdapter stores RecommendationRepository as private readonly inner in constructor — FitScoreInput structural superset of CandidateData makes call compatible with RecommendationRepository.computeFitScore
- 12-02: UNLOCK_COST_BY_PLAN lives in application/use-cases/credits/ (not modules/) — application layer owns business constants
- 12-02: P2002 duplicate unlock caught inside prisma.$transaction in CreditRepository.executeUnlock — never bubbles to use case layer (clean separation; use case stays @prisma/client-free)
- 12-02: UnlockCandidateUseCase compares swipe.direction !== 'DISLIKE' via domain string literal — zero @prisma/client imports in use case (ARCH-07)
- 12-02: CreditsController enrichment (candidateProfile + haversineKm distanceKm) is explicit controller concern — documented with comment; not business logic
- 12-03: P2002 duplicate swipe caught inside prisma.$transaction in SwipeRepository — never bubbles to use case layer (clean separation; use case stays @prisma/client-free)
- 12-03: avatarUrl flattened from row.candidate.user.avatarUrl into SwipeWithCandidateInfo.candidate.avatarUrl at repository boundary — use cases never see nested Prisma structure
- 12-03: FitScoreInput requires id field (added in 12-02) — use cases use 'satisfies FitScoreInput' to enforce at compile time (Pitfall 3)
- 12-03: swipe.routes.ts DUAL EXPORT pattern — swipeRoutes (POST /swipes under /swipes prefix) + swipeJobRoutes (GET routes under /jobs prefix); same pattern as modules/swipe/swipe.routes.ts
- 12-03: /feed registered BEFORE /:jobId/ranking in swipeJobRoutes — Fastify static-before-parameterized rule (Pitfall 1); 'feed' would match as UUID param if /:jobId registered first
- 12-03: GetRankingUseCase DISLIKE censoring — profile: null unless direction === 'LIKE' || unlockedCandidateIds.has(candidateId); T-12-03-03 information disclosure mitigation
- 12-04: ChatService constructor typed to IChatRepository (not concrete modules/chat/ChatRepository) — sendMessage uses findParticipants() returning flat ChatParticipants; listChats uses findByUserId() returning ChatListItem[]
- 12-04: CreditService constructor typed to ICreditRepository — enables adapter CreditRepository injection without changing service logic
- 12-04: modules/credits/credits.routes.ts (old, not imported by app.ts) updated to use adapter CreditRepository — required for tsc clean across whole project; avatarUrl access flattened from user.avatarUrl to direct field
- 12-04: chat.service unit test updated to mock IChatRepository interface — old method names (findChatWithParticipants, findChatsByUserId) replaced with domain interface names (findParticipants, findByUserId)
- 13-01: credit.service.ts UNLOCK_COST_BY_PLAN import path is ../../application/use-cases/credits/credits.constants (not ../use-cases/ which resolves to nonexistent adapters/use-cases/)
- 13-01: IChatRouteService.sendMessage added explicitly in chat.routes.ts — IChatPort only has createOrGetChat; WS handler calls sendMessage which needed explicit declaration in IChatRouteService
- 13-01: job.test.ts rewritten to use 4 new use cases (CreateJob/UpdateJob/DeactivateJob/ListJobsByRecruiter) + adapter JobRepository — no JobService exists in adapters/services/
- 13-01: FitScoreInput.id required — all recommendation test factory defaults updated with id: 'test-candidate' / id: 'test-job' per Phase 12-03 contract

### v2.0 Architecture Context

**Current src/ structure (before migration):**

- `src/modules/` — flat module directories (auth, candidate, company, recruiter, job, swipe, credits, recommendation, chat, admin, health)
- `src/shared/` — db clients (prisma.ts, neo4j.ts), plugins, hooks, errors, interfaces, utils
- `src/app.ts`, `src/server.ts` — entry points

**Target src/ structure:**

- `src/domain/` — entities, value-objects, interfaces (repository contracts)
- `src/application/` — use-cases by module, ports (IHashPort, ITokenPort, IGraphPort), errors
- `src/adapters/` — controllers, repository implementations, service adapters
- `src/infrastructure/` — http/routes, http/plugins, database singletons, app.ts, server.ts, scheduler

**Dependency rule (enforced in Phase 13):**

- `domain/` imports nothing from the project
- `application/` imports only `domain/`
- `adapters/` imports `application/` and `domain/`
- `infrastructure/` imports all layers

**File mapping reference:** `plan-architecture.md` (root of repo)

### Pending Todos

None.

### Blockers/Concerns

None.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|

## Session Continuity

Last session: 2026-05-10T14:02:00Z
Stopped at: Completed 13-01-PLAN.md — import surgery done; 8 new files created; 28 files updated; build clean; 13-02 next (delete src/modules/ and src/shared/)
Resume file: None
