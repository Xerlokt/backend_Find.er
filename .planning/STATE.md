---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Clean Architecture Refactor
status: in_progress
stopped_at: Roadmap created — Phase 9 ready to plan
last_updated: "2026-05-04T00:00:00Z"
last_activity: 2026-05-04 -- v2.0 roadmap created — 5 phases (9-13), 14 requirements mapped, ready to /gsd-plan-phase 9
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-03)

**Core value:** Neo4j recommendation engine that calculates fit score between candidate and job — without it, the product does not exist
**Current focus:** Phase 09 — Domain Layer Scaffold (v2.0 start)

## Current Position

Phase: 9 — Domain Layer Scaffold
Plan: —
Status: Not started — roadmap approved, ready to plan
Last activity: 2026-05-04 -- v2.0 roadmap written — 5 phases (9–13), 14 requirements mapped 100%

Progress: [░░░░░░░░░░] 0% (v2.0 milestone)

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

Last session: 2026-05-04T00:00:00.000Z
Stopped at: v2.0 roadmap created — ROADMAP.md, STATE.md, REQUIREMENTS.md updated; Phase 9 ready to /gsd-plan-phase 9
Resume file: None
