# Phase 12: Swipe, Credits, Recommendation, Chat Migration — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 18 (new files to create)
**Analogs found:** 18 / 18

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/application/ports/chat.port.ts` | port/interface | request-response | `src/application/ports/hash.port.ts` | exact |
| `src/adapters/repositories/chat.repository.ts` | repository adapter | CRUD | `src/adapters/repositories/candidate.repository.ts` | role-match |
| `src/adapters/repositories/swipe.repository.ts` | repository adapter | CRUD + transaction | `src/adapters/repositories/company.repository.ts` | exact |
| `src/adapters/repositories/credit.repository.ts` | repository adapter | CRUD + transaction | `src/adapters/repositories/company.repository.ts` | exact |
| `src/adapters/services/neo4j.adapter.ts` | service adapter | request-response | `src/adapters/services/bcrypt.adapter.ts` | exact |
| `src/adapters/controllers/chat.controller.ts` | controller | request-response | `src/adapters/controllers/candidate.controller.ts` | exact |
| `src/adapters/controllers/swipe.controller.ts` | controller | request-response | `src/adapters/controllers/company.controller.ts` | exact |
| `src/adapters/controllers/credits.controller.ts` | controller | request-response | `src/adapters/controllers/company.controller.ts` | exact |
| `src/infrastructure/http/routes/chat.routes.ts` | route + WS gateway | event-driven | `src/modules/chat/chat.routes.ts` | exact |
| `src/infrastructure/http/routes/swipe.routes.ts` | route (dual-export) | request-response | `src/modules/swipe/swipe.routes.ts` | exact |
| `src/infrastructure/http/routes/credits.routes.ts` | route | request-response | `src/infrastructure/http/routes/candidate.routes.ts` | role-match |
| `src/application/use-cases/chat/create-or-get-chat.use-case.ts` | use case | CRUD | `src/application/use-cases/company/adjust-company-credits.use-case.ts` | exact |
| `src/application/use-cases/chat/send-message.use-case.ts` | use case | CRUD | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/chat/verify-participant.use-case.ts` | use case | request-response | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/chat/get-messages.use-case.ts` | use case | CRUD | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/chat/list-chats.use-case.ts` | use case | CRUD | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/credits/unlock-candidate.use-case.ts` | use case | CRUD + transaction | `src/application/use-cases/company/adjust-company-credits.use-case.ts` | role-match |
| `src/application/use-cases/credits/grant-credits.use-case.ts` | use case | CRUD | `src/application/use-cases/company/adjust-company-credits.use-case.ts` | exact |
| `src/application/use-cases/credits/credits.constants.ts` | constants | — | inline pattern | N/A |
| `src/application/use-cases/swipe/record-swipe.use-case.ts` | use case | CRUD + transaction | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/swipe/get-feed.use-case.ts` | use case | request-response | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | use case | request-response | `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | role-match |

---

## Pattern Assignments

### `src/application/ports/chat.port.ts` (port, request-response)

**Analog:** `src/application/ports/hash.port.ts` (lines 1-4) and `src/application/ports/token.port.ts` (lines 1-5)

**Imports pattern** — no imports needed for hash.port.ts; chat.port.ts needs one domain import:
```typescript
// src/application/ports/hash.port.ts — lines 1-4
export interface IHashPort {
  hash(plain: string): Promise<string>
  compare(plain: string, hashed: string): Promise<boolean>
}
```

**Core pattern** — single-method port with domain type import (NOT from @prisma/client):
```typescript
// New file — copy structure from hash.port.ts; import domain union, not Prisma enum
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

**Critical:** `ChatInitiator` is `'MATCH' | 'CREDIT'` from `src/domain/entities/chat.entity.ts` (line 1). Do NOT import from `@prisma/client` — that violates the port layer boundary (Pitfall 9 in RESEARCH.md).

---

### `src/adapters/repositories/chat.repository.ts` (repository adapter, CRUD)

**Analog:** `src/adapters/repositories/candidate.repository.ts`

**Imports pattern** (lines 1-5 of candidate.repository.ts):
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { ICandidateRepository } from '../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { Modality } from '../../domain/entities/job.entity'
```

For chat.repository.ts, substitute:
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { IChatRepository, ChatParticipants, ChatListItem } from '../../domain/interfaces/chat.repository.interface'
import { Chat, ChatInitiator } from '../../domain/entities/chat.entity'
import { Message } from '../../domain/entities/message.entity'
```

**Class declaration pattern** (candidate.repository.ts line 6):
```typescript
export class CandidateRepository implements ICandidateRepository {
```

**toDomain pattern** (candidate.repository.ts lines 34-48):
```typescript
private toDomain(row: any): CandidateProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    bio: row.bio,
    lat: row.lat,
    lng: row.lng,
    professionId: row.professionId,
    skills: row.skills,
    preferredModalities: row.preferredModalities as Modality[],
    searchRadiusKm: row.searchRadiusKm,
    salaryExpectation: row.salaryExpectation,
  }
}
```

