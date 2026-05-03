# Phase 8: Chat - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 11 (new/modified)
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/interfaces/chat.interface.ts` | interface | — | `src/shared/interfaces/recommendation.interface.ts` | exact |
| `src/modules/chat/chat.repository.ts` | repository | CRUD | `src/modules/credits/credits.repository.ts` | exact |
| `src/modules/chat/chat.service.ts` | service | CRUD + event-driven | `src/modules/credits/credits.service.ts` | role-match |
| `src/modules/chat/chat.routes.ts` | route + WS gateway | request-response + event-driven | `src/modules/admin/admin.routes.ts` | role-match |
| `src/app.ts` | config / composition root | — | `src/app.ts` (self — modify) | exact |
| `src/modules/swipe/swipe.service.ts` | service | CRUD | `src/modules/swipe/swipe.service.ts` (self — modify) | exact |
| `src/modules/credits/credits.service.ts` | service | CRUD | `src/modules/credits/credits.service.ts` (self — modify) | exact |
| `prisma/schema.prisma` | model | — | `prisma/schema.prisma` — `Swipe` model `@@unique` | exact |
| `tests/unit/chat.service.test.ts` | test | — | `tests/unit/credit.service.test.ts` | exact |
| `tests/integration/chat.test.ts` | test | — | `tests/integration/credits.test.ts` + `tests/integration/swipe.test.ts` | exact |
| `tests/helpers/factories.ts` | helper | — | `tests/helpers/factories.ts` (self — modify) | exact |

---

## Pattern Assignments

### `src/shared/interfaces/chat.interface.ts` (interface)

**Analog:** `src/shared/interfaces/recommendation.interface.ts` (lines 1–27)

**Full file pattern** (lines 1–27):
```typescript
// ARCH-04: This interface is the boundary between the swipe module and the recommendation module.
// swipe.service.ts depends on IRecommendationService — NOT on RecommendationRepository directly.

export interface CandidateData { ... }
export interface JobData { ... }

export interface IRecommendationService {
  computeFitScore(candidate: CandidateData, job: JobData): Promise<number>
}
```

**Apply this pattern:** File opens with an ARCH-04 boundary comment. Exports only the interface and any supporting type aliases needed by callers. Never imports concrete implementation classes. Imports Prisma enums directly from `@prisma/client` (e.g., `ChatInitiator`).

**Concrete interface shape** (from CONTEXT.md D-16 + RESEARCH.md Pattern 6):
```typescript
// src/shared/interfaces/chat.interface.ts
// ARCH-04: Boundary between chat module and swipe/credits modules.
// SwipeService and CreditService depend on IChatService — NOT on ChatService directly.

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

---

### `src/modules/chat/chat.repository.ts` (repository, CRUD)

**Analog:** `src/modules/credits/credits.repository.ts` (lines 1–71)

**Imports pattern** (analog lines 1–1):
```typescript
import { prisma } from '../../shared/db/prisma'
```

**Core CRUD pattern — upsert for idempotent chat creation** (based on RESEARCH.md Pattern 4):
```typescript
// Prisma upsert pattern — @@unique guard prevents duplicates
async createOrGetChat(
  candidateId: string,
  companyId: string,
  jobId: string,
  initiator: ChatInitiator,
) {
  return prisma.chat.upsert({
    where: { candidateId_companyId_jobId: { candidateId, companyId, jobId } },
    create: { candidateId, companyId, jobId, initiatedBy: initiator, isActive: true },
    update: {},  // No-op if exists — initiatedBy stays as first trigger (D-06)
  })
}
```

**Cursor-based message pagination** (analog: `src/modules/swipe/swipe.repository.ts` lines 25–35):
```typescript
// From swipe.repository.ts findFeedJobs — replicate for messages
async findMessages(chatId: string, cursor: string | undefined, limit: number) {
  return prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },  // Newest first (D-13)
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
}
```

**Direct Prisma per-model queries (ARCH-04 note)** (analog: `src/modules/swipe/swipe.repository.ts` lines 16–19):
```typescript
// Direct Prisma call — NEVER import ChatRepository from other modules (ARCH-04)
async findCandidateProfileByUserId(userId: string) {
  return prisma.candidateProfile.findUnique({ where: { userId } })
}
```

