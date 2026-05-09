---
phase: 12-swipe-credits-recommendation-chat-migration
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/application/ports/chat.port.ts
  - src/adapters/repositories/chat.repository.ts
  - src/application/use-cases/chat/create-or-get-chat.use-case.ts
  - src/application/use-cases/chat/send-message.use-case.ts
  - src/application/use-cases/chat/verify-participant.use-case.ts
  - src/application/use-cases/chat/get-messages.use-case.ts
  - src/application/use-cases/chat/list-chats.use-case.ts
  - src/adapters/controllers/chat.controller.ts
  - src/infrastructure/http/routes/chat.routes.ts
  - src/adapters/services/neo4j.adapter.ts
  - src/application/use-cases/credits/credits.constants.ts
  - src/adapters/repositories/credit.repository.ts
  - src/application/use-cases/credits/unlock-candidate.use-case.ts
  - src/application/use-cases/credits/grant-credits.use-case.ts
  - src/adapters/controllers/credits.controller.ts
  - src/infrastructure/http/routes/credits.routes.ts
  - src/adapters/repositories/swipe.repository.ts
  - src/application/use-cases/swipe/record-swipe.use-case.ts
  - src/application/use-cases/swipe/get-feed.use-case.ts
  - src/application/use-cases/swipe/get-ranking.use-case.ts
  - src/adapters/controllers/swipe.controller.ts
  - src/infrastructure/http/routes/swipe.routes.ts
  - src/app.ts
  - src/modules/chat/chat.service.ts
  - src/modules/credits/credits.service.ts
  - src/modules/credits/credits.routes.ts
  - tests/unit/chat.service.test.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

This phase migrates Swipe, Credits, Recommendation, and Chat modules from the legacy `modules/` structure into Clean Architecture use-cases, repositories, and controllers under `adapters/` and `application/`. The overall architecture is solid — dependency inversion is applied consistently, Zod input validation is present on all endpoints, Prisma transactions protect credit and unlock operations, and the WebSocket flow correctly buffers messages during the participant check.

Two critical bugs were found: a broken error-remapping block in `CreditService.unlockCandidate` that silently swallows domain errors, and an off-by-one in `GetMessagesUseCase` that over-fetches rows and can corrupt pagination. Four warnings cover authorization gaps, duplicate business logic, and a missing null guard. Three info items flag dead code and naming issues.

## Critical Issues

### CR-01: Dead error-remapping in CreditService never catches DomainError from executeUnlock

**File:** `src/modules/credits/credits.service.ts:36-43`

**Issue:** The try/catch around `repo.executeUnlock` attempts to remap specific error conditions, but the conditions will never match. `executeUnlock` (in `CreditRepository`) throws `DomainError` instances with messages like `'Insufficient credits'` and `'Company not found'`. The catch block checks `err instanceof Error && err.message === 'INSUFFICIENT_CREDITS'` (the Prisma error code string, not the human-readable message) and `err.message === 'COMPANY_NOT_FOUND'`. Neither string matches what the repository actually throws. As a result, `DomainError` escapes the catch block entirely and reaches the global `errorHandler`, which may not handle it correctly (since `errorHandler` likely only checks for `AppError`). The P2002 remapping is also dead: `executeUnlock` already converts P2002 into `DomainError('Already unlocked')` inside the transaction, so `Prisma.PrismaClientKnownRequestError` never surfaces to the caller.

**Fix:** Either propagate `DomainError` directly (remove the catch block), or catch `DomainError` by instance:
```typescript
import { DomainError } from '../../application/errors/domain.error'

try {
  unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)
} catch (err) {
  if (err instanceof DomainError) {
    // Re-throw as AppError to stay consistent with the module's error type
    throw new AppError(err.message, err.statusCode, err.code)
  }
  throw err
}
```
Or, simpler: remove the catch entirely and let `DomainError` propagate — the `errorHandler` should be updated to handle both `AppError` and `DomainError`.

---

### CR-02: GetMessagesUseCase passes limit+1 to findMessages, causing off-by-one over-fetch and incorrect pagination

