# Phase 12: Swipe, Credits, Recommendation, Chat Migration — Research

**Researched:** 2026-05-09
**Domain:** Clean Architecture migration — swipe, credits, recommendation, and chat modules
**Confidence:** HIGH (all findings derived from reading actual source files)

---

## Summary

Phase 12 applies the Phase 11 migration pattern to the four remaining modules: swipe, credits, recommendation, and chat. All four modules follow the same 4-file pattern (repository adapter + use case(s) + controller + route file + app.ts swap) with three critical complications that do not exist in Phase 11.

**Complication 1 — Cross-module dependency: IChatService.** Both SwipeService and CreditService call `chat.createOrGetChat(...)` during their primary operations. In the new architecture, the swipe and credits use cases must receive an `IChatService` (or a slim port interface) via constructor injection. The ChatService is instantiated at the composition root (`app.ts`) and passed as an `IChatPort` through the new route files' opts. The existing `IChatService` interface at `src/shared/interfaces/chat.interface.ts` defines only `createOrGetChat` and `sendMessage` — which is exactly the minimal surface the swipe/credits use cases need. Define a local `IChatPort` in the use case files (structural typing) OR import the existing `IChatService` type directly.

**Complication 2 — Recommendation layer identity crisis.** The current v1 architecture has two separate things that must be reconciled:
- `IRecommendationService` at `src/shared/interfaces/recommendation.interface.ts` — the interface SwipeService uses (has `computeFitScore(CandidateData, JobData)`)
- `IRecommendationRepository` at `src/domain/interfaces/recommendation.repository.interface.ts` — the Phase 9 domain interface (has `computeFitScore(FitScoreInput, FitScoreJobInput)` with different input shapes, plus `seedTaxonomy`)
- `RecommendationRepository` at `src/modules/recommendation/recommendation.repository.ts` — implements `IRecommendationService` (not `IRecommendationRepository`) and contains no Prisma calls (pure Neo4j + TypeScript math)

The new swipe use cases must call `computeFitScore`. They currently receive `IRecommendationService` (CandidateData/JobData shapes). The new `IRecommendationRepository` uses `FitScoreInput`/`FitScoreJobInput` shapes with `id` fields added. The cleanest path: create `Neo4jAdapter` at `src/adapters/services/neo4j.adapter.ts` that implements `IRecommendationRepository` by wrapping `RecommendationRepository`, and have the swipe use cases receive `IRecommendationRepository` (the domain port). Alternatively, define `IGraphPort`-compatible adapter if the swipe use case is rearchitected to use `IGraphPort` — but `IGraphPort` (in `src/application/ports/graph.port.ts`) has a fundamentally different API (`calculateFitScore(candidateId, jobId)` by IDs, not data objects) that would require significant logic restructuring. The safe path: create `Neo4jAdapter implements IRecommendationRepository` wrapping the existing `RecommendationRepository`, and update swipe use cases to accept `IRecommendationRepository`.

**Complication 3 — Chat module: IChatRouteService extends IChatService.** The `chatRoutes` function accepts `opts: { service: IChatRouteService }` where `IChatRouteService extends IChatService` and adds `verifyParticipant`, `getMessages`, and `listChats`. The ChatService class already implements all these methods. The new `chat.routes.ts` in infrastructure must retain the extended interface pattern and the WebSocket wiring (module-level `connections` Map, `addConnection`, `removeConnection`, `broadcast` helpers). Chat also uses `AppError` in the WebSocket handler (`err instanceof AppError`) — this must be preserved since the WS handler is not a use case.

**Migration order:** chat → recommendation adapter → credits → swipe (chat must exist before swipe/credits use cases can receive it; recommendation adapter must exist before swipe use cases can receive it).

**Primary recommendation:** Migrate in this order: (1) ChatRepository adapter + chat use cases + ChatController + chat.routes.ts infrastructure; (2) Neo4jAdapter (wraps RecommendationRepository, implements IRecommendationRepository); (3) CreditRepository adapter + credits use cases + CreditsController + credits.routes.ts infrastructure; (4) SwipeRepository adapter + swipe use cases + SwipeController + swipe.routes.ts infrastructure; (5) app.ts final import swaps for all four modules.

---

## Project Constraints (from CLAUDE.md)

- **Architecture:** routes → service → repository; no skipping layers. Phase 12 maps to: routes → controller → use-case → repository/adapter.
- **SOLID SRP:** one class per responsibility — each use case is its own file/class.
- **Module isolation:** modules do not import from other modules. `src/adapters/` imports only `application/` and `domain/`.
- **Security:** all queries via Prisma ORM — no raw SQL string interpolation.
- **Zod validation:** inputs validated with Zod in all endpoints — validation stays in controller or route file.
- **Atomic transactions:** `SwipeRepository.createSwipe` uses `prisma.$transaction`; `CreditRepository.executeUnlock` uses `prisma.$transaction` — both must be preserved in adapter implementations.
- **TDD:** integration tests run against real Docker DB — no mocks for DB interaction.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-07 | Use cases in `src/application/use-cases/` receive all dependencies exclusively via interfaces and ports — never concrete implementations | Each use case constructor receives only interface types (ISwipeRepository, ICreditRepository, IChatRepository, IRecommendationRepository, IChatPort). No concrete class is imported inside any use-case file. |
| TEST-01 | All 41 integration tests pass green — zero regressions introduced by migration | Migration is additive (old modules/ files not deleted). Tests continue calling `buildApp()` which is the single wiring seam. Each module migrates by swapping its import in app.ts. Running `npm run test:integration` after each swap verifies zero regressions. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Record swipe (LIKE/DISLIKE) + create chat on LIKE | Application (use-cases/swipe/) | Adapters (repositories/swipe.repository.ts) | Business rules (duplicate check, job-active check, chat creation) live in use case; Prisma transaction in repo |
| Feed generation (cursor-paginated job list + fitScore per job) | Application (use-cases/swipe/) | Adapters (services/neo4j.adapter.ts) | fitScore computation delegated to IRecommendationRepository; feed query in ISwipeRepository |
| Ranking (fitScore sort + DISLIKE censoring) | Application (use-cases/swipe/) | Adapters (repositories/swipe.repository.ts + services/neo4j.adapter.ts) | Ownership check, fitScore batch, ranking sort are business rules |
| Candidate unlock (credit deduct + chat creation) | Application (use-cases/credits/) | Adapters (repositories/credit.repository.ts) | All business guards (recruiter owns job, swipe exists, DISLIKE check, already-unlocked, cost lookup, credit sufficiency) are use-case concerns; atomic transaction in repo |
| Grant credits (admin path) | Application (use-cases/credits/) | Adapters (repositories/credit.repository.ts) | Amount validation is business logic; atomic grant in repo |
| Fit score computation | Adapters (services/neo4j.adapter.ts) | — | Wraps RecommendationRepository; implements IRecommendationRepository; no Prisma calls |
| Neo4j taxonomy seed | Adapters (services/neo4j.adapter.ts) | — | Passes through to RecommendationRepository.seedTaxonomy() |
| Chat create/get | Application (use-cases/chat/) | Adapters (repositories/chat.repository.ts) | Business logic (createOrGetChat upsert) is thin; delegate to IChatRepository |
| Send message + recruiter-first rule | Application (use-cases/chat/) | Adapters (repositories/chat.repository.ts) | Recruiter-first business rule lives in use case; DB write in repo |
| WebSocket gateway | Infrastructure (http/routes/chat.routes.ts) | — | In-memory connection Map, buffering, broadcast are infrastructure concerns; not business logic |
| Message history + mark-as-read | Application (use-cases/chat/) | Adapters (repositories/chat.repository.ts) | Pagination, participant check, read-mark are application logic |
| HTTP input validation (Zod) | Adapters (controllers/) | — | All Zod schema parsing moves to controllers (same pattern as Phase 11) |
| Route registration | Infrastructure (http/routes/) | — | Zero logic; endpoint registration + preHandlers + ctrl.method.bind(ctrl) |

