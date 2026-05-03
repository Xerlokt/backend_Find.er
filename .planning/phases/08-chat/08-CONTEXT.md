# Phase 8: Chat - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver real-time WebSocket chat between candidate and recruiter, automatically created when a LIKE swipe (match) or credit unlock occurs. Message history persists to PostgreSQL and is retrievable via REST. Chat lifecycle (creation, connection, history) is fully implemented; purchase/subscription flows and push notifications are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Auto-Creation Integration (CHAT-02)
- **D-01:** Chat is auto-created at the service layer via an `IChatService` interface injected at the composition root (`src/app.ts`) — same pattern as `IRecommendationService` (Phase 6). `SwipeService` receives an `IChatService` dependency for LIKE events; `CreditService` receives it for unlock events. Modules do NOT import each other directly (ARCH-04 preserved).
- **D-02:** Creation is idempotent: if a Chat already exists for the `(candidateId, companyId, jobId)` triplet, the existing chat is returned rather than creating a duplicate. `@@unique([candidateId, companyId, jobId])` added to the `Chat` Prisma model via migration.
- **D-03:** `POST /swipes` (LIKE direction) and `POST /jobs/:jobId/candidates/:candidateId/unlock` responses **include the `chatId`** of the created (or existing) chat. Client can connect to WebSocket immediately without an extra GET /chats call.

### Recruiter-First Rule (CHAT-02 / access control)
- **D-04:** Only the recruiter (job owner) can send the **first message** in a chat. Backend enforces this: if the candidate attempts to send a message before any recruiter message exists in the chat, the API returns **403 `RECRUITER_MUST_INITIATE`**. The check is in `ChatService.sendMessage` — query for existing recruiter messages before persisting.
- **D-05:** After the recruiter has sent at least one message, both participants can send freely (no further ordering constraint).

### Chat Room Uniqueness
- **D-06:** One chat room per `(candidateId, companyId, jobId)` regardless of how it was initiated (MATCH vs CREDIT). The `initiatedBy` field records the first trigger (`ChatInitiator.MATCH` or `ChatInitiator.CREDIT`). If the same pair has both a LIKE and an unlock, the room created first (MATCH) is reused — no second room created.
- **D-07:** Migration adds `@@unique([candidateId, companyId, jobId])` to the `Chat` model.

### WebSocket Authentication (CHAT-01)
- **D-08:** WebSocket upgrade route (`GET /chats/:chatId/ws`) uses the existing `authenticate` preHandler hook — same Fastify JWT hook already used on all REST routes. Token is sent in `Authorization: Bearer <token>` header (not a query param). Token does NOT appear in server logs or URL history.
- **D-09:** On connection, server verifies the requesting user is a participant of the chat (either the candidate or the recruiter who owns the job). Non-participants are rejected with 403.

### WebSocket Broadcast
- **D-10:** In-memory `Map<chatId, Set<WebSocket>>` tracks active connections per chat room. When a message is persisted to DB, it is broadcast to all connections in that chat. Standard monolith pattern — no external broker needed for v1.
- **D-11:** Message persistence happens before broadcast: DB write first, then push to connected sockets. If the recipient is offline, the message is still persisted and retrievable via CHAT-04.

### REST Endpoints (CHAT-04)
- **D-12:** `GET /chats` — lists all chats the authenticated user participates in (candidate sees their chats; recruiter sees chats for their jobs). Returns `chatId`, `jobId`, `initiatedBy`, `isActive`, `createdAt`, and the other participant's display name.
- **D-13:** `GET /chats/:chatId/messages` — returns paginated message history using **cursor-based pagination** (same `cursor` + `limit` pattern as `/jobs/feed`). Response: `{ data: Message[], nextCursor: string | null }`. Access: participants only (403 for non-participants).
- **D-14:** `GET /chats/:chatId/messages` also updates `readAt` on messages sent by the *other* participant that have `readAt = null` — mark-as-read on fetch.

### Module Structure
- **D-15:** New module at `src/modules/chat/` — `chat.routes.ts`, `chat.service.ts`, `chat.repository.ts`. Interface at `src/shared/interfaces/chat.interface.ts` (`IChatService`). Registered in `app.ts` under `/chats` prefix.
- **D-16:** `IChatService` exposes at minimum: `createOrGetChat(candidateId, companyId, jobId, initiator)` (used by swipe + credits modules) and `sendMessage(chatId, senderId, content)` (used by WS handler). Repository handles all Prisma calls.

### Claude's Discretion
- WS endpoint path: `GET /chats/:chatId/ws` (upgrade endpoint)
- Exact shape of `GET /chats` response fields beyond the minimum listed above
- Whether the WS handler lives in `chat.routes.ts` or a dedicated `chat.gateway.ts`
- Error code for double-first-message violation (403 `RECRUITER_MUST_INITIATE` suggested above)
- Whether `sendMessage` via WS and via a potential REST fallback share the same service method

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Chat — CHAT-01 through CHAT-04 (all Phase 8)
- `.planning/REQUIREMENTS.md` §Architecture — ARCH-01, ARCH-04 (module isolation — chat module must not import from swipe or credits modules)
- `.planning/REQUIREMENTS.md` §Security — SEC-02 (Zod validation on all endpoints, including WS message payload)