For chat.repository.ts, the `toDomain` must cast `row.initiatedBy as ChatInitiator` (same Modality-cast pattern):
```typescript
private toDomain(row: any): Chat {
  return {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    companyId: row.companyId,
    initiatedBy: row.initiatedBy as ChatInitiator,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
  }
}
```

**upsert pattern** (candidate.repository.ts lines 21-26):
```typescript
const row = await prisma.candidateProfile.upsert({
  where: { userId },
  create: { userId, ...data },
  update: { ...data },
})
return this.toDomain(row)
```

For chat.repository.ts `createOrGetChat`:
```typescript
// Source: src/modules/chat/chat.repository.ts lines 11-15
async createOrGetChat(candidateId, companyId, jobId, initiator) {
  const row = await prisma.chat.upsert({
    where: { candidateId_companyId_jobId: { candidateId, companyId, jobId } },
    create: { candidateId, companyId, jobId, initiatedBy: initiator, isActive: true },
    update: {}, // No-op if exists — initiatedBy stays as first trigger
  })
  return this.toDomain(row)
}
```

**findParticipants** (new method — maps nested Prisma include to `ChatParticipants`):
```typescript
// Source: src/modules/chat/chat.repository.ts lines 37-49 (findChatWithParticipants)
// IChatRepository requires findParticipants returning ChatParticipants | null
async findParticipants(chatId: string): Promise<ChatParticipants | null> {
  const row = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      candidate: { select: { userId: true } },
      job: { include: { recruiter: { select: { userId: true } } } },
    },
  })
  if (!row) return null
  return {
    candidateUserId: row.candidate.userId,
    recruiterUserId: row.job.recruiter.userId,
  }
}
```

**findByUserId** (complex join → `ChatListItem[]` — Pitfall 6):
```typescript
// Source: src/modules/chat/chat.repository.ts lines 57-76 (findChatsByUserId)
async findByUserId(userId: string): Promise<ChatListItem[]> {
  const rows = await prisma.chat.findMany({
    where: {
      OR: [
        { candidate: { userId } },
        { job: { recruiter: { userId } } },
      ],
    },
    include: {
      candidate: { select: { userId: true, name: true } },
      job: {
        include: {
          recruiter: { select: { userId: true } },
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((chat) => ({
    id: chat.id,
    jobId: chat.jobId,
    initiatedBy: chat.initiatedBy as ChatInitiator,
    isActive: chat.isActive,
    createdAt: chat.createdAt,
    candidateName: chat.candidate.name,
    candidateUserId: chat.candidate.userId,
    companyName: chat.job.company.name,
    recruiterUserId: chat.job.recruiter.userId,
  }))
}
```

---

### `src/adapters/repositories/credit.repository.ts` (repository adapter, CRUD + transaction)

**Analog:** `src/adapters/repositories/company.repository.ts`