---

## Standard Stack

### Core (all already installed — no new packages needed)
[VERIFIED: reading package.json and src/ files]

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| fastify | ^5.8.5 | HTTP framework | already installed |
| @fastify/websocket | (already installed) | WebSocket support | chat.routes.ts uses `websocket: true` — plugin must remain registered before chatRoutes |
| @prisma/client | ^7.7.0 | DB ORM | already installed — used only in adapters/repositories/ |
| neo4j-driver | (already installed) | Neo4j driver | used in neo4j.adapter.ts wrapper |
| zod | ^4.3.2 | Input validation | already installed — used in controllers |

### No New Installs
Phase 12 is purely a code migration. All required libraries are already installed.

---

## Architecture Patterns

### System Architecture Diagram — Swipe Request Flow (New Wiring)

```
HTTP POST /swipes
     |
     v
src/infrastructure/http/routes/swipe.routes.ts
  (opts: { chat: IChatPort })
     | (registers path, preHandler, delegates via ctrl.method.bind(ctrl))
     v
src/adapters/controllers/swipe.controller.ts
     | (Zod parse; instantiates use case with new repos; catch DomainError)
     v
src/application/use-cases/swipe/record-swipe.use-case.ts
     | (business rules: candidate/job exist; job active; duplicate guard; chat-on-LIKE)
     |
     +---> src/adapters/repositories/swipe.repository.ts (ISwipeRepository)
     |          | prisma.$transaction (createSwipe)
     |          v
     |        PostgreSQL
     |
     +---> IChatPort (injected from opts.chat)
               | createOrGetChat(...)
               v
             ChatService (src/modules/chat/chat.service.ts  [until app.ts final swap])
             OR ChatUseCase (after chat migration)
```

### Chat Module Flow (New Wiring — WebSocket path)

```
WS Upgrade GET /chats/:chatId/ws
     |
     v
src/infrastructure/http/routes/chat.routes.ts
  (opts: { service: IChatRouteService })
  [contains: connections Map, addConnection, removeConnection, broadcast — module-level]
     | preHandler: authenticate (JWT verify before upgrade)
     v
  async WS handler:
     | buffer pending messages
     +---> IChatRouteService.verifyParticipant(chatId, userId)
     |       (returns false if not participant — socket.close(1008))
     |
     | addConnection(chatId, socket)
     |
     | on 'message':
     |   IncomingMessageSchema.parse(JSON.parse(rawData))
     +---> IChatRouteService.sendMessage(chatId, senderId, content)
     |       v
     |     src/application/use-cases/chat/send-message.use-case.ts
     |       (recruiter-first rule; participant check; repo.createMessage)
     |
     | broadcast(chatId, message)
```

### Recommended Project Structure (new directories/files Phase 12 creates)

```
src/
├── application/
│   └── use-cases/
│       ├── swipe/
│       │   ├── record-swipe.use-case.ts
│       │   ├── get-feed.use-case.ts
│       │   └── get-ranking.use-case.ts
│       ├── credits/
│       │   ├── unlock-candidate.use-case.ts
│       │   └── grant-credits.use-case.ts
│       └── chat/
│           ├── create-or-get-chat.use-case.ts
│           ├── send-message.use-case.ts
│           ├── verify-participant.use-case.ts
│           ├── get-messages.use-case.ts
│           └── list-chats.use-case.ts
├── adapters/
│   ├── controllers/
│   │   ├── swipe.controller.ts           (NEW)
│   │   ├── credits.controller.ts         (NEW)
│   │   └── chat.controller.ts            (NEW)
│   ├── repositories/
│   │   ├── swipe.repository.ts           (NEW — implements ISwipeRepository)
│   │   ├── credit.repository.ts          (NEW — implements ICreditRepository)
│   │   └── chat.repository.ts            (NEW — implements IChatRepository)
│   └── services/
│       └── neo4j.adapter.ts              (NEW — implements IRecommendationRepository)
└── infrastructure/
    └── http/
        └── routes/
            ├── swipe.routes.ts           (NEW)
            ├── credits.routes.ts         (NEW)
            └── chat.routes.ts            (NEW)
```

---

## Critical Design Questions — Resolved

### Q1: IRecommendationService vs IRecommendationRepository — which interface do swipe use cases consume?

**Current behavior:** `SwipeService` depends on `IRecommendationService` (from `src/shared/interfaces/recommendation.interface.ts`) which has method `computeFitScore(candidate: CandidateData, job: JobData): Promise<number>`. `CandidateData` and `JobData` are plain data objects with no `id` field. `RecommendationRepository` implements `IRecommendationService`.

**New domain interface:** `IRecommendationRepository` (from `src/domain/interfaces/recommendation.repository.interface.ts`) has method `computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>`. `FitScoreInput` and `FitScoreJobInput` add `id` fields to the shapes. This interface also declares `seedTaxonomy(): Promise<void>`.

**Problem:** The two `computeFitScore` signatures are NOT compatible. If the swipe use cases receive `IRecommendationRepository`, callers must provide `FitScoreInput` objects (with `id`) instead of `CandidateData` objects (without `id`). The swipe repository already returns `Job` and `CandidateProfile` domain entities that have `id` fields — so the `FitScoreInput` shape is actually more complete and the call sites in `GetFeedUseCase` and `GetRankingUseCase` can construct `FitScoreInput` by adding `id` to the data they already have.

**Resolution:** New swipe use cases receive `IRecommendationRepository` (the domain port). This is the correct direction per ARCH-07. The `Neo4jAdapter` at `src/adapters/services/neo4j.adapter.ts` implements `IRecommendationRepository` by delegating to `RecommendationRepository` (wrapping it). The Neo4jAdapter constructor receives a `Driver` from the composition root.

**Neo4jAdapter implementation:**
```typescript
// src/adapters/services/neo4j.adapter.ts
import { Driver } from 'neo4j-driver'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../domain/interfaces/recommendation.repository.interface'
import { RecommendationRepository } from '../../modules/recommendation/recommendation.repository'

export class Neo4jAdapter implements IRecommendationRepository {
  private readonly inner: RecommendationRepository
  constructor(driver: Driver) {
    this.inner = new RecommendationRepository(driver)
  }
  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number> {
    // FitScoreInput adds id; IRecommendationService.CandidateData does not.
    // RecommendationRepository.computeFitScore only uses: professionId, skills,
    // preferredModalities, salaryExpectation, lat, lng, searchRadiusKm
    // and: professionId, requiredSkills, modality, salaryMin, salaryMax, lat, lng
    // The id field on FitScoreInput/FitScoreJobInput is safely ignored by the inner call.
    return this.inner.computeFitScore(candidate, job)
  }
  async seedTaxonomy(): Promise<void> {
    return this.inner.seedTaxonomy()
  }
}
```

**Important note:** `RecommendationRepository.computeFitScore` currently receives `(CandidateData, JobData)` shapes without `id`. `FitScoreInput` and `FitScoreJobInput` are structural supersets — TypeScript will accept `FitScoreInput` where `CandidateData` is expected (structural typing). The adapter passes through transparently.

### Q2: IChatPort for swipe and credits use cases — which interface to use?