**Pattern notes:**
- Class with no constructor parameters — `prisma` is module-level singleton imported from `src/shared/db/prisma`.
- Every method is `async`. No raw SQL. No string interpolation.
- Repository handles all Prisma calls for `Chat` and `Message` models; may query any Prisma model directly (e.g., `candidateProfile`, `job`) — ARCH-04 permits this.
- Participant verification: use `findUnique` with nested `include` for `candidate.userId` and `job.recruiter.userId` in one query.

---

### `src/modules/chat/chat.service.ts` (service, CRUD + event-driven)

**Analog:** `src/modules/credits/credits.service.ts` (lines 1–48) + `src/modules/swipe/swipe.service.ts` (lines 25–151)

**Imports pattern** (analog: credits.service.ts lines 1–4):
```typescript
import { ChatRepository } from './chat.repository'
import { AppError } from '../../shared/errors/AppError'
import { ChatInitiator } from '@prisma/client'
import type { IChatService } from '../../shared/interfaces/chat.interface'
```

**Constructor pattern — dependency injection** (analog: swipe.service.ts lines 25–29):
```typescript
// Single repository dependency; implements IChatService
export class ChatService implements IChatService {
  constructor(private readonly repo: ChatRepository) {}
  // ...
}
```

**AppError throwing pattern** (analog: credits.service.ts lines 11–19):
```typescript
throw new AppError('Forbidden', 403, 'FORBIDDEN')
throw new AppError('Chat not found', 404, 'NOT_FOUND')
throw new AppError('Recruiter must send first message', 403, 'RECRUITER_MUST_INITIATE')
throw new AppError('Not a participant', 403, 'NOT_PARTICIPANT')
```

**Ownership check pattern** (analog: credits.service.ts lines 15, swipe.service.ts lines 95–96):
```typescript
// Load profile by userId; compare IDs to chat participant fields
const recruiter = await this.repo.findRecruiterByUserId(userId)
if (!recruiter) throw new AppError('Forbidden', 403, 'FORBIDDEN')
if (job.recruiterId !== recruiter.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')
```

**Cursor pagination return shape** (analog: swipe.service.ts lines 56–58):
```typescript
// getFeed pattern — replicate for getMessages
const hasNext = messages.length > limit
const data = hasNext ? messages.slice(0, limit) : messages
const nextCursor = hasNext ? data[data.length - 1].id : null
return { data, nextCursor }
```

**Recruiter-first rule check** (CONTEXT.md D-04, RESEARCH.md Pitfall 5):
```typescript
// Check by senderId vs job's recruiter userId — NOT by role
// Count recruiter messages using the job's recruiter profile userId
const recruiterMessageCount = await this.repo.countRecruiterMessages(chatId, recruiterUserId)
if (recruiterMessageCount === 0 && senderId !== recruiterUserId) {
  throw new AppError('Recruiter must send first message', 403, 'RECRUITER_MUST_INITIATE')
}
```

**P2002 Prisma error handling** (analog: credits.service.ts lines 29–31):
```typescript
if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
  // treat as idempotent — chat already exists (race on upsert)
}
```

---

### `src/modules/chat/chat.routes.ts` (route + WS gateway, request-response + event-driven)

**Analog:** `src/modules/admin/admin.routes.ts` (lines 1–57) — service injection via opts pattern

**Imports pattern** (analog: admin.routes.ts lines 1–6):
```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import type { WebSocket } from '@fastify/websocket'
import { ChatService } from './chat.service'
import type { IChatService } from '../../shared/interfaces/chat.interface'
```

**Service injection via opts pattern** (analog: admin.routes.ts lines 18–19):
```typescript
export async function chatRoutes(app: FastifyInstance, opts: { service: IChatService }): Promise<void> {
  const service = opts.service
  // ...
}
```

**REST route with preHandler** (analog: admin.routes.ts lines 22–28):
```typescript
app.get('/', {
  preHandler: [authenticate, requireRole('CANDIDATE', 'RECRUITER')],
}, async (request, reply) => {
  const chats = await service.listChats(request.user.id)
  return reply.status(200).send(chats)
})
```

**Zod param/query validation** (analog: admin.routes.ts line 16, swipe.routes.ts lines 11–19):
```typescript
const ChatIdParamsSchema = z.object({ chatId: z.string().uuid() })
const MessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
})
const IncomingMessageSchema = z.object({
  content: z.string().min(1).max(5000),
})
```