**Imports pattern** (company.repository.ts lines 1-5):
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { ICompanyRepository } from '../../domain/interfaces/company.repository.interface'
import { Company } from '../../domain/entities/company.entity'
import { CreditTransaction } from '../../domain/entities/credit-transaction.entity'
import { DomainError } from '../../application/errors/domain.error'
```

For credit.repository.ts:
```typescript
import { Prisma } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { ICreditRepository, RecruiterWithCompany, UnlockResult } from '../../domain/interfaces/credit.repository.interface'
import { Swipe } from '../../domain/entities/swipe.entity'
import { Unlock } from '../../domain/entities/unlock.entity'
import { Job } from '../../domain/entities/job.entity'
import { Company } from '../../domain/entities/company.entity'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { DomainError } from '../../application/errors/domain.error'
```

**Transaction pattern with DomainError** (company.repository.ts lines 18-36 — the canonical atomic pattern):
```typescript
async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant'): Promise<Company> {
  return prisma.$transaction(async (tx) => {
    // Read inside the transaction so the guard and write are atomic —
    // no concurrent request can change the balance between check and update.
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    if (company.credits + delta < 0) {
      throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 400)
    }
    const updated = await tx.company.update({
      where: { id: companyId },
      data: { credits: { increment: delta } },
    })
    await tx.creditTransaction.create({
      data: { companyId, amount: delta, reason },
    })
    return this.toDomain(updated)
  })
}
```

**executeUnlock pattern** — extend the above with P2002 catch (source: src/modules/credits/credits.repository.ts lines 34-54, updated to DomainError):
```typescript
async executeUnlock(companyId, candidateId, jobId, creditsCost): Promise<UnlockResult> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    // In-transaction check required for concurrency safety — TOCTOU protection
    if (company.credits < creditsCost) throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 402)
    await tx.company.update({
      where: { id: companyId },
      data: { credits: { decrement: creditsCost } },
    })
    try {
      const unlock = await tx.unlock.create({
        data: { companyId, candidateId, jobId, creditsCost },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount: -creditsCost, reason: 'candidate_unlock' },
      })
      return { id: unlock.id, companyId: unlock.companyId, candidateId: unlock.candidateId,
               jobId: unlock.jobId, unlockedAt: unlock.unlockedAt, creditsCost: unlock.creditsCost }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)
      }
      throw err
    }
  })
}
```

**toDomain pattern** — same private method style as company.repository.ts lines 45-57.

---

### `src/adapters/repositories/swipe.repository.ts` (repository adapter, CRUD + transaction)

**Analog:** `src/adapters/repositories/company.repository.ts` (transaction) + `src/adapters/repositories/candidate.repository.ts` (toDomain)

**Imports pattern:**
```typescript
import { Prisma } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { ISwipeRepository, SwipeWithCandidateInfo } from '../../domain/interfaces/swipe.repository.interface'
import { Swipe, SwipeDirection } from '../../domain/entities/swipe.entity'
import { Job, Modality } from '../../domain/entities/job.entity'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { RecruiterProfile } from '../../domain/entities/recruiter.entity'
import { DomainError } from '../../application/errors/domain.error'
```

**createSwipe with P2002 catch** (extends company.repository.ts $transaction pattern):
```typescript
async createSwipe(data: { candidateId: string; jobId: string; direction: SwipeDirection }): Promise<Swipe> {
  return prisma.$transaction(async (tx) => {
    try {
      const row = await tx.swipe.create({ data })
      return this.toSwipeDomain(row)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DomainError('Duplicate swipe', 'DUPLICATE_SWIPE', 409)
      }
      throw err
    }
  })
}
```

**findSwipesByJobId with avatarUrl mapping** (Pitfall 5 — flatten user.avatarUrl):
```typescript
// Source: src/modules/swipe/swipe.service.ts lines 113-117 (query) + Pitfall 5 mapping
async findSwipesByJobId(jobId: string): Promise<SwipeWithCandidateInfo[]> {
  const rows = await prisma.swipe.findMany({
    where: { jobId },
    include: {
      candidate: {
        include: { user: { select: { avatarUrl: true } } },
      },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    direction: row.direction as SwipeDirection,
    swipedAt: row.swipedAt,
    candidate: {
      ...this.toCandidateDomain(row.candidate),
      avatarUrl: row.candidate.user.avatarUrl,  // flatten nested user.avatarUrl
    },
  }))
}
```

**findFeedJobs** (cursor pagination — same take limit+1 pattern as modules/chat/chat.repository.ts lines 24-30):
```typescript
async findFeedJobs(candidateId: string, cursor: string | undefined, limit: number): Promise<Job[]> {
  const rows = await prisma.job.findMany({
    where: {
      isActive: true,
      expiresAt: { gt: new Date() },
      swipes: { none: { candidateId } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  return rows.map((r) => this.toJobDomain(r))
}
```

---

### `src/adapters/services/neo4j.adapter.ts` (service adapter, request-response)

**Analog:** `src/adapters/services/bcrypt.adapter.ts`

**Full pattern** (bcrypt.adapter.ts lines 1-12 — implements port, wraps external lib):
```typescript
import bcrypt from 'bcryptjs'
import { IHashPort } from '../../application/ports/hash.port'

export class BcryptAdapter implements IHashPort {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12)
  }
  async compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed)
  }
}
```

For neo4j.adapter.ts — same `implements <Port>` pattern, wraps inner class (avoid re-instantiation per Pitfall 8):
```typescript
import { Driver } from 'neo4j-driver'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../domain/interfaces/recommendation.repository.interface'
import { RecommendationRepository } from '../../modules/recommendation/recommendation.repository'

export class Neo4jAdapter implements IRecommendationRepository {
  private readonly inner: RecommendationRepository

  constructor(driver: Driver) {
    this.inner = new RecommendationRepository(driver)
  }

  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number> {
    return this.inner.computeFitScore(candidate, job)
  }