**Current behavior:** `SwipeService` and `CreditService` each receive an `IChatService` (from `src/shared/interfaces/chat.interface.ts`) via constructor injection. `IChatService` declares `createOrGetChat` and `sendMessage`. Only `createOrGetChat` is called by these services.

**New architecture:** The swipe and credits use cases must receive a chat dependency via interface injection (ARCH-07). Options:
1. Import `IChatService` from `src/shared/interfaces/chat.interface.ts` — direct reuse; `shared/` is accessible from `application/` layer.
2. Define a minimal `IChatPort` locally in each use case file.
3. Define `IChatPort` in `src/application/ports/chat.port.ts` (consistent with IHashPort/ITokenPort pattern).

**Resolution:** Define `IChatPort` in `src/application/ports/chat.port.ts` with only `createOrGetChat`. This is the cleanest approach — consistent with the established ports pattern (IHashPort, ITokenPort). The existing `IChatService` in shared/ will eventually be removed in Phase 13. The `ChatInitiator` type used in the signature comes from `src/domain/entities/chat.entity.ts` (defined as `'MATCH' | 'CREDIT'` string union) — NOT from `@prisma/client`.

**IChatPort definition:**
```typescript
// src/application/ports/chat.port.ts
import { ChatInitiator } from '../../domain/entities/chat.entity'

export interface IChatPort {
  createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }>
}
```

The `ChatService` class already satisfies this interface structurally. The `chat.routes.ts` in infrastructure continues to use the broader `IChatRouteService` (which extends `IChatService` from shared/) because the route file needs `verifyParticipant`, `getMessages`, and `listChats` in addition to `createOrGetChat`.

### Q3: Chat module — IChatRepository vs ChatRepository method mismatch

**Current behavior:** `ChatService` calls `this.repo.findChatWithParticipants(chatId)` which returns a Prisma row with nested `candidate: { userId }` and `job.recruiter: { userId }` objects. The chat use cases need participant user IDs.

**New domain interface:** `IChatRepository.findParticipants(chatId)` returns `ChatParticipants | null` (with `candidateUserId` and `recruiterUserId` string fields). This is a normalized abstraction over the Prisma nested include.

**Resolution:** The `ChatRepository` adapter (new) implements `findParticipants` by calling `prisma.chat.findUnique(...)` with the appropriate includes and mapping to `ChatParticipants`. The chat use cases (`SendMessageUseCase`, `VerifyParticipantUseCase`) receive `IChatRepository` and call `repo.findParticipants(chatId)` — no Prisma nested shapes in use cases.

**toDomain note:** Chat and Message entities closely match Prisma models. `ChatRepository.toDomain(row)` maps: `id, candidateId, jobId, companyId, initiatedBy: row.initiatedBy as ChatInitiator, expiresAt, isActive, createdAt`. The `ChatInitiator` Prisma enum cast to domain union type is required (same pattern as Modality in Phase 11).

**IChatRepository.findByUserId** returns `ChatListItem[]` which requires joins (candidate name, company name, recruiter userId). The adapter must use `prisma.chat.findMany({ include: { candidate, job: { include: { recruiter, company } } } })` and map to `ChatListItem` shape. This is a non-trivial mapping but all fields are available from the query.

### Q4: Chat routes — WebSocket wiring must remain in infrastructure layer

**Current behavior:** `src/modules/chat/chat.routes.ts` contains module-level WebSocket connection management (`connections` Map, `addConnection`, `removeConnection`, `broadcast`). These are NOT business logic — they are infrastructure concerns.

**Resolution:** Copy the entire connection management code verbatim into the new `src/infrastructure/http/routes/chat.routes.ts`. The `IChatRouteService` interface (currently defined in `src/modules/chat/chat.routes.ts`) moves to the new infrastructure route file. The WS handler delegates to `service.sendMessage(...)` and `service.verifyParticipant(...)` via `IChatRouteService`.

**Important:** The WS handler catches `AppError` (not `DomainError`) when `sendMessage` fails: `err instanceof AppError`. After migration, if `SendMessageUseCase` throws `DomainError`, the WS handler must catch `DomainError`. The handler should be updated to catch `DomainError` instead of (or in addition to) `AppError`.

### Q5: Credits route — response body construction after unlock

**Current behavior:** `creditsJobRoutes` calls `service.unlockCandidate(...)` to get the unlock result, then calls `repo.findCandidateProfileById(candidateId)` and `repo.findJobById(jobId)` DIRECTLY on the repo (bypassing the service) to construct the enriched response body with `profile` and `distanceKm`. This happens inside the route handler, not in the service.

**Resolution:** After migration to controller pattern:
- `UnlockCandidateUseCase.execute(...)` returns `{ unlock: UnlockResult, chatId: string }`
- The `CreditsController.unlock` handler then calls `creditRepo.findCandidateProfileById(candidateId)` and `creditRepo.findJobById(jobId)` directly via the `ICreditRepository` to build the enriched response.
- Alternatively: add a `findCandidateProfileWithDistance` use case. The simplest approach is to instantiate `ICreditRepository` in the controller and call repo methods for the enrichment query. This is acceptable because the controller is the adapter layer — it may call repositories for response shaping that is not business logic.
- `haversineKm` utility at `src/shared/utils/haversine.ts` is imported in the controller for distance computation.

### Q6: Swipe routes — two route plugins in one module

**Current behavior:** `src/modules/swipe/swipe.routes.ts` exports TWO async functions:
- `swipeRoutes(app, opts)` — mounts POST / under `/swipes` prefix
- `swipeJobRoutes(app, opts)` — mounts GET /feed and GET /:jobId/ranking under `/jobs` prefix

**In app.ts:**
```typescript
await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService })
```

**Resolution:** The new `src/infrastructure/http/routes/swipe.routes.ts` must export BOTH functions. The controller handles all three actions. Both route functions receive the same opts shape `{ chat: IChatPort, neo4j: IRecommendationRepository }`.

**App.ts change after swap:**
```typescript
import { swipeRoutes, swipeJobRoutes } from './infrastructure/http/routes/swipe.routes'
// Plus neo4j adapter instance:
const neo4jAdapter = new Neo4jAdapter(getNeo4jDriver())
await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter })
```

### Q7: Rate limiting on POST /swipes

**Current behavior:** POST /swipes has `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` applied at route level (not as a preHandler). This is a Fastify route-level config option, not a hook.

**Resolution:** The new `swipe.routes.ts` preserves this pattern:
```typescript
app.post('/', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  preHandler: [authenticate, requireRole('CANDIDATE')],
}, ctrl.recordSwipe.bind(ctrl))
```

### Q8: IChatPort must use domain ChatInitiator, not Prisma ChatInitiator

**Current behavior:** `IChatService` (shared/interfaces) imports `ChatInitiator` from `@prisma/client`. In the new architecture, ports must not import from Prisma.

**Resolution:** The new `IChatPort` imports `ChatInitiator` from `'../../domain/entities/chat.entity'` (the domain union type `'MATCH' | 'CREDIT'`). The `ChatService` receives a Prisma `ChatInitiator` from its Prisma repository — TypeScript structural typing makes them compatible since both are identical string literals.

**Critical:** `SwipeService` currently imports `ChatInitiator, Prisma, SwipeDirection` from `@prisma/client`. In the new swipe use cases, NO `@prisma/client` imports are allowed. Instead:
- `SwipeDirection` comes from `src/domain/entities/swipe.entity.ts`
- `ChatInitiator` comes from `src/domain/entities/chat.entity.ts`
- `Prisma.PrismaClientKnownRequestError` duplicate-swipe catch: this must move to the repository adapter (where Prisma is allowed), NOT the use case.

### Q9: P2002 duplicate-swipe error handling must move to repository