**WebSocket route pattern** (RESEARCH.md Pattern 2 — Fastify 5 + @fastify/websocket v11):
```typescript
// In-memory connection store — module-level singleton
const connections = new Map<string, Set<WebSocket>>()

function addConnection(chatId: string, socket: WebSocket): void {
  if (!connections.has(chatId)) connections.set(chatId, new Set())
  connections.get(chatId)!.add(socket)
}

function removeConnection(chatId: string, socket: WebSocket): void {
  const room = connections.get(chatId)
  if (room) {
    room.delete(socket)
    if (room.size === 0) connections.delete(chatId)  // Prevent memory leak (RESEARCH.md Pitfall 4)
  }
}

function broadcast(chatId: string, message: object): void {
  const room = connections.get(chatId)
  if (!room) return
  const json = JSON.stringify(message)
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) socket.send(json)
  }
}

// WS upgrade route
app.get('/:chatId/ws', {
  websocket: true,
  preHandler: [authenticate],  // JWT verify runs BEFORE upgrade (D-08)
}, async (socket: WebSocket, request) => {
  const { chatId } = ChatIdParamsSchema.parse(request.params)

  // Attach message listener FIRST (synchronous) to avoid dropping messages
  // before async participant check completes (RESEARCH.md Pitfall 2)
  const pending: Buffer[] = []
  socket.on('message', (data) => pending.push(data as Buffer))

  // Async participant check
  const isParticipant = await service.verifyParticipant(chatId, request.user.id)
  if (!isParticipant) { socket.close(1008, 'Forbidden'); return }

  addConnection(chatId, socket)

  // Real message handler
  const handleMessage = async (rawData: Buffer) => {
    let payload: { content: string }
    try {
      payload = IncomingMessageSchema.parse(JSON.parse(rawData.toString()))
    } catch {
      socket.send(JSON.stringify({ error: 'INVALID_PAYLOAD' }))
      return
    }
    const message = await service.sendMessage(chatId, request.user.id, payload.content)
    broadcast(chatId, message)
  }

  // Swap listener and drain pending
  socket.removeAllListeners('message')
  socket.on('message', handleMessage)
  for (const data of pending) await handleMessage(data)

  socket.on('close', () => removeConnection(chatId, socket))
  socket.on('error', () => removeConnection(chatId, socket))
})
```

---

### `src/app.ts` (modify — composition root)

**Analog:** `src/app.ts` (lines 1–61, self — add WS plugin + chat wiring)

**Current composition root pattern** (lines 50–54):
```typescript
// Composition root: wire credits dependencies and inject into admin module
const creditRepo = new CreditRepository()
const creditService = new CreditService(creditRepo)
const adminService = new AdminService(creditService)
await app.register(adminRoutes, { prefix: '/admin', service: adminService })
```

**New pattern to replicate — extend existing root:**
```typescript
import fastifyWebsocket from '@fastify/websocket'
import { ChatRepository } from './modules/chat/chat.repository'
import { ChatService } from './modules/chat/chat.service'
import { chatRoutes } from './modules/chat/chat.routes'

// Inside buildApp, BEFORE any route registration using { websocket: true }:
await app.register(fastifyWebsocket)  // Must be before chatRoutes (RESEARCH.md Pitfall 1)

// Composition root — IChatService
const chatRepo = new ChatRepository()
const chatService = new ChatService(chatRepo)

// Inject IChatService into existing services (ARCH-04 — no direct imports between modules)
const swipeRepo = new SwipeRepository()
const recRepo = new RecommendationRepository(getNeo4jDriver())
const swipeService = new SwipeService(swipeRepo, recRepo, chatService)  // Third param is new

const creditRepo = new CreditRepository()
const creditService = new CreditService(creditRepo, chatService)  // Second param is new

await app.register(chatRoutes, { prefix: '/chats', service: chatService })
```

**Critical ordering constraint:** `fastifyWebsocket` must be registered before `chatRoutes`. Register it immediately after `rateLimitPlugin`, before any `app.register(routes, ...)` calls.

---

### `src/modules/swipe/swipe.service.ts` (modify — add IChatService)

**Analog:** `src/modules/swipe/swipe.service.ts` (lines 25–49, self — add third constructor param)

**Current constructor** (lines 25–29):
```typescript
export class SwipeService {
  constructor(
    private readonly repo: SwipeRepository,
    private readonly recommendation: IRecommendationService,
  ) {}
```