**File:** `src/application/use-cases/chat/get-messages.use-case.ts:29`

**Issue:** `GetMessagesUseCase.execute` calls `this.repo.findMessages(chatId, cursor, limit + 1)`. However, `ChatRepository.findMessages` already adds 1 to the received limit internally (`take: limit + 1`, line 56 of `chat.repository.ts`). The effective DB query therefore fetches `limit + 2` rows. The subsequent `hasNext` check (`messages.length > limit`) compares against the original `limit`, so when there are exactly `limit + 1` real messages in the chat, the use case reports `hasNext = true` (incorrectly), truncates the page to `limit` items, and the last real message is never surfaced to the client on that page. Contrast with `ChatService.getMessages` (the legacy path), which correctly passes `limit` without pre-incrementing.

**Fix:** Pass `limit` (not `limit + 1`) to the repository, which is consistent with how `ChatService.getMessages` works and how `GetFeedUseCase` uses `SwipeRepository.findFeedJobs`:
```typescript
// line 29 — was: limit + 1
const messages = await this.repo.findMessages(chatId, cursor, limit)
const hasNext = messages.length > limit
const data = hasNext ? messages.slice(0, limit) : messages
```

---

## Warnings

### WR-01: Duplicate unlock route registered — modules/credits/credits.routes.ts is a ghost route file

**File:** `src/modules/credits/credits.routes.ts:1-57` and `src/infrastructure/http/routes/credits.routes.ts:1-12`

**Issue:** Both files export a function named `creditsJobRoutes` that registers `POST /:jobId/candidates/:candidateId/unlock`. `app.ts` only imports and registers the infrastructure version. The `modules/credits/credits.routes.ts` file is never imported in `app.ts` and therefore dead. However, it contains non-trivial logic (haversine enrichment, profile fetch) that diverges from the infrastructure version. A developer maintaining the module file believing it is in use would introduce untested changes that have no effect at runtime.

**Fix:** Delete `src/modules/credits/credits.routes.ts`. All traffic now flows through `src/infrastructure/http/routes/credits.routes.ts` → `CreditsController`. If the module-level file is intentionally kept as a migration artifact, add a top-level comment: `// DEPRECATED — not registered in app.ts, superceded by src/infrastructure/http/routes/credits.routes.ts`.

---

### WR-02: Duplicate send-message business logic between SendMessageUseCase and ChatService — drift risk

**File:** `src/application/use-cases/chat/send-message.use-case.ts:1-27` and `src/modules/chat/chat.service.ts:19-47`

**Issue:** The recruiter-must-initiate rule (check `countRecruiterMessages`, forbid candidate first message) is implemented identically in two places: `SendMessageUseCase.execute` and `ChatService.sendMessage`. At runtime, `chat.routes.ts` uses `service.sendMessage` (the `ChatService` path), not `SendMessageUseCase`. `SendMessageUseCase` has no registered consumer. If the business rule changes, only one of the two implementations is likely to be updated, leading to silent divergence.

**Fix:** Route the `ChatService.sendMessage` implementation through `SendMessageUseCase` (inject the use case, delegate to it), or delete `SendMessageUseCase` if the service layer is the authoritative implementation. Same applies to `VerifyParticipantUseCase`, `CreateOrGetChatUseCase`, `ListChatsUseCase`, and `GetMessagesUseCase` — verify each has a live call path or remove it.

---

### WR-03: ChatController instantiates ChatRepository directly — violates Clean Architecture layer rule

**File:** `src/adapters/controllers/chat.controller.ts:19` and `35`

**Issue:** `ChatController.listChats` and `ChatController.getMessages` each construct `new ChatRepository()` and `new GetMessagesUseCase(new ChatRepository())` inline. The project's architecture rule is `routes → service → repository`; controllers (adapters layer) must not directly instantiate repositories. This bypasses dependency injection, makes the controller untestable without hitting a real DB, and creates a second construction path parallel to the `ChatService` injected through `chatRoutes`'s `opts.service`.