**Current behavior:** `SwipeService.recordSwipe` catches `Prisma.PrismaClientKnownRequestError` (P2002) and converts it to `AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')`. This is a Prisma-specific concern.

**Resolution:** The `SwipeRepository.createSwipe` adapter wraps `prisma.$transaction(...)` and catches P2002 internally, throwing `DomainError('Duplicate swipe', 'DUPLICATE_SWIPE', 409)`. The use case receives `DomainError` only. No Prisma import in the use case.

**Same pattern for credits P2002:** `CreditRepository.executeUnlock` adapter catches P2002 and throws `DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)`.

### Q10: CreditRepository error strings vs DomainError

**Current behavior:** `CreditRepository.executeUnlock` throws `new Error('INSUFFICIENT_CREDITS')` and `new Error('COMPANY_NOT_FOUND')` inside the Prisma transaction. `CreditService` catches these by string message.

**Resolution:** The new `CreditRepository` adapter throws `DomainError` directly inside the Prisma transaction:
- `throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 402)`
- `throw new DomainError('Company not found', 'NOT_FOUND', 404)`

The use case does NOT need error-string catching — DomainErrors propagate through the transaction and are caught by the errorHandler. (Same pattern as CompanyRepository.adjustCredits in Phase 11.)

### Q11: UNLOCK_COST_BY_PLAN constant location

**Current behavior:** `credits.constants.ts` exports `UNLOCK_COST_BY_PLAN: Record<string, number>` which is imported by `CreditService`. In the new architecture, use cases cannot import from `src/modules/credits/`.

**Resolution:** Move/copy `UNLOCK_COST_BY_PLAN` to a new location accessible to the use case. Two options:
1. Put it in the use case file directly (inline constant) — acceptable for a simple cost table.
2. Create `src/application/use-cases/credits/credits.constants.ts` and import from there.

Option 2 is cleaner for reuse. `UnlockCandidateUseCase` imports `UNLOCK_COST_BY_PLAN` from its own directory.

### Q12: grantCredits validation — amount must be positive integer

**Current behavior:** `CreditService.grantCredits` validates `!Number.isInteger(amount) || amount <= 0` and throws `AppError`. This is business logic that must live in the use case.

**Resolution:** `GrantCreditsUseCase.execute` validates amount and throws `DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)` if invalid. The repository's `grantCredits` method is only called after this guard.

### Q13: app.ts composition order — chat must be instantiated before swipe/credits

**Current app.ts order (relevant section):**
```typescript
const chatRepo = new ChatRepository()         // modules/chat
const chatService = new ChatService(chatRepo) // modules/chat

await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService })
await app.register(creditsJobRoutes, { prefix: '/jobs', chat: chatService })
const creditRepo = new CreditRepository()    // modules/credits
const creditService = new CreditService(creditRepo, chatService)
await app.register(adminRoutes, { prefix: '/admin', creditService })
await app.register(chatRoutes, { prefix: '/chats', service: chatService })
```

**After Phase 12 migration, the new app.ts composition:**
```typescript
// Chat repository + service (now from adapters layer)
const chatRepo = new ChatRepository()                    // adapters/repositories
const chatService = new ChatService(chatRepo)            // modules/chat (or use cases wired here)
// OR: chat use cases wired ad-hoc in chat.routes.ts opts

// Neo4j adapter (new)
const neo4jAdapter = new Neo4jAdapter(getNeo4jDriver())  // adapters/services

// Swipe routes — ISwipeRepository + IRecommendationRepository + IChatPort injected
await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter })

// Credits routes — ICreditRepository + IChatPort injected
await app.register(creditsJobRoutes, { prefix: '/jobs', chat: chatService })

// Credit service (still needed for adminRoutes)
const creditRepo = new CreditRepository()              // adapters/repositories
const creditService = new CreditService(creditRepo, chatService) // kept for adminRoutes compat
await app.register(adminRoutes, { prefix: '/admin', creditService })

// Chat routes
await app.register(chatRoutes, { prefix: '/chats', service: chatService })
```

**Key difference:** The new swipe and credits route files instantiate their own repositories and use cases internally (same pattern as Phase 11 — see candilateRoutes). The `chatService` reference passed via opts only provides the `IChatPort` for `createOrGetChat` calls — it is NOT used to create a full chat use case pipeline inside swipe/credits use cases. The chat routes use a broader `IChatRouteService` which remains satisfied by `ChatService`.

### Q14: RankingItem type — migrated location

**From Phase 11 research:** `RankingItem` is currently exported from `src/modules/job/job.routes.ts` and imported by `src/modules/swipe/swipe.routes.ts`. After Phase 11, `app.ts` imports job routes from infrastructure, but `swipe.routes.ts` (in modules/) still imports `RankingItem` from the old module location (this was intentional — additive migration).

**After Phase 12:** The new `src/infrastructure/http/routes/swipe.routes.ts` (or `swipe.controller.ts`) will need the `RankingItem` type for the ranking response. The correct import for the new swipe infrastructure file is from `src/infrastructure/http/routes/job.routes.ts` (the Phase 11 output) OR define `RankingItem` inline in the swipe controller. The simplest path: import from the Phase 11 job routes file.

---

## File-by-File Implementation Guide

### Chat Module (migrate first — swipe/credits depend on IChatPort)

**`src/application/ports/chat.port.ts`** — NEW:
```typescript
import { ChatInitiator } from '../../domain/entities/chat.entity'
export interface IChatPort {
  createOrGetChat(candidateId: string, companyId: string, jobId: string, initiator: ChatInitiator): Promise<{ chatId: string }>
}
```

**`src/adapters/repositories/chat.repository.ts`** — implements `IChatRepository`:
- `createOrGetChat(candidateId, companyId, jobId, initiator)` → `prisma.chat.upsert(...)` + `toDomain(row)`
- `createMessage(chatId, senderId, content)` → `prisma.message.create(...)` + message toDomain
- `findMessages(chatId, cursor, limit)` → cursor-paginated `prisma.message.findMany(...)` + map to `Message[]`
- `findById(chatId)` → `prisma.chat.findUnique({ where: { id: chatId } })` + `toDomain | null`
- `findParticipants(chatId)` → `prisma.chat.findUnique({ include: { candidate: { select: { userId } }, job: { include: { recruiter: { select: { userId } } } } } })` → map to `ChatParticipants | null`
- `countRecruiterMessages(chatId, recruiterUserId)` → `prisma.message.count({ where: { chatId, senderId: recruiterUserId } })`
- `findByUserId(userId)` → `prisma.chat.findMany({ where: { OR: [...] }, include: { candidate, job: { include: { recruiter, company } } } })` → map to `ChatListItem[]`
- `markMessagesRead(chatId, excludeSenderId)` → `prisma.message.updateMany(...)`
- `private toDomain(row)` → maps to `Chat` domain entity; cast `row.initiatedBy as ChatInitiator`

**`src/application/use-cases/chat/create-or-get-chat.use-case.ts`**:
- Injects: `IChatRepository`
- Logic: `repo.createOrGetChat(candidateId, companyId, jobId, initiator)` → returns `{ chatId: chat.id }`

**`src/application/use-cases/chat/send-message.use-case.ts`**:
- Injects: `IChatRepository`
- Logic: `repo.findParticipants(chatId)` → null → `DomainError('Chat not found', 'NOT_FOUND', 404)`; participant check → `DomainError('Not a participant', 'NOT_PARTICIPANT', 403)`; recruiter-first: `repo.countRecruiterMessages(chatId, recruiterUserId)` === 0 && sender !== recruiter → `DomainError('Recruiter must send first message', 'RECRUITER_MUST_INITIATE', 403)`; → `repo.createMessage(chatId, senderId, content)`