  async seedTaxonomy(): Promise<void> {
    return this.inner.seedTaxonomy()
  }
}
```

---

### `src/adapters/controllers/chat.controller.ts` (controller, request-response)

**Analog:** `src/adapters/controllers/candidate.controller.ts`

**Imports pattern** (candidate.controller.ts lines 1-6):
```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CandidateRepository } from '../repositories/candidate.repository'
import { UpsertCandidateProfileUseCase } from '../../application/use-cases/candidate/upsert-candidate-profile.use-case'
import { GetCandidateProfileUseCase } from '../../application/use-cases/candidate/get-candidate-profile.use-case'
import { DomainError } from '../../application/errors/domain.error'
```

**Handler pattern** (candidate.controller.ts lines 21-34 — Zod parse → use case → DomainError catch):
```typescript
async upsertProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = CandidateProfileSchema.parse(request.body)
  const useCase = new UpsertCandidateProfileUseCase(new CandidateRepository())
  try {
    const profile = await useCase.execute(request.user.id, body)
    reply.status(200).send(profile)
  } catch (err) {
    if (err instanceof DomainError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code })
      return
    }
    throw err
  }
}
```

**For chat.controller.ts** — Zod schemas go at top of file, each handler instantiates its use case with `new ChatRepository()`:
```typescript
const ChatIdParamsSchema = z.object({ chatId: z.string().uuid() })
const MessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export class ChatController {
  async listChats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = new ListChatsUseCase(new ChatRepository())
    try {
      const chats = await useCase.execute(request.user.id)
      reply.status(200).send(chats)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
  // ... getMessages follows same pattern
}
```

---

### `src/adapters/controllers/swipe.controller.ts` (controller, request-response)

**Analog:** `src/adapters/controllers/company.controller.ts`

**Multi-schema, multi-handler pattern** (company.controller.ts lines 9-19 — schemas at top, class methods):
```typescript
const CreateCompanySchema = z.object({ ... })
const CompanyParamsSchema = z.object({ id: z.string().uuid() })
const AdjustCreditsSchema = z.object({ amount: z.number().int().positive() })

export class CompanyController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = CreateCompanySchema.parse(request.body)
    const useCase = new CreateCompanyUseCase(new CompanyRepository())
    try {
      const result = await useCase.execute(body)
      reply.status(201).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
```

**For swipe.controller.ts** — receives `opts: { neo4j: IRecommendationRepository, chat: IChatPort }` through constructor or per-handler. Zod schemas from current swipe.routes.ts lines 12-19:
```typescript
// Source: src/modules/swipe/swipe.routes.ts lines 12-19
const SwipeBodySchema = z.object({
  jobId: z.string().uuid(),
  direction: z.enum(['LIKE', 'DISLIKE']),
})
const FeedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
})
const JobIdParamsSchema = z.object({ jobId: z.string().uuid() })
```

Handler status codes: `recordSwipe` → 201, `getFeed` → 200, `getRanking` → 200.

---

### `src/adapters/controllers/credits.controller.ts` (controller, request-response)

**Analog:** `src/adapters/controllers/company.controller.ts`

**Pattern** — same handler structure. Additionally calls `creditRepo.findCandidateProfileById` and `creditRepo.findJobById` for enriched response (controller-level response shaping — acceptable per RESEARCH.md Q5 resolution):

```typescript
// Source: src/modules/credits/credits.routes.ts lines 23-55 — enrichment logic moves to controller
// Source: src/adapters/controllers/company.controller.ts — DomainError catch pattern

import { haversineKm } from '../../../shared/utils/haversine'

const UnlockParamsSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
})

export class CreditsController {
  constructor(private readonly chat: IChatPort) {}