### Existing Infrastructure
- `prisma/schema.prisma` — `Chat` model (candidateId, companyId, jobId, initiatedBy, isActive), `Message` model (chatId, senderId, content, readAt), `ChatInitiator` enum (MATCH, CREDIT). **Migration needed only** for `@@unique([candidateId, companyId, jobId])` on Chat.
- `src/app.ts` — Composition root. `IChatService` injected into `SwipeService` and `CreditService` here (same pattern as `IRecommendationService` in Phase 6).
- `src/shared/interfaces/recommendation.interface.ts` — Reference implementation for the `IChatService` interface pattern (ARCH-04).
- `src/shared/hooks/authenticate.ts` — JWT preHandler reused for WS upgrade route.
- `src/shared/hooks/requireRole.ts` — Role guard for chat routes (CANDIDATE and RECRUITER can access; ADMIN excluded or added at Claude's discretion).
- `src/modules/swipe/swipe.service.ts` — `recordSwipe`: must call `IChatService.createOrGetChat` when `direction === LIKE`. Return value updated to include `chatId`.
- `src/modules/credits/credits.service.ts` — `unlockCandidate`: must call `IChatService.createOrGetChat` after successful unlock. Return value updated to include `chatId`.
- `src/shared/errors/AppError.ts` — Error class for all throws (e.g., `RECRUITER_MUST_INITIATE`, `NOT_PARTICIPANT`).

### Prior Phase Context
- `.planning/phases/07-credits/07-CONTEXT.md` — D-05 (unlock response shape), D-10 (atomic transaction pattern), Specifics (Phase 8 hook note: unlock service must return enough context for chat module to react).
- `.planning/phases/05-swipe/05-CONTEXT.md` — D-03 (swipe response shape), D-01/D-02 (LIKE/DISLIKE swipe record).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/hooks/authenticate.ts`: Direct reuse as preHandler on all chat routes and WS upgrade endpoint.
- `src/shared/interfaces/recommendation.interface.ts`: Template for `IChatService` interface — same injection pattern.
- `tests/helpers/factories.ts`: `createUser`, `createJob`, `createCompany`, `createSwipe` factories available. Need `createChat` and `createMessage` factories for Phase 8 tests.
- Cursor pagination pattern (`cursor` + `limit` → `{ data, nextCursor }`) established in `SwipeService.getFeed` — replicate for `GET /chats/:chatId/messages`.

### Established Patterns
- Composition root injection: `app.ts` instantiates concrete classes and injects via constructor — `new ChatService(chatRepo)`, then pass to `SwipeService` and `CreditService`.
- `IChatService` interface at `src/shared/interfaces/chat.interface.ts` — keeps chat module boundary clean (ARCH-04).
- Error throwing: `throw new AppError(message, statusCode, code)` — use for 403/404 in ChatService.
- Ownership checks: load participant profile by userId, compare to chat's `candidateId` or job's `recruiterId` — same pattern as ranking and unlock ownership checks.
- `@fastify/websocket` route registration: `fastify.get('/chats/:chatId/ws', { websocket: true, preHandler: [authenticate] }, handler)`.

### Integration Points
- `src/app.ts` — register `chatRoutes` under `/chats` prefix; inject `IChatService` into `SwipeService` and `CreditService` constructors.
- `src/modules/swipe/swipe.routes.ts` — update `SwipeService` instantiation to accept `IChatService`.
- `src/modules/credits/credits.routes.ts` — update `CreditService` instantiation to accept `IChatService`.
- `prisma/schema.prisma` — one migration: add `@@unique([candidateId, companyId, jobId])` to `Chat`.

</code_context>

<specifics>
## Specific Ideas

- The "recruiter must send first" check in `ChatService.sendMessage`: query `Message` table for any message in `chatId` where `sender.role = RECRUITER` (or more precisely: where `senderId` matches the recruiter associated with the chat's job). If `count === 0` and the current sender is the candidate → throw 403 `RECRUITER_MUST_INITIATE`.
- `createOrGetChat` signature: `createOrGetChat(candidateId: string, companyId: string, jobId: string, initiator: ChatInitiator): Promise<{ chatId: string }>` — returns just the `chatId` so the calling service can include it in its response without exposing the full Chat model.
- In-memory connection store: `const connections = new Map<string, Set<WebSocket>>()` — module-level singleton in the chat gateway. Connections added on WS open, removed on close. Broadcast iterates the Set for the chatId.

</specifics>

<deferred>
## Deferred Ideas

- **Push notifications** when a message is received while offline — v2. Requires FCM/APNs integration.
- **Read receipts broadcast via WS** — currently `readAt` is updated on REST fetch only. Real-time "seen" indicator is a v2 concern.
- **Chat expiry** (`Chat.expiresAt` field exists in schema) — no expiry logic in Phase 8. Can be activated in v2 if needed.
- **Admin access to chats** — not required by any CHAT requirement; deferred to v2 if needed for moderation.
- **Typing indicators** — stateless WS only; no typing event protocol in v1.

</deferred>

---

*Phase: 08-chat*
*Context gathered: 2026-05-03*
