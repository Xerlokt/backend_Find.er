# Phase 8: Chat - Research

**Researched:** 2026-05-03
**Domain:** WebSocket real-time messaging, Fastify 5, @fastify/websocket v11, Prisma chat models
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Chat auto-created at the service layer via `IChatService` interface injected at the composition root (`src/app.ts`) — same pattern as `IRecommendationService`. `SwipeService` receives `IChatService` for LIKE events; `CreditService` receives it for unlock events. Modules do NOT import each other directly (ARCH-04).
- **D-02:** Creation is idempotent: `createOrGetChat(candidateId, companyId, jobId, initiator)` returns the existing chat if the `(candidateId, companyId, jobId)` triplet already exists.
- **D-03:** `POST /swipes` (LIKE) and `POST /jobs/:jobId/candidates/:candidateId/unlock` responses include `chatId`.
- **D-04:** Only the recruiter (job owner) can send the first message. Backend enforces this: candidate attempting to send before any recruiter message → 403 `RECRUITER_MUST_INITIATE`.
- **D-05:** After recruiter's first message, both participants send freely.
- **D-06:** One chat room per `(candidateId, companyId, jobId)` regardless of initiator. `initiatedBy` records first trigger; MATCH room is reused if both LIKE and unlock happen.
- **D-07:** Migration adds `@@unique([candidateId, companyId, jobId])` to the `Chat` model.
- **D-08:** WebSocket upgrade route `GET /chats/:chatId/ws` uses existing `authenticate` preHandler. Token in `Authorization: Bearer <token>` header — NOT a query param.
- **D-09:** On connection, server verifies requesting user is a participant (candidateId or job's recruiterId). Non-participants rejected with 403.
- **D-10:** In-memory `Map<chatId, Set<WebSocket>>` tracks active connections per chat room. Broadcast: persist first, then push to Set. Module-level singleton.
- **D-11:** Message persistence before broadcast. Offline recipient: message persists, retrievable via CHAT-04.
- **D-12:** `GET /chats` — lists chats the authenticated user participates in. Returns `chatId`, `jobId`, `initiatedBy`, `isActive`, `createdAt`, other participant's display name.
- **D-13:** `GET /chats/:chatId/messages` — cursor-based pagination (`cursor` + `limit` → `{ data, nextCursor }`). Participants only (403 non-participants).
- **D-14:** `GET /chats/:chatId/messages` marks `readAt` on messages from the other participant where `readAt = null`.
- **D-15:** Module at `src/modules/chat/` — `chat.routes.ts`, `chat.service.ts`, `chat.repository.ts`. Interface at `src/shared/interfaces/chat.interface.ts`. Registered in `app.ts` under `/chats` prefix.
- **D-16:** `IChatService` exposes: `createOrGetChat(candidateId, companyId, jobId, initiator)` and `sendMessage(chatId, senderId, content)`.

### Claude's Discretion
- WS endpoint path: `GET /chats/:chatId/ws`
- Exact shape of `GET /chats` response fields beyond the minimum listed
- Whether WS handler lives in `chat.routes.ts` or a dedicated `chat.gateway.ts`
- Error code for double-first-message violation (403 `RECRUITER_MUST_INITIATE` suggested)
- Whether `sendMessage` via WS and via a potential REST fallback share the same service method

### Deferred Ideas (OUT OF SCOPE)
- Push notifications when a message is received while offline (v2 — FCM/APNs)
- Read receipts broadcast via WS (v2 — `readAt` updated on REST fetch only in v1)
- Chat expiry (`Chat.expiresAt` field exists but no logic in Phase 8)
- Admin access to chats
- Typing indicators
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | Chat em tempo real via WebSocket entre candidato e recrutador | @fastify/websocket v11 plugin registration, `{ websocket: true }` route option, preHandler auth hook, in-memory connection store |
| CHAT-02 | Chat criado automaticamente quando candidato dá LIKE ou empresa desbloqueia candidato | `IChatService.createOrGetChat` injected into SwipeService + CreditService at composition root; `@@unique` Prisma migration; `upsert`-or-find idempotent pattern |
| CHAT-03 | Mensagens persistidas no PostgreSQL | `ChatRepository.createMessage` via Prisma; persist-before-broadcast (D-11); Zod validation on WS payload |
| CHAT-04 | Histórico de mensagens carregado ao abrir chat | `GET /chats/:chatId/messages` with cursor-based pagination; `GET /chats` list endpoint; mark-as-read on fetch (D-14) |
</phase_requirements>

---

## Summary

Phase 8 delivers real-time WebSocket messaging on top of seven phases of existing infrastructure. The core challenge is threefold: integrating `@fastify/websocket` v11 (already in `package.json`) with Fastify 5 in a way that respects existing preHandler hooks for authentication; wiring `IChatService` into two already-complete modules (`SwipeService` and `CreditService`) without breaking ARCH-04 isolation; and handling WebSocket testing in a Jest environment where supertest cannot open WebSocket connections.

The good news: `@fastify/websocket` v11 (installed at 11.2.0) is explicitly compatible with Fastify 5, and its `preHandler` hook runs through the full Fastify pipeline before upgrading the connection, so the existing `authenticate` hook works unchanged. The plugin exposes `app.injectWS(path, { headers })` which allows passing `Authorization` headers in tests — no external WS test client library needed. The `ws` package (v8.20.0) is already installed as a transitive dependency of `@fastify/websocket`.

`@types/ws` is **NOT** currently installed as a dev dependency. The handler signature in @fastify/websocket types already imports from `ws` directly (`import * as WebSocket from 'ws'`), so TypeScript consumers need `@types/ws` installed to resolve the `WebSocket.WebSocket` type.

**Primary recommendation:** Register `@fastify/websocket` plugin in `buildApp` before chat routes, use `preHandler: [authenticate]` on the WS upgrade route (participant check in the handler body after JWT verify), persist message with Prisma inside the `socket.on('message')` callback, then broadcast to the in-memory Map. Use `app.injectWS` for integration tests with `Authorization` header injection.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WebSocket connection management | API / Backend (Fastify server) | — | HTTP upgrade → WS happens at server level; no browser or CDN involvement |
| Real-time message delivery | API / Backend (in-memory store) | — | In-memory Map<chatId, Set<WebSocket>> on the Node process; standard monolith pattern |
| Message persistence | Database / Storage (PostgreSQL via Prisma) | API / Backend (trigger) | Messages written to DB first; broadcast second (D-11) |
| Chat auto-creation | API / Backend (service layer) | — | Called from SwipeService and CreditService at composition root |
| Auth on WS upgrade | API / Backend (preHandler hook) | — | JWT verify runs in preHandler before upgrade; same hook as REST |
| Message history REST | API / Backend | Database / Storage | `GET /chats/:chatId/messages` — Prisma cursor query |
| Input validation (WS payload) | API / Backend | — | Zod parse inside `socket.on('message')` handler; SEC-02 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/websocket | 11.2.0 (installed) | WebSocket support for Fastify | Official Fastify plugin; Fastify-5-compatible; exposes `injectWS` for testing |
| ws | 8.20.0 (installed as transitive dep) | Underlying WS implementation | Used internally by @fastify/websocket |
| zod | 4.3.6 (installed) | WS message payload validation | Already in use for all REST routes; SEC-02 |
| @prisma/client | 7.7.0 (installed) | Chat and Message persistence | Already driving all DB access |

### Supporting (need to install)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/ws | ^8.5.x | TypeScript types for `WebSocket.WebSocket` | Required: @fastify/websocket types reference `ws` directly; compilation will fail without this |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory Map | Redis pub/sub | Redis adds external dependency; in-memory is correct for v1 monolith (D-10) |
| @fastify/websocket | socket.io | socket.io adds polling fallback and room abstraction; overkill for this use case |
| injectWS testing | `ws` package + real HTTP server | injectWS is simpler and avoids opening real TCP ports in tests |

**Installation:**
```bash
npm install --save-dev @types/ws
```

**Version verification:** `@fastify/websocket@11.2.0` and `ws@8.20.0` are already installed. `@types/ws` is absent — confirmed via `node_modules` inspection. [VERIFIED: node_modules]

---

## Architecture Patterns

### System Architecture Diagram

```
Client (Candidate or Recruiter)
      │
      │  HTTP/WS upgrade: GET /chats/:chatId/ws
      │  Authorization: Bearer <token>
      ▼
┌─────────────────────────────────────┐
│  Fastify 5 server                   │
│  ┌───────────────────────────────┐  │
│  │  preHandler: authenticate     │  │ ← JWT verify (existing hook)
│  │  preHandler: (participant     │  │ ← participant check in handler
│  │               check in body)  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  @fastify/websocket handler   │  │
│  │  (socket, request) =>         │  │
│  │    socket.on('message', msg)  │  │
│  └──────────────┬────────────────┘  │
└─────────────────│───────────────────┘
                  │
         ┌────────▼────────┐
         │  ChatService    │
         │  .sendMessage() │
         └────────┬────────┘
                  │
     ┌────────────▼────────────────┐
     │   ChatRepository            │
     │   prisma.message.create()   │
     └────────────┬────────────────┘
                  │  message persisted
                  │
     ┌────────────▼──────────────────────┐
     │  In-memory connection store       │
     │  Map<chatId, Set<WebSocket>>      │
     │  broadcast to all sockets in Set  │
     └───────────────────────────────────┘
```

```
LIKE swipe / credit unlock flow:

POST /swipes or POST /jobs/:jobId/candidates/:candidateId/unlock
      │
      ▼
SwipeService.recordSwipe()         CreditService.unlockCandidate()
      │                                    │
      │ direction === LIKE                 │ unlock success
      ▼                                    ▼
IChatService.createOrGetChat(candidateId, companyId, jobId, initiator)
      │
      ▼
ChatRepository: prisma.chat.upsert (@@unique guard)
      │
      ▼
returns { chatId }  ←── included in POST response (D-03)
```

### Recommended Project Structure

```
src/
├── modules/
│   └── chat/
│       ├── chat.routes.ts        # REST routes + WS upgrade route registration
│       ├── chat.gateway.ts       # (optional) WS handler + in-memory connection store
│       ├── chat.service.ts       # ChatService (implements IChatService)
│       └── chat.repository.ts   # All Prisma calls for Chat + Message
├── shared/
│   └── interfaces/
│       └── chat.interface.ts    # IChatService interface (ARCH-04)
tests/
├── unit/
│   └── chat.service.test.ts    # Unit tests for ChatService (no DB)
└── integration/
    └── chat.test.ts            # Integration tests (buildApp + injectWS + supertest)
```

### Pattern 1: @fastify/websocket Plugin Registration

**What:** Register the plugin in `buildApp` before chat routes are registered.
**When to use:** Required once globally in `app.ts`.

```typescript
// Source: @fastify/websocket README + node_modules/@fastify/websocket/index.js (VERIFIED)
import fastifyWebsocket from '@fastify/websocket'

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // ... existing plugins ...
  await app.register(fastifyWebsocket)  // Must be before routes that use { websocket: true }
  // ... register chatRoutes ...
}
```

**Critical:** `@fastify/websocket` must be registered before any route that uses `{ websocket: true }`. If registered after, Fastify throws at route definition time.

### Pattern 2: WebSocket Route with preHandler Auth

**What:** WS upgrade route using existing `authenticate` hook.
**When to use:** `GET /chats/:chatId/ws` — the upgrade endpoint.

```typescript
// Source: @fastify/websocket types/index.d.ts + README (VERIFIED)
import type { WebSocket } from '@fastify/websocket'
import { authenticate } from '../../shared/hooks/authenticate'

// In chat.routes.ts (or chat.gateway.ts)
app.get('/:chatId/ws', {
  websocket: true,
  preHandler: [authenticate],  // JWT verify runs BEFORE upgrade
}, async (socket: WebSocket, request) => {
  const { chatId } = request.params as { chatId: string }
  const userId = request.user.id  // Available because authenticate ran

  // Participant check — must happen synchronously before any await if attaching event listeners
  const chat = await chatService.getChat(chatId)
  if (!chat) { socket.close(1008, 'Not found'); return }
  const isParticipant = chat.candidateId === candidateProfileId
    || chat.job.recruiterId === recruiterProfileId
  if (!isParticipant) { socket.close(1008, 'Forbidden'); return }

  // Register connection — BEFORE any await to avoid dropped messages
  addConnection(chatId, socket)

  socket.on('message', async (rawData) => {
    const payload = MessageSchema.parse(JSON.parse(rawData.toString()))
    const message = await chatService.sendMessage(chatId, userId, payload.content)
    broadcast(chatId, message)
  })

  socket.on('close', () => {
    removeConnection(chatId, socket)
  })

  socket.on('error', (err) => {
    removeConnection(chatId, socket)
  })
})
```

**Critical ordering note from @fastify/websocket source:** The documentation warns: "if you want to do any async work in your websocket handler, ensure you attach any `on('message')` handlers before completing the async work." Attach `socket.on('message', ...)` synchronously first, then `await` anything — or messages arriving immediately after upgrade may be dropped. The participant check in the example above can fetch the chat, but `socket.on('message', ...)` must be registered in the same synchronous turn.

Revised safe pattern:
```typescript
app.get('/:chatId/ws', { websocket: true, preHandler: [authenticate] },
  async (socket: WebSocket, request) => {
    // Attach handler FIRST (synchronous)
    const pending: Buffer[] = []
    socket.on('message', (data) => pending.push(data as Buffer))

    // Then do async auth/participant check
    const isParticipant = await chatService.verifyParticipant(chatId, request.user.id)
    if (!isParticipant) { socket.close(1008, 'Forbidden'); return }

    // Now re-attach real handler + drain pending
    socket.removeAllListeners('message')
    socket.on('message', handleMessage)
    for (const data of pending) handleMessage(data)

    addConnection(chatId, socket)
    socket.on('close', () => removeConnection(chatId, socket))
  }
)
```

### Pattern 3: In-Memory Connection Store

**What:** Module-level singleton `Map<chatId, Set<WebSocket>>`.
**When to use:** Always. Single-process monolith pattern (D-10).

```typescript
// Source: CONTEXT.md D-10, ASSUMED pattern (standard WebSocket broadcast pattern)
import type { WebSocket } from '@fastify/websocket'

const connections = new Map<string, Set<WebSocket>>()

export function addConnection(chatId: string, socket: WebSocket): void {
  if (!connections.has(chatId)) {
    connections.set(chatId, new Set())
  }
  connections.get(chatId)!.add(socket)
}

export function removeConnection(chatId: string, socket: WebSocket): void {
  const room = connections.get(chatId)
  if (room) {
    room.delete(socket)
    if (room.size === 0) connections.delete(chatId)  // Prevent memory leak
  }
}

export function broadcast(chatId: string, message: object): void {
  const room = connections.get(chatId)
  if (!room) return
  const json = JSON.stringify(message)
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) {
      socket.send(json)
    }
  }
}
```

**Memory leak prevention:** Delete the Set from the Map when it becomes empty (shown above). Otherwise chatIds accumulate indefinitely.

### Pattern 4: createOrGetChat (Idempotent Room Creation)

**What:** Prisma upsert pattern for `@@unique([candidateId, companyId, jobId])`.
**When to use:** Called from SwipeService (LIKE) and CreditService (unlock).

```typescript
// Source: CONTEXT.md D-02, Prisma upsert docs (ASSUMED idiomatic pattern for @@unique)
async createOrGetChat(
  candidateId: string,
  companyId: string,
  jobId: string,
  initiator: ChatInitiator,
): Promise<{ chatId: string }> {
  const chat = await prisma.chat.upsert({
    where: { candidateId_companyId_jobId: { candidateId, companyId, jobId } },
    create: { candidateId, companyId, jobId, initiatedBy: initiator, isActive: true },
    update: {},  // No-op if exists — initiatedBy stays as first trigger (D-06)
  })
  return { chatId: chat.id }
}
```

**Note:** Prisma auto-generates the compound unique field name as `candidateId_companyId_jobId` (fields joined by `_`). Verify after running `prisma generate` post-migration.

### Pattern 5: Cursor-Based Pagination for Messages

**What:** Replicate the `getFeed` cursor pattern from SwipeRepository for message history.
**When to use:** `GET /chats/:chatId/messages`.

```typescript
// Source: src/modules/swipe/swipe.repository.ts findFeedJobs (VERIFIED - codebase)
async findMessages(
  chatId: string,
  cursor: string | undefined,
  limit: number,
): Promise<Message[]> {
  return prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },  // Newest first (most recent message history)
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
}
// Service extracts nextCursor: data.length > limit ? data[limit - 1].id : null
```

**Note:** The cursor is the `Message.id` (UUID), not `createdAt`. Message.id is already `@id @default(uuid())` — stable, unique. Using `createdAt` as cursor creates ties when two messages arrive in the same millisecond; the existing feed pattern uses `id` cursor correctly.

### Pattern 6: IChatService Interface (ARCH-04)

**What:** Interface at `src/shared/interfaces/chat.interface.ts` — boundary between modules.
**When to use:** SwipeService and CreditService import this interface only; never `ChatService` directly.

```typescript
// Source: CONTEXT.md D-16 + recommendation.interface.ts pattern (VERIFIED - codebase)
import { ChatInitiator } from '@prisma/client'

export interface IChatService {
  createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }>

  sendMessage(
    chatId: string,
    senderId: string,
    content: string,
  ): Promise<{
    id: string
    chatId: string
    senderId: string
    content: string
    createdAt: Date
    readAt: Date | null
  }>
}
```

### Pattern 7: WebSocket Testing with injectWS

**What:** Use `app.injectWS` (provided by @fastify/websocket) for integration tests.
**When to use:** Any test that needs to open a WebSocket connection.

```typescript
// Source: @fastify/websocket README + types/index.d.ts (VERIFIED - node_modules)
// supertest CANNOT test WebSocket — use injectWS instead
import { buildApp } from '../../src/app'

describe('WS /chats/:chatId/ws', () => {
  it('echoes message back to participants', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    // Generate token (existing loginUser helper pattern)
    const token = await loginUser(app, recruiterEmail)

    const ws = await app.injectWS(`/chats/${chatId}/ws`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    const received: string[] = []
    ws.on('message', (data) => received.push(data.toString()))

    ws.send(JSON.stringify({ content: 'Hello!' }))

    // Wait for message to be broadcast back
    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    expect(received).toHaveLength(1)
    ws.terminate()
    await app.close()
  })
})
```

**Critical:** `ws.terminate()` must be called to avoid Jest "open handles" warning. `app.close()` alone does not force-close all client sockets.

### Anti-Patterns to Avoid

- **Registering @fastify/websocket after chat routes:** Plugin must be registered before any route using `{ websocket: true }`. If you register routes in `buildApp` and then add the plugin, Fastify throws at startup.
- **Attaching `socket.on('message')` after an await:** Race condition — messages arriving immediately after upgrade are dropped before the handler is registered.
- **Using supertest for WebSocket tests:** supertest operates over HTTP only. Use `app.injectWS`.
- **Token in WS URL query param (`?token=...`):** D-08 explicitly requires `Authorization: Bearer` header. Query params appear in server logs and browser history.
- **Leaking closed connections in the Map:** Always remove the socket on `close` and `error` events. Delete the Set when empty.
- **Checking `sender.role` for recruiter-first rule:** The role alone is insufficient — a RECRUITER user associated with a different job could satisfy the role check. Check `senderId` against the chat's job's `recruiterId` (through the job's recruiter profile's `userId`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Custom `http.upgrade` handler | `@fastify/websocket` | Already handles upgrade, hook dispatch, noServer mode |
| WS message framing | Custom binary/text framing | `ws` event API (`socket.on('message')`) | ws handles framing per RFC 6455 |
| WS testing | TCP server + `ws` client | `app.injectWS` | Simpler, no real TCP sockets, headers supported |
| JWT decode in WS handler | Manual JWT parse | `request.jwtVerify()` in preHandler | Already decoded by authenticate hook before handler runs |
| Cursor pagination | OFFSET-based query | `prisma.findMany({ cursor, skip: 1 })` | OFFSET degrades at scale; cursor is O(1) after first page |

---

## Common Pitfalls

### Pitfall 1: @fastify/websocket Registered After Routes
**What goes wrong:** `TypeError: app.register is not a function` or silent WS route failures at startup.
**Why it happens:** @fastify/websocket hooks into `onRoute` internally. Routes defined before the plugin don't get the hook applied.
**How to avoid:** Register `fastifyWebsocket` in `buildApp` before any `app.register(chatRoutes, ...)`.
**Warning signs:** Integration tests get 404 on WS endpoint; startup throws.

### Pitfall 2: Async Participant Check Before socket.on('message')
**What goes wrong:** First messages from client dropped silently if they arrive before the async check completes.
**Why it happens:** Node.js event loop — `socket.on('message')` is synchronous registration; anything after an `await` may miss events emitted during the await.
**How to avoid:** Use the "buffer pending messages" pattern (attach a temporary listener immediately, swap it after the async check), OR do the participant check synchronously by pre-loading chat info in `preHandler` via `request.chatParticipants` decoration.
**Warning signs:** First message always ignored in tests.

### Pitfall 3: @types/ws Missing
**What goes wrong:** TypeScript compile error `Cannot find module 'ws'` or `Namespace 'WebSocket' has no exported member 'WebSocket'` when importing types from `@fastify/websocket`.
**Why it happens:** `@fastify/websocket` types reference `import * as WebSocket from 'ws'` directly. Without `@types/ws`, TypeScript can't resolve the type.
**How to avoid:** `npm install --save-dev @types/ws` before writing any typed WS handler.
**Warning signs:** `npm run build` fails; IDE shows errors on `WebSocket.WebSocket` type.

### Pitfall 4: Memory Leak from Empty Sets in Connection Map
**What goes wrong:** After days of use, the Map grows to thousands of keys with empty Sets, consuming memory.
**Why it happens:** Connections added on open, removed on close — but if the Set is not deleted when empty, the key persists.
**How to avoid:** In `removeConnection`, after `room.delete(socket)`, check `if (room.size === 0) connections.delete(chatId)`.
**Warning signs:** Memory usage grows monotonically; heap dump shows Map with thousands of empty Sets.

### Pitfall 5: Recruiter-First Check Using role Instead of senderId
**What goes wrong:** Any RECRUITER user (even one from a different company) can bypass the check or trigger false positives.
**Why it happens:** Checking `request.user.role === 'RECRUITER'` confuses role with ownership.
**How to avoid:** In `ChatService.sendMessage`, query the chat's job to get `job.recruiter.userId`, then compare to `senderId`. Count existing messages where `senderId === job.recruiter.userId` — if zero and sender is NOT that recruiter → 403 `RECRUITER_MUST_INITIATE`.
**Warning signs:** Integration test: candidate sends first message → does NOT get 403.

### Pitfall 6: Prisma @@unique Migration on Existing Table
**What goes wrong:** Migration fails with `ERROR: could not create unique index` if any `(candidateId, companyId, jobId)` duplicate rows exist.
**Why it happens:** PostgreSQL rejects the unique constraint creation if duplicates are present.
**How to avoid:** The Chat table is new (no rows in test/prod since phase 8 has not shipped). Migration is safe for a fresh table. For production: verify `SELECT COUNT(*) FROM "Chat" GROUP BY "candidateId", "companyId", "jobId" HAVING COUNT(*) > 1` returns zero before deploying.
**Warning signs:** `prisma migrate deploy` fails with unique constraint error.

### Pitfall 7: Cursor-Based Pagination Direction Convention
**What goes wrong:** `GET /chats/:chatId/messages` returns oldest-first instead of newest-first, making "load more history" flow awkward.
**Why it happens:** `orderBy: { createdAt: 'asc' }` is the "chat transcript" order but not the natural "load previous messages" direction.
**How to avoid:** Order by `createdAt: 'desc'` (newest first). Client reverses the array to display chronologically. `cursor` is the `id` of the last fetched message (the oldest one in the page). Explicit in D-13.
**Warning signs:** Pagination returns duplicate pages; client shows messages in wrong order.

---

## Code Examples

### Plugin Registration in buildApp

```typescript
// Source: VERIFIED via @fastify/websocket/index.js and types/index.d.ts
import fastifyWebsocket from '@fastify/websocket'

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: !opts.testing })

  await app.register(helmetPlugin)
  await app.register(corsPlugin)
  await app.register(jwtPlugin)
  await app.register(rateLimitPlugin)
  await app.register(fastifyWebsocket)  // BEFORE any WS route registration

  app.setErrorHandler(errorHandler)

  // ... REST routes ...

  // Composition root: IChatService created here
  const chatRepo = new ChatRepository()
  const chatService = new ChatService(chatRepo)

  // Inject IChatService into cross-module consumers (ARCH-04)
  const swipeRepo = new SwipeRepository()
  const recRepo = new RecommendationRepository(getNeo4jDriver())
  const swipeService = new SwipeService(swipeRepo, recRepo, chatService)  // Updated constructor

  const creditRepo = new CreditRepository()
  const creditService = new CreditService(creditRepo, chatService)  // Updated constructor

  await app.register(chatRoutes, { prefix: '/chats', service: chatService })
  // ... other routes with updated services ...

  return app
}
```

### SwipeService Constructor Update (D-01)

```typescript
// Source: src/modules/swipe/swipe.service.ts (VERIFIED - codebase) + CONTEXT.md D-01
import type { IChatService } from '../../shared/interfaces/chat.interface'

export class SwipeService {
  constructor(
    private readonly repo: SwipeRepository,
    private readonly recommendation: IRecommendationService,
    private readonly chat: IChatService,  // NEW — injected at composition root
  ) {}

  async recordSwipe(userId: string, jobId: string, direction: SwipeDirection) {
    // ... existing validation ...
    const swipe = await this.repo.createSwipe({ candidateId, jobId, direction })

    let chatId: string | null = null
    if (direction === SwipeDirection.LIKE) {
      const result = await this.chat.createOrGetChat(
        candidateId,
        job.companyId,
        jobId,
        'MATCH',
      )
      chatId = result.chatId
    }

    return { ...swipe, chatId }  // D-03: chatId included in response
  }
}
```

### WS Zod Message Validation (SEC-02)

```typescript
// Source: ASSUMED pattern consistent with existing Zod usage in routes (VERIFIED pattern)
import { z } from 'zod'

const IncomingMessageSchema = z.object({
  content: z.string().min(1).max(5000),
})

socket.on('message', async (rawData) => {
  let payload: { content: string }
  try {
    payload = IncomingMessageSchema.parse(JSON.parse(rawData.toString()))
  } catch {
    socket.send(JSON.stringify({ error: 'INVALID_PAYLOAD' }))
    return
  }
  // proceed to service.sendMessage(...)
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ws package directly | @fastify/websocket encapsulation | ~2018 | Hooks + encapsulation work; no manual upgrade listener needed |
| OFFSET pagination | cursor-based pagination | Prisma 2.x+ | Already in use in getFeed; replicate for messages |
| Separate `ws` type install | Bundled in @fastify/websocket types | Still requires @types/ws | @types/ws must be installed manually |

**Deprecated/outdated:**
- Fastify 4 WS route syntax: In Fastify 4, `@fastify/websocket` handler signature was `(connection, req)` where `connection` had `.socket` property. In Fastify 5 + @fastify/websocket v11, the handler receives the raw `WebSocket` socket directly as first arg: `(socket, request)`. The `connection.socket` pattern from old tutorials does NOT apply here. [VERIFIED: @fastify/websocket/types/index.d.ts — handler is `WebsocketHandler = (socket: WebSocket.WebSocket, request: FastifyRequest) => void`]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `prisma.chat.upsert({ where: { candidateId_companyId_jobId: ... } })` is the correct compound unique key name after migration | Pattern 4 | Compile error; findable immediately after `prisma generate` |
| A2 | The "buffer pending messages" async-before-listener pattern is necessary | Pitfall 2 / Pattern 2 | First messages may or may not be dropped depending on client timing; safe to implement defensively |
| A3 | `GET /chats/:chatId/messages` should return newest-first (desc) and client reverses | Pitfall 7 | Planner should confirm with D-13 — CONTEXT says `cursor + limit` pattern but does not specify direction |

---

## Open Questions

1. **WS message direction for history**
   - What we know: D-13 specifies cursor-based pagination matching `getFeed` pattern.
   - What's unclear: getFeed returns jobs `orderBy: createdAt desc` (newest first). For messages, newest-first means "most recent messages", which is the natural default for a chat load-more-history flow. But the client must reverse to display chronologically.
   - Recommendation: Use `desc` (newest first), return `{ data, nextCursor }`. Document in PLAN.md.

2. **Participant verification method**
   - What we know: D-09 requires participant check on WS connect. The participant is either the candidate (via `chat.candidateId → candidateProfile.userId`) or the recruiter (via `chat.job.recruiterId → recruiterProfile.userId`).
   - What's unclear: Should `ChatRepository` provide a dedicated `isParticipant(chatId, userId)` method, or should the service load the full chat and compute?
   - Recommendation: `ChatRepository.findChatWithParticipants(chatId)` returns chat with nested `candidate.userId` and `job.recruiter.userId`; service computes the boolean. Single query.

3. **GET /chats list endpoint — recruiter scope**
   - What we know: D-12 says recruiter sees chats for "their jobs". A recruiter has a `RecruiterProfile.id` linked to multiple jobs.
   - What's unclear: Does the query scope by `job.recruiterId` (profile id) or `job.recruiter.userId` (user id)?
   - Recommendation: Query `chat.job.recruiterId` — that is the `RecruiterProfile.id`, which is what the authenticated user's `recruiterProfile.id` corresponds to. Consistent with how SwipeService and CreditService do recruiter ownership checks.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| @fastify/websocket | CHAT-01 | ✓ | 11.2.0 | — |
| ws (transitive) | @fastify/websocket | ✓ | 8.20.0 | — |
| @types/ws | TypeScript compilation | ✗ | — | Install before first build |
| PostgreSQL (test DB) | Integration tests | ✓ (existing setup.ts) | 16 | — |
| prisma migrate deploy | @@unique migration | ✓ (setup.ts runs this) | 7.7.0 | — |

**Missing dependencies with no fallback:**
- `@types/ws` — must `npm install --save-dev @types/ws` before any typed WS handler code compiles. Wave 0 task.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest tests/unit/chat.service.test.ts --runInBand` |
| Full suite command | `npm test` (runs all, serial) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | WS connection established; messages broadcast to both participants | Integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ Wave 0 |
| CHAT-01 | Non-participant rejected with 403 on WS connect | Integration | Same file | ❌ Wave 0 |
| CHAT-02 | Chat auto-created on LIKE swipe; chatId in response | Integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ Wave 0 |
| CHAT-02 | Chat auto-created on unlock; chatId in response | Integration | Same file | ❌ Wave 0 |
| CHAT-02 | Idempotent: second LIKE on same job returns same chatId | Integration | Same file | ❌ Wave 0 |
| CHAT-02 | Recruiter-first rule: candidate sending first message → 403 | Integration | Same file | ❌ Wave 0 |
| CHAT-03 | Message persisted to DB after WS send | Integration | Same file | ❌ Wave 0 |
| CHAT-03 | WS message validated with Zod; invalid payload → error response | Integration | Same file | ❌ Wave 0 |
| CHAT-04 | GET /chats/:chatId/messages returns paginated history | Integration | Same file | ❌ Wave 0 |
| CHAT-04 | GET /chats/:chatId/messages marks readAt on other participant's messages | Integration | Same file | ❌ Wave 0 |
| CHAT-04 | GET /chats returns list of chats for authenticated user | Integration | Same file | ❌ Wave 0 |
| CHAT-01–04 | Unit: ChatService.createOrGetChat, sendMessage, getMessages | Unit | `npx jest tests/unit/chat.service.test.ts --runInBand` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/unit/chat.service.test.ts --runInBand`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/chat.service.test.ts` — covers CHAT-01 through CHAT-04 (unit, no DB)
- [ ] `tests/integration/chat.test.ts` — covers all integration behaviors above
- [ ] `tests/helpers/factories.ts` additions: `createChat(candidateId, jobId, companyId)` and `createMessage(chatId, senderId)` factories
- [ ] `npm install --save-dev @types/ws` — required before WS handler TypeScript compiles

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | existing `authenticate` preHandler (JWT verify) on all routes and WS upgrade |
| V3 Session Management | no | stateless JWT; no server-side session |
| V4 Access Control | yes | participant check in WS handler body; `requireRole('CANDIDATE', 'RECRUITER')` on REST endpoints |
| V5 Input Validation | yes | Zod on REST request bodies + WS message payload (SEC-02) |
| V6 Cryptography | no | no new crypto in this phase |

### Known Threat Patterns for WebSocket + Fastify Chat Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| WS token in URL query param | Information Disclosure | Token in `Authorization` header only (D-08) |
| Non-participant connects to chat room | Elevation of Privilege | Participant check in handler: compare userId to `chat.candidateId → userId` and `chat.job.recruiterId → userId` |
| Malformed JSON in WS message | Tampering | `JSON.parse` wrapped in try/catch; Zod parse with schema |
| Message flood via WS | Denial of Service | Rate limiting via Fastify `config: { rateLimit }` applies to the HTTP upgrade; per-message rate limit is v2 |
| Candidate sends first message (RECRUITER_MUST_INITIATE bypass) | Elevation of Privilege | Count existing recruiter messages in DB before persisting; not bypassable via WS timing |
| Connection store memory exhaustion | Denial of Service | Clean up Map entries when Set is empty (Pitfall 4 mitigation) |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@fastify/websocket/index.js` — implementation: preHandler dispatch order, handler signature `(socket, request)`, `injectWS` implementation [VERIFIED: codebase]
- `node_modules/@fastify/websocket/types/index.d.ts` — TypeScript handler type `WebsocketHandler = (socket: WebSocket.WebSocket, request: FastifyRequest) => void` [VERIFIED: codebase]
- `node_modules/fastify/package.json` — Fastify 5.8.5 confirmed [VERIFIED: codebase]
- `node_modules/@fastify/websocket/package.json` — v11.2.0 confirmed; no peerDeps declared [VERIFIED: codebase]
- `node_modules/ws/package.json` — ws 8.20.0 confirmed [VERIFIED: codebase]
- `prisma/schema.prisma` — Chat model has `candidateId`, `companyId`, `jobId` fields (no `@@unique` yet); Message model has `id`, `chatId`, `senderId`, `content`, `createdAt`, `readAt` [VERIFIED: codebase]
- `src/app.ts` — composition root injection pattern [VERIFIED: codebase]
- `src/modules/swipe/swipe.repository.ts` — cursor pagination pattern (`cursor: { id }, skip: 1, take: limit + 1`) [VERIFIED: codebase]
- `src/shared/interfaces/recommendation.interface.ts` — IChatService template pattern [VERIFIED: codebase]
- `src/shared/hooks/authenticate.ts` — `request.jwtVerify()` pattern [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- @fastify/websocket README (GitHub) — plugin registration, preHandler hooks, injectWS API, `Authorization` header pattern [CITED: github.com/fastify/fastify-websocket/blob/master/README.md]
- @fastify/websocket v11.x release notes — v11.0.1 targets Fastify ^5.0.0; v11.2.0 added lifecycle hooks for injectWS [CITED: github.com/fastify/fastify-websocket/releases]

### Tertiary (LOW confidence — not needed, all above verified)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in node_modules
- Architecture: HIGH — handler types read directly from installed package
- Pitfalls: HIGH (Fastify/WS specifics verified) / MEDIUM (A2 message-drop timing is defensive)
- Testing strategy: HIGH — injectWS verified in types/index.d.ts

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable ecosystem; @fastify/websocket v11 is in maintenance mode)