  async unlock(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { jobId, candidateId } = UnlockParamsSchema.parse(request.params)
    const creditRepo = new CreditRepository()
    const useCase = new UnlockCandidateUseCase(creditRepo, this.chat)
    try {
      const unlock = await useCase.execute(request.user.id, jobId, candidateId)
      // Response enrichment — controller concern, not business logic
      const [candidateProfile, job] = await Promise.all([
        creditRepo.findCandidateProfileById(candidateId),
        creditRepo.findJobById(jobId),
      ])
      const distanceKm = candidateProfile && job
        ? haversineKm(candidateProfile.lat, candidateProfile.lng, job.lat, job.lng)
        : null
      reply.status(201).send({ ...unlock, profile: candidateProfile ? { ...candidateProfile, distanceKm } : null })
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
```

**Note:** `CreditsController` receives `chat: IChatPort` through constructor (unlike candidate/company controllers which are stateless). This is needed because `UnlockCandidateUseCase` requires `IChatPort`.

---

### `src/infrastructure/http/routes/chat.routes.ts` (route + WS gateway, event-driven)

**Analog:** `src/modules/chat/chat.routes.ts` — copy verbatim with three changes

**Connection management — copy verbatim** (src/modules/chat/chat.routes.ts lines 9-37):
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
    if (room.size === 0) connections.delete(chatId)
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
```

**IChatRouteService interface** (src/modules/chat/chat.routes.ts lines 50-59 — move to infrastructure file):
```typescript
import type { IChatService } from '../../../shared/interfaces/chat.interface'

export interface IChatRouteService extends IChatService {
  verifyParticipant(chatId: string, userId: string): Promise<boolean>
  getMessages(
    chatId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ data: object[]; nextCursor: string | null }>
  listChats(userId: string): Promise<object[]>
}
```

**WS handler error catch — UPDATE** (src/modules/chat/chat.routes.ts line 119 — change `AppError` to `DomainError`):
```typescript
// OLD (from modules/chat/chat.routes.ts line 119):
const code = err instanceof AppError ? err.code : 'SEND_ERROR'

// NEW (in infrastructure/http/routes/chat.routes.ts):
import { DomainError } from '../../../application/errors/domain.error'
// ...
const code = err instanceof DomainError ? err.code
           : err instanceof AppError ? err.code
           : 'SEND_ERROR'
```

**Import path changes:**
```typescript
// OLD (modules/chat/chat.routes.ts):
import { authenticate } from '../../shared/hooks/authenticate'

// NEW (infrastructure/http/routes/chat.routes.ts):
import { authenticate } from '../plugins/authenticate.hook'
```

---

### `src/infrastructure/http/routes/swipe.routes.ts` (dual-export route, request-response)

**Analog:** `src/modules/swipe/swipe.routes.ts` — restructure to use controller pattern

**Dual-export pattern** (src/modules/swipe/swipe.routes.ts lines 22-36 and 42-66):
```typescript
// Source: src/modules/swipe/swipe.routes.ts lines 23, 43
export async function swipeRoutes(app: FastifyInstance, opts: { chat: IChatService }): Promise<void> { ... }
export async function swipeJobRoutes(app: FastifyInstance, opts: { chat: IChatService }): Promise<void> { ... }
```

**New opts shape** — add `neo4j` parameter:
```typescript
import { IChatPort } from '../../../application/ports/chat.port'
import { IRecommendationRepository } from '../../../domain/interfaces/recommendation.repository.interface'

type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository }

export async function swipeRoutes(app: FastifyInstance, opts: SwipeRouteOpts): Promise<void> {
  const ctrl = new SwipeController(opts)
  app.post('/', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, ctrl.recordSwipe.bind(ctrl))
}

export async function swipeJobRoutes(app: FastifyInstance, opts: SwipeRouteOpts): Promise<void> {
  const ctrl = new SwipeController(opts)
  // CRITICAL: /feed BEFORE /:jobId/ranking (Pitfall 1 — static before parameterized)
  app.get('/feed', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getFeed.bind(ctrl))
  app.get('/:jobId/ranking', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.getRanking.bind(ctrl))
}
```

**Rate limit pattern** (src/modules/swipe/swipe.routes.ts lines 29-31):
```typescript
app.post('/', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  preHandler: [authenticate, requireRole('CANDIDATE')],
}, ctrl.recordSwipe.bind(ctrl))
```

**Authenticate import path** (infrastructure layer):
```typescript
// Infrastructure routes use plugins/authenticate.hook (not shared/hooks/authenticate)
import { authenticate } from '../plugins/authenticate.hook'
```

---

### `src/infrastructure/http/routes/credits.routes.ts` (route, request-response)

**Analog:** `src/infrastructure/http/routes/candidate.routes.ts`

**Routes-with-opts pattern** (candidate.routes.ts lines 1-11):
```typescript
import { FastifyInstance } from 'fastify'
import { CandidateController } from '../../../adapters/controllers/candidate.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new CandidateController()
  app.put('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.upsertProfile.bind(ctrl))
  app.get('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getProfile.bind(ctrl))
}
```

For credits.routes.ts — adds opts parameter (IChatPort must be passed through to controller):
```typescript
import { FastifyInstance } from 'fastify'
import { CreditsController } from '../../../adapters/controllers/credits.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'
import { IChatPort } from '../../../application/ports/chat.port'

export async function creditsJobRoutes(app: FastifyInstance, opts: { chat: IChatPort }): Promise<void> {
  const ctrl = new CreditsController(opts.chat)
  app.post('/:jobId/candidates/:candidateId/unlock', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, ctrl.unlock.bind(ctrl))
}
```

---

### `src/application/use-cases/chat/create-or-get-chat.use-case.ts` (use case, CRUD)

**Analog:** `src/application/use-cases/company/adjust-company-credits.use-case.ts`

**Full pattern** (adjust-company-credits.use-case.ts lines 1-11):
```typescript
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'

export class AdjustCompanyCreditsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(companyId: string, delta: number, reason?: string): Promise<Company> {
    return this.repo.adjustCredits(companyId, delta, reason)
  }
}
```

For create-or-get-chat.use-case.ts:
```typescript
import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { ChatInitiator } from '../../../domain/entities/chat.entity'

export class CreateOrGetChatUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(candidateId: string, companyId: string, jobId: string, initiator: ChatInitiator): Promise<{ chatId: string }> {
    const chat = await this.repo.createOrGetChat(candidateId, companyId, jobId, initiator)
    return { chatId: chat.id }
  }
}
```

---

### `src/application/use-cases/chat/send-message.use-case.ts` (use case, CRUD)

**Analog:** `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` (constructor pattern)

**Multi-step guard pattern** — DomainError for each guard condition, same `(message, code, statusCode)` argument order as `src/application/errors/domain.error.ts`:
```typescript
import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { Message } from '../../../domain/entities/message.entity'
import { DomainError } from '../../errors/domain.error'

export class SendMessageUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(chatId: string, senderId: string, content: string): Promise<Message> {
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) throw new DomainError('Chat not found', 'NOT_FOUND', 404)

    const { candidateUserId, recruiterUserId } = participants
    const isParticipant = senderId === candidateUserId || senderId === recruiterUserId
    if (!isParticipant) throw new DomainError('Not a participant', 'NOT_PARTICIPANT', 403)

    // Recruiter-first rule: first message in a LIKE-initiated chat must come from recruiter
    const recruiterCount = await this.repo.countRecruiterMessages(chatId, recruiterUserId)
    if (recruiterCount === 0 && senderId !== recruiterUserId) {
      throw new DomainError('Recruiter must send first message', 'RECRUITER_MUST_INITIATE', 403)
    }

    return this.repo.createMessage(chatId, senderId, content)
  }
}
```

---

### `src/application/use-cases/chat/verify-participant.use-case.ts` (use case, request-response)

**Analog:** `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` (constructor pattern)

**Returns boolean — does NOT throw** (same as current ChatService.verifyParticipant):
```typescript
import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'

export class VerifyParticipantUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(chatId: string, userId: string): Promise<boolean> {
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) return false
    return userId === participants.candidateUserId || userId === participants.recruiterUserId
  }
}
```

---

### `src/application/use-cases/chat/get-messages.use-case.ts` (use case, CRUD)

**Analog:** `src/application/use-cases/company/adjust-company-credits.use-case.ts`

```typescript
import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { DomainError } from '../../errors/domain.error'

export class GetMessagesUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(chatId: string, userId: string, cursor: string | undefined, limit: number) {
    // Participant check — throws DomainError instead of returning false (unlike VerifyParticipantUseCase)
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) throw new DomainError('Chat not found', 'NOT_FOUND', 404)
    const isParticipant = userId === participants.candidateUserId || userId === participants.recruiterUserId
    if (!isParticipant) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const messages = await this.repo.findMessages(chatId, cursor, limit)
    const hasNext = messages.length > limit
    const data = hasNext ? messages.slice(0, limit) : messages
    const nextCursor = hasNext ? data[data.length - 1].id : null

    await this.repo.markMessagesRead(chatId, userId)
    return { data, nextCursor }
  }
}
```

---

### `src/application/use-cases/chat/list-chats.use-case.ts` (use case, CRUD)

**Analog:** `src/application/use-cases/company/adjust-company-credits.use-case.ts`

```typescript
import { IChatRepository, ChatListItem } from '../../../domain/interfaces/chat.repository.interface'

export class ListChatsUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(userId: string): Promise<ChatListItem[]> {
    return this.repo.findByUserId(userId)
  }
}
```

---

### `src/application/use-cases/credits/credits.constants.ts` (constants)

**Pattern:** inline export constant — no analog needed:
```typescript
export const UNLOCK_COST_BY_PLAN: Record<string, number> = {
  FREE: 2,
  PRO: 1,
}
```

---

### `src/application/use-cases/credits/unlock-candidate.use-case.ts` (use case, CRUD + transaction)

**Analog:** `src/application/use-cases/company/adjust-company-credits.use-case.ts` (single-repo constructor) — extended with second port dependency

**Multi-dependency constructor pattern** — receives `ICreditRepository` AND `IChatPort` (no concrete classes):
```typescript
import { ICreditRepository } from '../../../domain/interfaces/credit.repository.interface'
import { IChatPort } from '../../ports/chat.port'
import { DomainError } from '../../errors/domain.error'
import { UNLOCK_COST_BY_PLAN } from './credits.constants'

export class UnlockCandidateUseCase {
  constructor(
    private readonly repo: ICreditRepository,
    private readonly chat: IChatPort,
  ) {}

  async execute(userId: string, jobId: string, candidateId: string): Promise<{ id: string; companyId: string; candidateId: string; jobId: string; unlockedAt: Date; creditsCost: number; chatId: string }> {
    const recruiter = await this.repo.findRecruiterByUserId(userId)
    if (!recruiter) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (job.recruiterId !== recruiter.id) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const swipe = await this.repo.findSwipe(candidateId, jobId)
    if (!swipe) throw new DomainError('Candidate not found on this job', 'NOT_FOUND', 404)
    if (swipe.direction !== 'DISLIKE') throw new DomainError('Candidate is already visible', 'CANDIDATE_ALREADY_VISIBLE', 422)

    const existing = await this.repo.findUnlock(recruiter.companyId, candidateId, jobId)
    if (existing) throw new DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)

    const cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']
    const unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)

    const { chatId } = await this.chat.createOrGetChat(candidateId, recruiter.companyId, jobId, 'CREDIT')
    return { ...unlock, chatId }
  }
}
```

**Critical:** No `@prisma/client` import. `SwipeDirection` comparison uses string literal `'DISLIKE'` (domain entities use string unions, not Prisma enums). P2002 handling lives in `CreditRepository.executeUnlock`, not here.

---

### `src/application/use-cases/credits/grant-credits.use-case.ts` (use case, CRUD)

**Analog:** `src/application/use-cases/company/adjust-company-credits.use-case.ts`

```typescript
import { ICreditRepository } from '../../../domain/interfaces/credit.repository.interface'
import { Company } from '../../../domain/entities/company.entity'
import { DomainError } from '../../errors/domain.error'

export class GrantCreditsUseCase {
  constructor(private readonly repo: ICreditRepository) {}

  async execute(companyId: string, amount: number, reason: string): Promise<Company> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)
    }
    return this.repo.grantCredits(companyId, amount, reason)
  }
}
```

---

### `src/application/use-cases/swipe/record-swipe.use-case.ts` (use case, CRUD + transaction)

**Analog:** `src/application/use-cases/credits/unlock-candidate.use-case.ts` (multi-port constructor)

**Source logic:** `src/modules/swipe/swipe.service.ts` lines 33-64 — translated with three changes:
1. No `Prisma` import — P2002 moves to SwipeRepository
2. `SwipeDirection` from domain entity, not `@prisma/client`
3. `ChatInitiator` string literal `'MATCH'` — not Prisma enum

```typescript
import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IChatPort } from '../../ports/chat.port'
import { Swipe, SwipeDirection } from '../../../domain/entities/swipe.entity'
import { DomainError } from '../../errors/domain.error'

export class RecordSwipeUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly chat: IChatPort,
  ) {}

  async execute(userId: string, jobId: string, direction: SwipeDirection): Promise<Swipe & { chatId: string | null }> {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (!job.isActive || job.expiresAt <= new Date()) throw new DomainError('Job not found', 'NOT_FOUND', 404)

    // P2002 catch lives in SwipeRepository.createSwipe — throws DomainError('Duplicate swipe', 'DUPLICATE_SWIPE', 409)
    const swipe = await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })

    let chatId: string | null = null
    if (direction === 'LIKE') {
      const result = await this.chat.createOrGetChat(candidate.id, job.companyId, jobId, 'MATCH')
      chatId = result.chatId
    }

    return { ...swipe, chatId }
  }
}
```

---

### `src/application/use-cases/swipe/get-feed.use-case.ts` (use case, request-response)

**Source logic:** `src/modules/swipe/swipe.service.ts` lines 67-103 — translated

**Key change vs source:** `IRecommendationRepository.computeFitScore` requires `FitScoreInput` (with `id` field). Construct explicitly:

```typescript
import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'

export class GetFeedUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
  ) {}

  async execute(userId: string, cursor: string | undefined, limit: number) {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    const jobs = await this.repo.findFeedJobs(candidate.id, cursor, limit)
    const hasNext = jobs.length > limit
    const data = hasNext ? jobs.slice(0, limit) : jobs
    const nextCursor = hasNext ? data[data.length - 1].id : null

    // FitScoreInput requires id — add explicitly (Pitfall 3)
    const scoredData = await Promise.all(
      data.map(async (job) => ({
        ...job,
        fitScore: await this.rec.computeFitScore(
          { id: candidate.id, professionId: candidate.professionId, skills: candidate.skills,
            preferredModalities: candidate.preferredModalities, salaryExpectation: candidate.salaryExpectation,
            lat: candidate.lat, lng: candidate.lng, searchRadiusKm: candidate.searchRadiusKm ?? 50 } satisfies FitScoreInput,
          { id: job.id, professionId: job.professionId, requiredSkills: job.requiredSkills,
            modality: job.modality, salaryMin: job.salaryMin ?? null, salaryMax: job.salaryMax ?? null,
            lat: job.lat ?? null, lng: job.lng ?? null } satisfies FitScoreJobInput,
        ),
      })),
    )
    return { data: scoredData, nextCursor }
  }
}
```

---

### `src/application/use-cases/swipe/get-ranking.use-case.ts` (use case, request-response)

**Source logic:** `src/modules/swipe/swipe.service.ts` lines 105-166 — translated

**Same FitScoreInput with `id` field** pattern (Pitfall 3). `haversineKm` imported from shared utils:

```typescript
import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { haversineKm } from '../../../shared/utils/haversine'

export class GetRankingUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
  ) {}

  async execute(userId: string, jobId: string) {
    const recruiterProfile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!recruiterProfile) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (job.recruiterId !== recruiterProfile.id) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const swipes = await this.repo.findSwipesByJobId(jobId)
    const unlockedCandidateIds = await this.repo.findUnlocksByJobAndCompany(jobId, recruiterProfile.companyId)

    const items = await Promise.all(
      swipes.map(async (swipe) => {
        const fitScore = await this.rec.computeFitScore(
          { id: swipe.candidate.id, professionId: swipe.candidate.professionId, skills: swipe.candidate.skills,
            preferredModalities: swipe.candidate.preferredModalities, salaryExpectation: swipe.candidate.salaryExpectation,
            lat: swipe.candidate.lat, lng: swipe.candidate.lng, searchRadiusKm: swipe.candidate.searchRadiusKm ?? 50 },
          { id: job.id, professionId: job.professionId, requiredSkills: job.requiredSkills,
            modality: job.modality, salaryMin: job.salaryMin ?? null, salaryMax: job.salaryMax ?? null,
            lat: job.lat ?? null, lng: job.lng ?? null },
        )
        return {
          candidateId: swipe.candidateId,
          fitScore,
          distanceKm: haversineKm(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng),
          profile: swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
            ? { name: swipe.candidate.name, avatarUrl: swipe.candidate.avatarUrl, bio: swipe.candidate.bio,
                skills: swipe.candidate.skills, professionId: swipe.candidate.professionId,
                preferredModalities: swipe.candidate.preferredModalities, salaryExpectation: swipe.candidate.salaryExpectation }
            : null,
        }
      }),
    )

    return items
      .sort((a, b) => b.fitScore - a.fitScore)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  }
}
```

---

## Shared Patterns

### DomainError Constructor — Argument Order
**Source:** `src/application/errors/domain.error.ts` (lines 1-11)
**Apply to:** All use-case files, all repository adapters
```typescript
// DomainError(message: string, code: string, statusCode: number)
throw new DomainError('Company not found', 'NOT_FOUND', 404)
throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 402)
throw new DomainError('Duplicate swipe', 'DUPLICATE_SWIPE', 409)
```

### Controller Error Handler Block
**Source:** `src/adapters/controllers/company.controller.ts` (lines 28-34)
**Apply to:** All controller handler methods (`chat.controller.ts`, `swipe.controller.ts`, `credits.controller.ts`)
```typescript
} catch (err) {
  if (err instanceof DomainError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code })
    return
  }
  throw err
}
```

### Authentication Middleware Import Path
**Source:** `src/infrastructure/http/routes/company.routes.ts` (line 3) and `src/infrastructure/http/routes/candidate.routes.ts` (line 3)
**Apply to:** All infrastructure route files
```typescript
// Infrastructure routes use authenticate.hook, NOT shared/hooks/authenticate
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'
```

### Repository Prisma Import Path
**Source:** `src/adapters/repositories/company.repository.ts` (line 1)
**Apply to:** All repository adapters (`chat.repository.ts`, `swipe.repository.ts`, `credit.repository.ts`)
```typescript
// Adapters use infrastructure/database/prisma, NOT shared/db/prisma (used in modules/)
import { prisma } from '../../infrastructure/database/prisma'
```

### Use-Case Constructor (interface-only dependencies)
**Source:** `src/application/use-cases/company/adjust-company-credits.use-case.ts` (lines 4-5)
**Apply to:** ALL use-case files — no concrete class imports ever
```typescript
// Only interface types in constructor — never concrete classes
constructor(private readonly repo: ICompanyRepository) {}
```

### Prisma Modality / ChatInitiator Enum Cast in toDomain
**Source:** `src/adapters/repositories/candidate.repository.ts` (line 44)
**Apply to:** `chat.repository.ts` (ChatInitiator), `swipe.repository.ts` (Modality, SwipeDirection), `credit.repository.ts`
```typescript
// Cast Prisma string enums to domain union types
preferredModalities: row.preferredModalities as Modality[]
initiatedBy: row.initiatedBy as ChatInitiator
direction: row.direction as SwipeDirection
```

### Route Registration — ctrl.method.bind(ctrl)
**Source:** `src/infrastructure/http/routes/company.routes.ts` (line 9), `src/infrastructure/http/routes/candidate.routes.ts` (lines 9-10)
**Apply to:** All infrastructure route files
```typescript
app.post('/', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.create.bind(ctrl))
app.get('/:id', { preHandler: [authenticate] }, ctrl.getById.bind(ctrl))
```

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Critical Cross-Cutting Notes for Planner

| Issue | Files Affected | Rule |
|---|---|---|
| No `@prisma/client` in use cases | All `use-cases/**/*.ts` | Import domain types from `domain/entities/` only; Prisma imports only in `adapters/repositories/` |
| Dual export in swipe.routes.ts | `swipe.routes.ts` | Export BOTH `swipeRoutes` AND `swipeJobRoutes`; app.ts registers both |
| Static route before parameterized | `swipe.routes.ts` | `GET /feed` MUST be registered before `GET /:jobId/ranking` (Pitfall 1) |
| WS handler catches DomainError not AppError | `chat.routes.ts` | Update catch to `err instanceof DomainError` (Pitfall 4) |
| SwipeWithCandidateInfo.avatarUrl | `swipe.repository.ts` | Flatten `candidate.user.avatarUrl` into `candidate.avatarUrl` in toDomain mapper (Pitfall 5) |
| ChatListItem requires explicit mapping | `chat.repository.ts` | Map all 8 fields explicitly; do not return raw Prisma row (Pitfall 6) |
| Credits enrichment in controller | `credits.controller.ts` | Controller calls repo for `findCandidateProfileById`/`findJobById` — acceptable (Pitfall 7 is not a bug) |
| IChatPort imports domain ChatInitiator | `chat.port.ts` | Import from `domain/entities/chat.entity`, not `@prisma/client` (Pitfall 9) |
| P2002 handling in repo, not use case | `swipe.repository.ts`, `credit.repository.ts` | Catch `Prisma.PrismaClientKnownRequestError` P2002 inside `$transaction` and throw `DomainError` (Q9, Q10) |

---

## Metadata

**Analog search scope:** `src/adapters/`, `src/application/`, `src/infrastructure/`, `src/modules/`
**Files scanned:** 18 analog files read
**Pattern extraction date:** 2026-05-09