**`src/application/use-cases/chat/verify-participant.use-case.ts`**:
- Injects: `IChatRepository`
- Logic: `repo.findParticipants(chatId)` → null → return false; return userId === candidateUserId || userId === recruiterUserId
- Does NOT throw — returns boolean (same as current `verifyParticipant` method)

**`src/application/use-cases/chat/get-messages.use-case.ts`**:
- Injects: `IChatRepository`
- Logic: `verifyParticipant` → `DomainError` if false → cursor-paginated `repo.findMessages(...)` → `repo.markMessagesRead(chatId, userId)` → return `{ data, nextCursor }`

**`src/application/use-cases/chat/list-chats.use-case.ts`**:
- Injects: `IChatRepository`
- Logic: `repo.findByUserId(userId)` → map `ChatListItem[]` to response shape (candidate sees company name; recruiter sees candidate name)

**`src/adapters/controllers/chat.controller.ts`**:
- Constructor receives `IChatRepository` instance
- `listChats`, `getMessages` handlers — Zod parse, use case execute, DomainError catch
- No WS handler in controller — WS stays in infrastructure route file

**`src/infrastructure/http/routes/chat.routes.ts`**:
- Exports `IChatRouteService` interface (same methods as current `chat.routes.ts`)
- Keeps `connections` Map, `addConnection`, `removeConnection`, `broadcast` helpers (verbatim copy)
- `opts: { service: IChatRouteService }` — same interface as current
- Route: `GET /` → listChats; `GET /:chatId/messages` → getMessages; `GET /:chatId/ws` → WS handler
- WS handler catches `DomainError` (replacing `AppError` catch) for SendMessageUseCase errors
- Import `DomainError` from `'../../../application/errors/domain.error'`

### Recommendation — Neo4j Adapter (migrate second)

**`src/adapters/services/neo4j.adapter.ts`** — implements `IRecommendationRepository`:
- Constructor: `constructor(private readonly driver: Driver)`
- `computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>` → delegates to `new RecommendationRepository(this.driver).computeFitScore(candidate, job)`
- `seedTaxonomy(): Promise<void>` → delegates to `new RecommendationRepository(this.driver).seedTaxonomy()`
- Import `RecommendationRepository` from `'../../modules/recommendation/recommendation.repository'` — this is acceptable from adapters layer (adapters wrap infrastructure details)
- Import `Driver` from `'neo4j-driver'`

**Note on driver reuse:** Create `RecommendationRepository` once in constructor to avoid re-instantiation per call. Store as `private readonly inner: RecommendationRepository`.

### Credits Module (migrate third — after IChatPort exists)

**`src/application/use-cases/credits/credits.constants.ts`** — NEW:
```typescript
export const UNLOCK_COST_BY_PLAN: Record<string, number> = { FREE: 2, PRO: 1 }
```

**`src/adapters/repositories/credit.repository.ts`** — implements `ICreditRepository`:
- `findRecruiterByUserId(userId)` → `prisma.recruiterProfile.findUnique({ where: { userId }, include: { company: { select: { id, plan, credits } } } })` → map to `RecruiterWithCompany | null`
- `findJobById(id)` → `prisma.job.findUnique(...)` → `toDomain | null` (inline job toDomain — no JobRepository import; ARCH-04)
- `findSwipe(candidateId, jobId)` → `prisma.swipe.findUnique({ where: { candidateId_jobId: { candidateId, jobId } } })` → `Swipe | null`
- `findUnlock(companyId, candidateId, jobId)` → `prisma.unlock.findUnique(...)` → `Unlock | null`
- `findCandidateProfileById(id)` → `prisma.candidateProfile.findUnique({ where: { id }, include: { user: { select: { avatarUrl } } } })` → `(CandidateProfile & { avatarUrl: string | null }) | null`
- `executeUnlock(companyId, candidateId, jobId, creditsCost)` → `prisma.$transaction(async tx => { ... })` — preserve full transaction; throw `DomainError` (not Error strings) for INSUFFICIENT_CREDITS and COMPANY_NOT_FOUND; catch `Prisma.PrismaClientKnownRequestError` P2002 inside transaction → `DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)`
- `grantCredits(companyId, amount, reason)` → `prisma.$transaction(async tx => { ... })` — same atomic pattern

**`src/application/use-cases/credits/unlock-candidate.use-case.ts`**:
- Injects: `ICreditRepository`, `IChatPort`
- Logic (verbatim from CreditService.unlockCandidate, translated to DomainError):
  - `repo.findRecruiterByUserId(userId)` → null → `DomainError('Forbidden', 'FORBIDDEN', 403)`
  - `repo.findJobById(jobId)` → null → `DomainError('Job not found', 'NOT_FOUND', 404)`
  - ownership check → `DomainError('Forbidden', 'FORBIDDEN', 403)`
  - `repo.findSwipe(candidateId, jobId)` → null → `DomainError('Candidate not found on this job', 'NOT_FOUND', 404)`
  - direction !== 'DISLIKE' → `DomainError('Candidate is already visible', 'CANDIDATE_ALREADY_VISIBLE', 422)`
  - `repo.findUnlock(...)` → exists → `DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)`
  - `cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']`
  - `repo.executeUnlock(...)` — DomainErrors propagate from repo
  - `chat.createOrGetChat(candidateId, recruiter.companyId, jobId, 'CREDIT')`
  - returns `{ ...unlock, chatId }`
- NO Prisma import; NO AppError; NO P2002 catch (moved to repo)

**`src/application/use-cases/credits/grant-credits.use-case.ts`**:
- Injects: `ICreditRepository`
- Logic: integer/positive validation → `DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)` → `repo.grantCredits(companyId, amount, reason)`

**`src/adapters/controllers/credits.controller.ts`**:
- `unlock(request, reply)`: Zod parse `UnlockParamsSchema` → instantiate use case with `new CreditRepository()` and `opts.chat` → execute → reply 201 with enriched response
- Enriched response: after unlock, call `new CreditRepository().findCandidateProfileById(candidateId)` and `findJobById(jobId)` for profile+distance
- `haversineKm` imported from `'../../../shared/utils/haversine'`
- DomainError catch in every handler

**`src/infrastructure/http/routes/credits.routes.ts`**:
- Opts: `{ chat: IChatPort }` (imported from `'../../../application/ports/chat.port'`)
- `POST /:jobId/candidates/:candidateId/unlock` → `[authenticate, requireRole('RECRUITER')]` → `ctrl.unlock.bind(ctrl)`

### Swipe Module (migrate last — depends on IChatPort + IRecommendationRepository)

**`src/adapters/repositories/swipe.repository.ts`** — implements `ISwipeRepository`:
- `createSwipe(data)` → `prisma.$transaction(async tx => { ... tx.swipe.create({ data }) })` — catch P2002 inside transaction → `DomainError('Duplicate swipe', 'DUPLICATE_SWIPE', 409)`
- `findJobById(id)` → `prisma.job.findUnique(...)` + job `toDomain | null` (inline; no JobRepository import)
- `findCandidateProfileByUserId(userId)` → `prisma.candidateProfile.findUnique(...)` + candidate `toDomain | null`
- `findRecruiterProfileByUserId(userId)` → `prisma.recruiterProfile.findUnique(...)` + recruiter `toDomain | null`
- `findFeedJobs(candidateId, cursor, limit)` → `prisma.job.findMany(...)` (active, not expired, not yet swiped by candidateId, cursor-paginated) + `toDomain[]`
- `findSwipesByJobId(jobId)` → `prisma.swipe.findMany({ include: { candidate: { include: { user: { select: { avatarUrl } } } } } })` → map to `SwipeWithCandidateInfo[]` — NOTE: `SwipeWithCandidateInfo` requires `candidate.avatarUrl` field which comes from the `user` relation; the domain interface shape `CandidateProfile & { avatarUrl: string | null }` is satisfied by mapping `row.candidate.user.avatarUrl` onto the result
- `findUnlocksByJobAndCompany(jobId, companyId)` → `prisma.unlock.findMany({ where: { jobId, companyId }, select: { candidateId } })` → `new Set(results.map(u => u.candidateId))`