**Modified constructor pattern:**
```typescript
import type { IChatService } from '../../shared/interfaces/chat.interface'

export class SwipeService {
  constructor(
    private readonly repo: SwipeRepository,
    private readonly recommendation: IRecommendationService,
    private readonly chat: IChatService,  // NEW — injected at composition root (D-01)
  ) {}
```

**Modified recordSwipe — add chatId to return** (analog: current lines 41–49 + RESEARCH.md SwipeService Constructor Update):
```typescript
async recordSwipe(userId: string, jobId: string, direction: SwipeDirection) {
  // ... existing validation unchanged ...
  const swipe = await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })

  let chatId: string | null = null
  if (direction === SwipeDirection.LIKE) {
    const result = await this.chat.createOrGetChat(
      candidate.id,
      job.companyId,
      jobId,
      'MATCH' as ChatInitiator,
    )
    chatId = result.chatId
  }

  return { ...swipe, chatId }  // D-03: chatId included in response
}
```

**Note:** `swipe.routes.ts` currently constructs `SwipeService` inline — it will be updated (or app.ts will take over construction). Check both places.

---

### `src/modules/credits/credits.service.ts` (modify — add IChatService)

**Analog:** `src/modules/credits/credits.service.ts` (lines 1–48, self — add second constructor param)

**Current constructor** (lines 6–8):
```typescript
export class CreditService {
  constructor(private readonly repo: CreditRepository) {}
```

**Modified constructor pattern:**
```typescript
import type { IChatService } from '../../shared/interfaces/chat.interface'

export class CreditService {
  constructor(
    private readonly repo: CreditRepository,
    private readonly chat: IChatService,  // NEW — injected at composition root (D-01)
  ) {}
```

**Modified unlockCandidate — add chatId to return** (after current line 27):
```typescript
// After successful executeUnlock:
const unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)

const { chatId } = await this.chat.createOrGetChat(
  candidateId,
  recruiter.companyId,
  jobId,
  'CREDIT' as ChatInitiator,
)

return { ...unlock, chatId }  // D-03: chatId included in unlock response
```

---

### `prisma/schema.prisma` (modify — add @@unique to Chat)

**Analog:** `prisma/schema.prisma` — `Swipe` model (lines 134–144)

**Existing @@unique pattern** (lines 143–144):
```prisma
model Swipe {
  // ... fields ...
  @@unique([candidateId, jobId])
}
```

**Change to apply to Chat model** (after line 160, inside Chat model):
```prisma
model Chat {
  // ... existing fields (lines 146–160) unchanged ...
  messages Message[]

  @@unique([candidateId, companyId, jobId])  // D-07: one room per triplet
}
```

**Migration note:** This is a new unique constraint on a table that has no rows in test/prod environments (Phase 8 is first use). Migration is safe. Run `npx prisma migrate dev --name add-chat-unique-constraint` after schema edit.

**Compound key name:** After `prisma generate`, the compound where-clause key will be `candidateId_companyId_jobId` (fields joined with `_`). Used in repository upsert as: `where: { candidateId_companyId_jobId: { candidateId, companyId, jobId } }`.

---

### `tests/unit/chat.service.test.ts` (new — unit tests)

**Analog:** `tests/unit/credit.service.test.ts` (lines 1–152)

**File structure pattern** (analog lines 1–42):
```typescript
import { ChatService } from '../../src/modules/chat/chat.service'
import { ChatRepository } from '../../src/modules/chat/chat.repository'
import { AppError } from '../../src/shared/errors/AppError'

// Mock repository — no DB in unit tests
const makeRepo = (): jest.Mocked<ChatRepository> => ({
  createOrGetChat: jest.fn(),
  createMessage: jest.fn(),
  findMessages: jest.fn(),
  findChatById: jest.fn(),
  findChatWithParticipants: jest.fn(),
  countRecruiterMessages: jest.fn(),
  findChatsByUserId: jest.fn(),
  markMessagesRead: jest.fn(),
} as unknown as jest.Mocked<ChatRepository>)
```

**describe/beforeEach pattern** (analog lines 33–41):
```typescript
describe('ChatService', () => {
  let repo: jest.Mocked<ChatRepository>
  let service: ChatService

  beforeEach(() => {
    repo = makeRepo()
    service = new ChatService(repo)
    jest.clearAllMocks()
  })
  // ...
})
```