**Fix:** Inject the repository (or use case) through the controller constructor, matching the pattern used by `CreditsController` and `SwipeController`:
```typescript
export class ChatController {
  constructor(private readonly repo: IChatRepository) {}

  async listChats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = new ListChatsUseCase(this.repo)
    // ...
  }
}
```
Then construct in the route factory: `const ctrl = new ChatController(chatRepo)`.

---

### WR-04: GetRankingUseCase passes null lat/lng to haversineKm without guarding the return value

**File:** `src/application/use-cases/swipe/get-ranking.use-case.ts:76-81`

**Issue:** `haversineKm` accepts `number | null` for all four coordinates and returns `number | null` (returns `null` when any coordinate is null). `GetRankingUseCase` calls `haversineKm(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng)` and assigns the result to `distanceKm` without handling the `null` case. The TypeScript return type of the ranking item therefore has `distanceKm: number` but at runtime it may be `null`. API consumers that expect a number will receive `null` silently. The same pattern in `CreditsController` and `credits.routes.ts` explicitly handles the null case with a conditional: `candidateProfile && job ? haversineKm(...) : null`.

**Fix:** Propagate the nullability explicitly in the return type and document it:
```typescript
const distanceKm = haversineKm(
  swipe.candidate.lat,
  swipe.candidate.lng,
  job.lat,
  job.lng,
) // returns number | null — lat/lng may be null per schema
```
The TypeScript compiler will flag this automatically if the return object type is declared explicitly instead of inferred.

---

## Info

### IN-01: IChatPort interface is narrower than IChatService — redundant abstraction

**File:** `src/application/ports/chat.port.ts:1-10`

**Issue:** `IChatPort` defines only `createOrGetChat`. `IChatService` (the shared interface) also defines `sendMessage`, `verifyParticipant`, `getMessages`, and `listChats`. `UnlockCandidateUseCase` and `RecordSwipeUseCase` depend on `IChatPort`, which correctly limits their surface area to only `createOrGetChat`. However, `ChatService` implements `IChatService` (not `IChatPort`), so there is an implicit structural compatibility rather than an explicit `implements IChatPort` declaration. This is benign but makes the port's purpose less obvious. Consider annotating `ChatService` with `implements IChatPort` to make the conformance explicit, or merge `IChatPort` into `IChatService` with a note that the use cases only require `createOrGetChat`.

---

### IN-02: credits.constants.ts default plan fallback silently uses FREE cost

**File:** `src/application/use-cases/credits/unlock-candidate.use-case.ts:39` and `src/modules/credits/credits.service.ts:28`

**Issue:** `UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']` silently falls back to the FREE cost when the company's plan string is not in the constants map. If a new plan (e.g., `'ENTERPRISE'`) is added to the DB schema without updating `credits.constants.ts`, it will be charged at the FREE rate (2 credits) with no error or log, causing incorrect billing.

**Fix:** Add explicit logging or throw on unknown plan strings:
```typescript
const cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan]
if (cost === undefined) {
  // Unknown plan — log and fall back, or throw to surface the configuration gap
  console.warn(`Unknown company plan: ${recruiter.company.plan}, defaulting to FREE cost`)
}
const finalCost = cost ?? UNLOCK_COST_BY_PLAN['FREE']
```

---

### IN-03: Neo4jAdapter is a pass-through — adds no value over direct RecommendationRepository usage

**File:** `src/adapters/services/neo4j.adapter.ts:1-23`

**Issue:** `Neo4jAdapter` wraps `RecommendationRepository` by constructing it in its constructor and delegating all method calls with zero transformation. It exists to bridge `IRecommendationRepository` and `RecommendationRepository` (which implements `IRecommendationService`). If the two interfaces are structurally compatible, the adapter can be replaced by having `RecommendationRepository` directly implement `IRecommendationRepository`, or by using `RecommendationRepository` directly at the composition root. The extra indirection adds a class with no logic to maintain.

**Fix:** Check whether `RecommendationRepository` can implement `IRecommendationRepository` directly. If yes, remove the adapter and update `app.ts` to construct `new RecommendationRepository(getNeo4jDriver())` directly as the `neo4jAdapter` variable.

---

_Reviewed: 2026-05-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