**`src/application/use-cases/swipe/record-swipe.use-case.ts`**:
- Injects: `ISwipeRepository`, `IChatPort`
- Logic (no Prisma imports; use domain types only):
  - `repo.findCandidateProfileByUserId(userId)` → null → `DomainError('Candidate profile not found', 'NOT_FOUND', 404)`
  - `repo.findJobById(jobId)` → null → `DomainError('Job not found', 'NOT_FOUND', 404)`
  - `!job.isActive || job.expiresAt <= new Date()` → `DomainError('Job not found', 'NOT_FOUND', 404)`
  - `repo.createSwipe({ candidateId: candidate.id, jobId, direction })` — DomainError(P2002) propagates from repo
  - if direction === 'LIKE': `chat.createOrGetChat(candidate.id, job.companyId, jobId, 'MATCH')`
  - returns `{ ...swipe, chatId }`
- `SwipeDirection` imported from `'../../../domain/entities/swipe.entity'`
- `ChatInitiator` ('MATCH') comes from domain entity string literal — no Prisma import needed

**`src/application/use-cases/swipe/get-feed.use-case.ts`**:
- Injects: `ISwipeRepository`, `IRecommendationRepository`
- Logic:
  - `repo.findCandidateProfileByUserId(userId)` → null → `DomainError`
  - `repo.findFeedJobs(candidate.id, cursor, limit)` → paginate (take limit+1, hasNext)
  - `Promise.all(data.map(job => rec.computeFitScore({ id: candidate.id, professionId, skills, preferredModalities, salaryExpectation, lat, lng, searchRadiusKm }, { id: job.id, professionId, requiredSkills, modality, salaryMin, salaryMax, lat, lng })))`
  - returns `{ data: scoredData, nextCursor }`
- `IRecommendationRepository` imported from `'../../../domain/interfaces/recommendation.repository.interface'`

**`src/application/use-cases/swipe/get-ranking.use-case.ts`**:
- Injects: `ISwipeRepository`, `IRecommendationRepository`
- Logic:
  - `repo.findRecruiterProfileByUserId(userId)` → null → `DomainError('Forbidden', 'FORBIDDEN', 403)`
  - `repo.findJobById(jobId)` → null → `DomainError`
  - ownership check
  - `repo.findSwipesByJobId(jobId)` + `repo.findUnlocksByJobAndCompany(jobId, recruiterProfile.companyId)`
  - batch `computeFitScore` per swipe
  - censor non-LIKE, non-unlocked profiles (profile: null)
  - sort by fitScore DESC + add rank
  - `haversineKm` imported from `'../../../shared/utils/haversine'`

**`src/adapters/controllers/swipe.controller.ts`**:
- Constructor receives `{ neo4j: IRecommendationRepository, chat: IChatPort }` OR these are instantiated inside each handler
- Zod schemas: `SwipeBodySchema`, `FeedQuerySchema`, `JobIdParamsSchema`
- `recordSwipe`, `getFeed`, `getRanking` handlers
- HTTP status: 201 for recordSwipe, 200 for getFeed/getRanking

**`src/infrastructure/http/routes/swipe.routes.ts`**:
- Opts: `{ chat: IChatPort, neo4j: IRecommendationRepository }`
- Exports TWO async functions: `swipeRoutes` (POST /swipes prefix) and `swipeJobRoutes` (GET /jobs/feed + GET /jobs/:jobId/ranking)
- `swipeRoutes`: POST / with rate limit `{ max: 30, timeWindow: '1 minute' }` + `[authenticate, requireRole('CANDIDATE')]`
- `swipeJobRoutes`: GET /feed BEFORE GET /:jobId/ranking (static before parameterized — Pitfall 1)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic swipe creation (duplicate guard) | Custom lock | `prisma.$transaction` in SwipeRepository.createSwipe; catch P2002 → DomainError | PostgreSQL unique constraint + transaction handles concurrency |
| Atomic credit deduction | Custom decrement | `prisma.$transaction` in CreditRepository.executeUnlock — preserve full in-transaction credit sufficiency check | Without the in-transaction check, concurrent unlock requests can both pass the pre-check (TOCTOU) |
| Fit score computation | Custom algorithm | `Neo4jAdapter` wrapping `RecommendationRepository` | Algorithm already implemented and tested; avoid duplicating complex formula |
| WebSocket connection management | Custom pub/sub | In-memory Map `connections` (module-level) per existing pattern | Simple, tested; Redis pub/sub is deferred scope |
| Haversine distance | Custom formula | `src/shared/utils/haversine.ts` | Already implemented; import from shared utils |
| Chat room uniqueness | Custom dedup | `prisma.chat.upsert` with `candidateId_companyId_jobId` composite unique | DB-level guard against duplicate chats (@@unique in schema) |

---

## Common Pitfalls

### Pitfall 1: GET /jobs/feed registered after GET /jobs/:jobId/ranking
**What goes wrong:** Fastify matches `/jobs/feed` against `/:jobId/ranking` and treats `"feed"` as a UUID — Zod UUID validation throws 400.
**Why it happens:** Forgetting registration order matters for static vs parameterized segments.
**How to avoid:** Register `GET /feed` BEFORE `GET /:jobId/ranking` in `swipeJobRoutes` — same order as current `src/modules/swipe/swipe.routes.ts`.
**Warning signs:** `GET /jobs/feed` returns 400 with validation error.

### Pitfall 2: Swipe use case imports Prisma types
**What goes wrong:** `RecordSwipeUseCase` imports `SwipeDirection, ChatInitiator, Prisma` from `@prisma/client` — violates ARCH-07.
**Why it happens:** Direct copy-paste from SwipeService which used Prisma enum types.
**How to avoid:** Use `SwipeDirection` from `src/domain/entities/swipe.entity.ts`; `ChatInitiator` string literal `'MATCH' | 'CREDIT'` from `src/domain/entities/chat.entity.ts`. P2002 catch moves to SwipeRepository adapter.
**Warning signs:** `grep -r "import.*@prisma/client" src/application/use-cases/` returns any match.

### Pitfall 3: IRecommendationRepository input shape mismatch
**What goes wrong:** `GetFeedUseCase` calls `rec.computeFitScore(candidate, job)` but passes `CandidateData`-shaped objects without `id` field — TypeScript error since `FitScoreInput` requires `id`.
**Why it happens:** `IRecommendationRepository.computeFitScore` takes `FitScoreInput` (with `id`); the old `IRecommendationService` did not require `id`.
**How to avoid:** Construct `FitScoreInput` objects explicitly: `{ id: candidate.id, professionId: candidate.professionId, ... }`. All required fields are available from `CandidateProfile` and `Job` domain entities.

### Pitfall 4: Chat WS handler catches AppError but new use case throws DomainError
**What goes wrong:** WS handler has `err instanceof AppError ? err.code : 'SEND_ERROR'` — after migration, `SendMessageUseCase` throws `DomainError`, not `AppError`; the catch falls through to `'SEND_ERROR'` losing the error code.
**Why it happens:** WS handler originally relied on ChatService throwing AppError; new use case throws DomainError.
**How to avoid:** Update WS handler to catch `DomainError`: `err instanceof DomainError ? err.code : err instanceof AppError ? err.code : 'SEND_ERROR'`.