**Error assertion pattern** (analog lines 44–48):
```typescript
it('lança AppError 403 RECRUITER_MUST_INITIATE quando candidato tenta enviar antes do recrutador', async () => {
  repo.findChatWithParticipants.mockResolvedValue(makeChat() as any)
  repo.countRecruiterMessages.mockResolvedValue(0)
  await expect(service.sendMessage('chat-1', 'candidate-user-id', 'Hello'))
    .rejects.toMatchObject({ statusCode: 403, code: 'RECRUITER_MUST_INITIATE' })
  expect(repo.createMessage).not.toHaveBeenCalled()
})
```

---

### `tests/integration/chat.test.ts` (new — integration tests)

**Analog:** `tests/integration/credits.test.ts` (lines 1–80) + `tests/integration/swipe.test.ts` (lines 1–80)

**File header pattern** (analog: credits.test.ts lines 1–16):
```typescript
import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe, createChat, createMessage } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/shared/db/prisma'

async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = 'password123',
): Promise<string> {
  const response = await supertest(app.server).post('/auth/login').send({ email, password })
  return response.body.accessToken as string
}
```

**Setup helper pattern** (analog: credits.test.ts lines 17–28):
```typescript
async function setupChat(app: Awaited<ReturnType<typeof buildApp>>) {
  const company = await createCompany({ credits: 10 })
  const passwordHash = await bcrypt.hash('password123', 12)
  const recUser = await createUser({ role: 'RECRUITER', email: `rec-${Date.now()}@test.com`, passwordHash })
  const recProfile = await prisma.recruiterProfile.create({ data: { userId: recUser.id, companyId: company.id } })
  const { user: candUser, profile: candProfile } = await createCandidate()
  const job = await createJob(company.id, recProfile.id)
  const chat = await createChat(candProfile.id, job.id, company.id)
  const recToken = await loginUser(app, recUser.email)
  const candToken = await loginUser(app, candUser.email)
  return { company, recUser, recProfile, candUser, candProfile, job, chat, recToken, candToken }
}
```

**WebSocket test pattern using injectWS** (RESEARCH.md Pattern 7):
```typescript
it('WS: mensagem enviada pelo recrutador é broadcast para ambos participantes', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()
  const { chat, recToken } = await setupChat(app)

  const ws = await app.injectWS(`/chats/${chat.id}/ws`, {
    headers: { Authorization: `Bearer ${recToken}` },
  })

  const received: string[] = []
  ws.on('message', (data) => received.push(data.toString()))
  ws.send(JSON.stringify({ content: 'Hello candidate!' }))

  await new Promise<void>((resolve) => setTimeout(resolve, 100))

  expect(received).toHaveLength(1)
  ws.terminate()  // Required — avoids Jest open handle warning
  await app.close()
})
```

**Standard REST assertion pattern** (analog: credits.test.ts lines 32–55):
```typescript
it('201 chatId incluído na resposta POST /swipes quando direction === LIKE', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()
  // ... setup ...
  const res = await supertest(app.server)
    .post('/swipes')
    .set('Authorization', `Bearer ${candToken}`)
    .send({ jobId: job.id, direction: 'LIKE' })
  expect(res.status).toBe(201)
  expect(typeof res.body.chatId).toBe('string')
  await app.close()
})
```

---

### `tests/helpers/factories.ts` (modify — add createChat + createMessage)

**Analog:** `tests/helpers/factories.ts` — `createSwipe` (lines 102–116) and `createUnlock` (lines 118–132)

**createSwipe pattern to replicate** (lines 102–116):
```typescript
export async function createSwipe(
  candidateId: string,
  jobId: string,
  overrides: Partial<{ direction: 'LIKE' | 'DISLIKE' }> = {}
) {
  return prisma.swipe.create({
    data: {
      candidateId,
      jobId,
      direction: overrides.direction ?? 'LIKE',
    },
  })
}
```