### Pitfall 5: SwipeWithCandidateInfo.avatarUrl mapping
**What goes wrong:** `ISwipeRepository.findSwipesByJobId` must return `SwipeWithCandidateInfo[]` where `candidate` has `avatarUrl: string | null`. The Prisma query returns `candidate.user.avatarUrl` (nested). Returning `prisma.swipe.findMany(...)` raw fails to satisfy the interface.
**Why it happens:** The domain interface flattens the nested user.avatarUrl into the candidate shape.
**How to avoid:** Map each Prisma row to `SwipeWithCandidateInfo` explicitly: `{ ...swipe, candidate: { ...swipe.candidate, avatarUrl: swipe.candidate.user.avatarUrl } }`. Include `toDomain` helper that does this mapping.

### Pitfall 6: ChatRepository.findByUserId must map to ChatListItem (complex join)
**What goes wrong:** `IChatRepository.findByUserId` returns `ChatListItem[]` — a shape with `candidateName`, `candidateUserId`, `companyName`, `recruiterUserId` from multiple joined tables. If the adapter returns Prisma rows directly, TypeScript rejects the return type.
**Why it happens:** The interface was designed for the use case's consumption, abstracting joins.
**How to avoid:** `ChatRepository.findByUserId` maps each Prisma row to `ChatListItem` explicitly. Fields: `id: chat.id, jobId: chat.jobId, initiatedBy: chat.initiatedBy as ChatInitiator, isActive: chat.isActive, createdAt: chat.createdAt, candidateName: chat.candidate.name, candidateUserId: chat.candidate.userId, companyName: chat.job.company.name, recruiterUserId: chat.job.recruiter.userId`.

### Pitfall 7: credits route enriched response calls repo methods in controller
**What goes wrong:** The enriched unlock response (profile + distanceKm) requires calling `findCandidateProfileById` and `findJobById` after the use case completes. If the controller instantiates `new CreditRepository()` for enrichment, it's a second repository instance. This is functionally correct (same Prisma singleton) but may look wrong.
**Why it happens:** The enrichment is a response-shaping concern, not business logic — it belongs in the adapter layer (controller), not the use case.
**How to avoid:** This is acceptable and intentional. The controller holds a reference to `ICreditRepository` (or instantiates `new CreditRepository()`) for the enrichment queries. Document with comment: `// Response enrichment — controller concern, not business logic`.

### Pitfall 8: Neo4j adapter unnecessarily re-instantiates RecommendationRepository
**What goes wrong:** `Neo4jAdapter.computeFitScore` does `new RecommendationRepository(this.driver).computeFitScore(...)` on every call — creates a new object per invocation.
**Why it happens:** Forgetting to store the inner repository as a class field.
**How to avoid:** Store `private readonly inner: RecommendationRepository` in constructor and call `this.inner.computeFitScore(...)`.