**New factories to add at the end of the file:**
```typescript
export async function createChat(
  candidateId: string,
  jobId: string,
  companyId: string,
  overrides: Partial<{
    initiatedBy: 'MATCH' | 'CREDIT'
    isActive: boolean
  }> = {}
) {
  return prisma.chat.create({
    data: {
      candidateId,
      jobId,
      companyId,
      initiatedBy: overrides.initiatedBy ?? 'MATCH',
      isActive: overrides.isActive ?? true,
    },
  })
}

export async function createMessage(
  chatId: string,
  senderId: string,
  overrides: Partial<{
    content: string
    readAt: Date | null
  }> = {}
) {
  return prisma.message.create({
    data: {
      chatId,
      senderId,
      content: overrides.content ?? 'Test message',
      readAt: overrides.readAt ?? null,
    },
  })
}
```

**Important:** `senderId` in `createMessage` is a `User.id` (not a profile id) — matches the `Message.senderId → User` relation in `schema.prisma` line 167.

---

## Shared Patterns

### Authentication — preHandler on all routes
**Source:** `src/shared/hooks/authenticate.ts` (lines 15–24)
**Apply to:** All chat REST routes and WS upgrade route

```typescript
// authenticate runs request.jwtVerify(); throws AppError 401 UNAUTHORIZED on failure
// Usage:
preHandler: [authenticate]
// After this runs, request.user is typed as { id: string; role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN' }
```

### Role Guard — after authenticate
**Source:** `src/shared/hooks/requireRole.ts` (lines 10–23)
**Apply to:** All REST chat routes (CANDIDATE and RECRUITER — both allowed)

```typescript
// Usage:
preHandler: [authenticate, requireRole('CANDIDATE', 'RECRUITER')]
// WS route uses only authenticate; participant check is in handler body (D-09)
```

### AppError — all throw sites
**Source:** `src/shared/errors/AppError.ts` (lines 1–12)
**Apply to:** `chat.service.ts` — all guard throws

```typescript
throw new AppError(message: string, statusCode: number, code: string)
// Examples for chat:
throw new AppError('Chat not found', 404, 'NOT_FOUND')
throw new AppError('Recruiter must send first message', 403, 'RECRUITER_MUST_INITIATE')
throw new AppError('Not a participant', 403, 'NOT_PARTICIPANT')
throw new AppError('Forbidden', 403, 'FORBIDDEN')
```

### Zod Validation — all REST body/params/query + WS payload
**Source:** `src/modules/swipe/swipe.routes.ts` (lines 11–19), `src/modules/admin/admin.routes.ts` (lines 7–16)
**Apply to:** All `chat.routes.ts` handlers

```typescript
// Parse at the top of each handler — throw propagates to Fastify error handler
const { chatId } = ChatIdParamsSchema.parse(request.params)
const query = MessagesQuerySchema.parse(request.query)
// WS: parse inside socket.on('message') callback with try/catch
payload = IncomingMessageSchema.parse(JSON.parse(rawData.toString()))
```

### Cursor Pagination Return Shape
**Source:** `src/modules/swipe/swipe.service.ts` (lines 56–58)
**Apply to:** `ChatService.getMessages` and its route handler

```typescript
const hasNext = data.length > limit
const page = hasNext ? data.slice(0, limit) : data
const nextCursor = hasNext ? page[page.length - 1].id : null
return { data: page, nextCursor }
```

### Composition Root — opts injection
**Source:** `src/modules/admin/admin.routes.ts` (line 18), `src/app.ts` (lines 50–54)
**Apply to:** `chatRoutes` — receives `IChatService` via `opts.service`

```typescript
// Routes:
export async function chatRoutes(app: FastifyInstance, opts: { service: IChatService }): Promise<void> {
  const service = opts.service

// app.ts:
await app.register(chatRoutes, { prefix: '/chats', service: chatService })
```

---

## No Analog Found

All 11 files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively — though `chat.routes.ts` WebSocket-specific code (in-memory connection store, `injectWS` testing, `{ websocket: true }` route option) has no codebase analog and must follow RESEARCH.md Patterns 2, 3, and 7 directly.

| File | WS-specific aspect | Reason |
|---|---|---|
| `src/modules/chat/chat.routes.ts` | `{ websocket: true }`, connection Map, broadcast, `injectWS` | No existing WebSocket routes in codebase — first use of @fastify/websocket |
| `tests/integration/chat.test.ts` | `app.injectWS(path, { headers })` | No existing WS integration tests — use RESEARCH.md Pattern 7 |

---

## Metadata

**Analog search scope:** `src/modules/`, `src/shared/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`, `prisma/`
**Files scanned:** 27 source files + schema + factories
**Pattern extraction date:** 2026-05-03