### Pitfall 9: IChatPort uses Prisma ChatInitiator type
**What goes wrong:** `IChatPort` imports `ChatInitiator` from `@prisma/client` — violates the port layer boundary (ports must not import from Prisma).
**Why it happens:** Copy-pasting from `IChatService` which imports Prisma's `ChatInitiator`.
**How to avoid:** `IChatPort` imports `ChatInitiator` from `'../../domain/entities/chat.entity'` (domain union type `'MATCH' | 'CREDIT'`). TypeScript structural typing ensures `ChatService` (which internally uses Prisma's `ChatInitiator`) still satisfies `IChatPort`.

---

## app.ts Import Swap Summary

| Module | Old Import | New Import |
|--------|-----------|-----------|
| swipeRoutes, swipeJobRoutes | `./modules/swipe/swipe.routes` | `./infrastructure/http/routes/swipe.routes` |
| creditsJobRoutes | `./modules/credits/credits.routes` | `./infrastructure/http/routes/credits.routes` |
| ChatRepository | `./modules/chat/chat.repository` | `./adapters/repositories/chat.repository` |
| ChatService | `./modules/chat/chat.service` | stays (ChatService class reused until Phase 13) OR replaced by use-case wiring |
| chatRoutes | `./modules/chat/chat.routes` | `./infrastructure/http/routes/chat.routes` |
| CreditRepository | `./modules/credits/credits.repository` | `./adapters/repositories/credit.repository` |
| CreditService | `./modules/credits/credits.service` | stays (still needed for adminRoutes ICreditGrantPort) |
| Neo4jAdapter | (new) | `./adapters/services/neo4j.adapter` + `getNeo4jDriver()` |

**app.ts new compositions needed:**
```typescript
// After migration:
const neo4jAdapter = new Neo4jAdapter(getNeo4jDriver())  // adapters/services

await app.register(swipeRoutes, { prefix: '/swipes', chat: chatService, neo4j: neo4jAdapter })
await app.register(swipeJobRoutes, { prefix: '/jobs', chat: chatService, neo4j: neo4jAdapter })
await app.register(creditsJobRoutes, { prefix: '/jobs', chat: chatService })
// AdminRoutes still receives CreditService (src/modules/credits/credits.service.ts)
// until Phase 13 cleanup
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest + Supertest |
| Config file | `jest.config.ts` |
| Quick run (module-specific) | `npm run test:integration -- --testPathPattern=swipe` |
| Full suite | `npm run test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-07 | No Prisma import in any use-case file after migration | Static (grep) | `grep -r "import.*@prisma" src/application/use-cases/` — expects 0 matches | N/A (grep check) |
| ARCH-07 | No concrete class imports in use-case files | Static (grep) | `grep -r "import.*infrastructure/database/prisma" src/application/use-cases/` — expects 0 matches | N/A |
| TEST-01 | Swipe integration tests pass with new wiring | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=swipe` | Yes — `tests/integration/swipe.test.ts` |
| TEST-01 | Credits integration tests pass with new wiring | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=credits` | Yes — `tests/integration/credits.test.ts` |
| TEST-01 | Chat integration tests pass with new wiring | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=chat` | Yes — `tests/integration/chat.test.ts` |
| TEST-01 | Recommendation integration tests pass | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=recommendation` | Yes — `tests/integration/recommendation.test.ts` |
| TEST-01 | All 41 integration tests pass (full suite) | Integration | `npm run test:integration` | All exist |

### Sampling Rate
- **Per module commit:** `npm run test:integration -- --testPathPattern=<module>`
- **Per wave merge:** `npm run test:integration` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing integration tests cover all four modules. No new test files needed. The migration is a structural refactor with preserved behavior; existing tests exercise the full stack via `buildApp()`.

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. Docker Compose + PostgreSQL + Neo4j are already operational from prior phases. All four modules use Prisma (PostgreSQL) for data persistence. The recommendation module uses the existing Neo4j driver, already operational and configured.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authenticate` preHandler on all swipe/credits/chat routes; JWT verify before WebSocket upgrade |
| V3 Session Management | no | Auth module concern (Phase 10) |
| V4 Access Control | yes | `requireRole('CANDIDATE')` on swipe POST/feed; `requireRole('RECRUITER')` on ranking/unlock; `requireRole('CANDIDATE', 'RECRUITER')` on chat |
| V5 Input Validation | yes | Zod in controllers — SwipeBodySchema, FeedQuerySchema, UnlockParamsSchema, ChatIdParamsSchema, MessagesQuerySchema, IncomingMessageSchema |
| V6 Cryptography | no | No password/token operations in these modules |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on job ranking (recruiter sees other recruiter's ranking) | Elevation of Privilege | `GetRankingUseCase`: ownership check `job.recruiterId !== recruiterProfile.id` → DomainError FORBIDDEN |
| Concurrent unlock race condition (credits deducted twice) | Tampering | `prisma.$transaction` with in-transaction `company.credits < creditsCost` check — PostgreSQL isolation prevents double-deduct |
| Duplicate swipe by same candidate | Tampering | `prisma.$transaction` on createSwipe; P2002 (unique constraint) caught in repo → DUPLICATE_SWIPE |
| WebSocket participant spoofing | Spoofing | `verifyParticipant` check after JWT verify before any message handling; `socket.close(1008, 'Forbidden')` if not participant |
| SQL injection via jobId/candidateId params | Tampering | All params validated by Zod UUID schema; Prisma ORM parameterized queries |
| Credit amount manipulation (non-positive) | Tampering | `GrantCreditsUseCase` validates integer + positive before calling repo; Zod validates HTTP layer |
| DISLIKE candidate profile disclosure | Information Disclosure | `GetRankingUseCase` sets `profile: null` for DISLIKE + not unlocked candidates; only `fitScore`, `rank`, `candidateId` exposed |
| WS message injection (content > 5000 chars) | Tampering | `IncomingMessageSchema` in WS handler validates `content: z.string().min(1).max(5000)` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `FitScoreInput` is a structural superset of `CandidateData` — TypeScript accepts it where `CandidateData` is expected | Q1 (Neo4jAdapter) | If IRecommendationService.computeFitScore signature is incompatible with FitScoreInput, the adapter cannot delegate transparently — low risk since FitScoreInput adds fields; existing logic ignores them |
| A2 | Test count is 41 integration tests (baseline from STATE.md notes) | TEST-01 | If count differs, phase gate is wrong — verify by running `npm run test:integration` before starting |
| A3 | `ChatInitiator` domain union `'MATCH' | 'CREDIT'` is structurally compatible with Prisma's `ChatInitiator` enum | Q8 (IChatPort) | If Prisma generates a non-string enum, structural typing fails — low risk; Prisma enums are string-valued in TypeScript |
| A4 | `adminRoutes` ICreditGrantPort is still satisfied by `CreditService` from `src/modules/credits/credits.service.ts` after Phase 12 migration (CreditService class not changed) | app.ts Q13 | If Phase 12 migration changes CreditService interface, adminRoutes would break — avoided by keeping CreditService intact |

---

## Open Questions

1. **Should ChatService remain as-is for adminRoutes, or should credits be fully decoupled?**
   - What we know: `adminRoutes` receives `creditService: ICreditGrantPort` satisfied by `CreditService`. `CreditService` constructor requires `IChatService`. After Phase 12, `CreditService` still comes from `src/modules/credits/credits.service.ts`.
   - What's unclear: Whether to fully decompose `CreditService` or leave it as the `ICreditGrantPort` implementation for admin.
   - Recommendation: Leave `CreditService` intact as the `ICreditGrantPort` implementation for `adminRoutes`. Its internal `IChatService` dependency is already wired. Full decomposition of admin credit wiring is Phase 13 scope.

2. **Should `ChatService` class be preserved or replaced by ChatUseCase composition in app.ts?**
   - What we know: `chatRoutes` accepts `IChatRouteService` satisfied by `ChatService`. After Phase 12, `ChatRepository` adapter exists.
   - What's unclear: Whether to keep `ChatService` class as the service object (wrapping new ChatRepository) or wire use cases directly in `chat.routes.ts`.
   - Recommendation: Keep `ChatService` class but update its constructor to accept `IChatRepository` (the new adapter). Update `app.ts` to: `const chatRepo = new ChatRepository()` (from adapters/repositories) and `const chatService = new ChatService(chatRepo)`. This is the minimum change needed — ChatService becomes a thin orchestrator.

---

## Sources

### Primary (HIGH confidence — all verified by reading actual source files)
- `src/modules/swipe/swipe.service.ts` — current SwipeService logic (recordSwipe, getFeed, getRanking)
- `src/modules/swipe/swipe.repository.ts` — current SwipeRepository methods and Prisma queries
- `src/modules/swipe/swipe.routes.ts` — two exported route functions, opts shape, rate limit config
- `src/modules/credits/credits.service.ts` — CreditService logic (unlockCandidate, grantCredits)
- `src/modules/credits/credits.repository.ts` — CreditRepository including $transaction patterns
- `src/modules/credits/credits.routes.ts` — creditsJobRoutes, enriched response pattern
- `src/modules/credits/credits.constants.ts` — UNLOCK_COST_BY_PLAN
- `src/modules/recommendation/recommendation.repository.ts` — RecommendationRepository implementing IRecommendationService
- `src/modules/chat/chat.service.ts` — ChatService full implementation (all methods)
- `src/modules/chat/chat.repository.ts` — ChatRepository all Prisma queries
- `src/modules/chat/chat.routes.ts` — IChatRouteService, WebSocket wiring, connection Map
- `src/domain/interfaces/swipe.repository.interface.ts` — ISwipeRepository contract + SwipeWithCandidateInfo
- `src/domain/interfaces/credit.repository.interface.ts` — ICreditRepository + RecruiterWithCompany + UnlockResult
- `src/domain/interfaces/chat.repository.interface.ts` — IChatRepository + ChatParticipants + ChatListItem
- `src/domain/interfaces/recommendation.repository.interface.ts` — IRecommendationRepository + FitScoreInput/FitScoreJobInput
- `src/application/ports/graph.port.ts` — IGraphPort (confirmed NOT used by swipe; different API)
- `src/domain/entities/swipe.entity.ts`, `unlock.entity.ts`, `chat.entity.ts`, `message.entity.ts` — domain shapes
- `src/shared/interfaces/recommendation.interface.ts` — IRecommendationService (old interface)
- `src/shared/interfaces/chat.interface.ts` — IChatService (old interface; source for IChatPort)
- `src/shared/db/neo4j.ts` — getNeo4jDriver() singleton
- `src/shared/utils/haversine.ts` — haversineKm utility import path
- `src/app.ts` — full composition root showing current wiring and opts patterns
- `src/adapters/services/bcrypt.adapter.ts` — canonical adapter pattern (implements port interface)
- `src/application/errors/domain.error.ts` — DomainError(message, code, statusCode) argument order
- `tests/integration/swipe.test.ts`, `credits.test.ts`, `chat.test.ts`, `recommendation.test.ts` — test expectations to preserve
- `.planning/phases/11-core-modules-migration/11-RESEARCH.md` — established migration patterns and pitfalls
- `.planning/STATE.md` — decisions log (ICreditService, IChatService, IRecommendationService patterns)

---

## Metadata

**Confidence breakdown:**
- SwipeRepository adapter design: HIGH — source files read directly; all Prisma queries traced
- CreditsRepository adapter design: HIGH — full transaction logic traced; DomainError pattern established
- ChatRepository adapter design: HIGH — all 8 methods traced from chat.repository.ts; IChatRepository interface matched
- Neo4jAdapter design: HIGH — RecommendationRepository source read; IRecommendationRepository interface matched
- Use-case business logic: HIGH — directly derived from existing service methods; no new logic invented
- IChatPort / IChatPort-in-ports design: HIGH — consistent with IHashPort/ITokenPort established pattern
- IRecommendationRepository FitScoreInput compatibility: MEDIUM — relies on TypeScript structural typing; verified shapes are compatible but not compiled in this session
- Test count (41): MEDIUM — taken from STATE.md; should be verified by running the suite before starting

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (stable refactor; no external API changes expected)
