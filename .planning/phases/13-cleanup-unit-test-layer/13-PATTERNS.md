# Phase 13: Cleanup + Unit Test Layer — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 17 (7 new files + 10 modified files)
**Analogs found:** 17 / 17

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/application/utils/haversine.ts` | utility | transform | `src/shared/utils/haversine.ts` | exact (verbatim move) |
| `src/adapters/services/chat.service.ts` | service | request-response | `src/modules/chat/chat.service.ts` | exact (verbatim move, import swap) |
| `src/adapters/services/credit.service.ts` | service | CRUD | `src/modules/credits/credits.service.ts` | exact (verbatim move, import swap) |
| `src/adapters/services/recommendation.repository.ts` | service | request-response | `src/modules/recommendation/recommendation.repository.ts` | exact (verbatim move, import swap) |
| `src/infrastructure/http/plugins/require-role.hook.ts` | middleware | request-response | `src/shared/hooks/requireRole.ts` | exact (verbatim move, import swap) |
| `src/infrastructure/http/plugins/error-handler.ts` | middleware | request-response | `src/shared/errors/errorHandler.ts` | exact (verbatim move, import swap) |
| `src/infrastructure/http/errors/app.error.ts` | utility | — | `src/shared/errors/AppError.ts` | exact (verbatim move) |
| `src/infrastructure/http/routes/health.routes.ts` | route | request-response | `src/modules/health/health.routes.ts` | exact (import swap only) |
| `scripts/check-deps.ts` | utility | batch | — | no analog (new pattern from RESEARCH.md) |
| `src/app.ts` | config | request-response | `src/app.ts` (self, import surgery) | — |
| `jest.config.ts` | config | — | `jest.config.ts` (self, alias removal) | — |
| `tests/unit/register.use-case.test.ts` | test | request-response | `tests/unit/chat.service.test.ts` | role-match (unit, mocked interfaces) |
| `tests/unit/upsert-candidate-profile.use-case.test.ts` | test | CRUD | `tests/unit/chat.service.test.ts` | role-match |
| `tests/unit/create-job.use-case.test.ts` | test | CRUD | `tests/unit/chat.service.test.ts` | role-match |
| `tests/unit/record-swipe.use-case.test.ts` | test | event-driven | `tests/unit/swipe.service.test.ts` | exact (same use case, new class) |
| `tests/unit/unlock-candidate.use-case.test.ts` | test | CRUD | `tests/unit/credit.service.test.ts` | exact (same use case, new class) |
| `tests/unit/create-or-get-chat.use-case.test.ts` | test | request-response | `tests/unit/chat.service.test.ts` | exact (same use case, new class) |

---

## Pattern Assignments

### `src/application/utils/haversine.ts` (utility, transform)

**Analog:** `src/shared/utils/haversine.ts`
**Action:** Verbatim copy — no content changes needed.

**Full file** (`src/shared/utils/haversine.ts`, lines 1-17):
```typescript
export function haversineKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
```

**Import updates required after move:**
- `src/application/use-cases/swipe/get-ranking.use-case.ts` line 4: `from '../../../shared/utils/haversine'` → `from '../../utils/haversine'`
- `src/adapters/controllers/credits.controller.ts` line 6: `from '../../shared/utils/haversine'` → `from '../../application/utils/haversine'`

---

### `src/adapters/services/chat.service.ts` (service, request-response)

**Analog:** `src/modules/chat/chat.service.ts`
**Action:** Verbatim copy with 2 import swaps.

**Imports to change** (`src/modules/chat/chat.service.ts`, lines 1-4 → new version):
```typescript
// OLD (lines 1-4):
import { AppError } from '../../shared/errors/AppError'
import { ChatInitiator } from '@prisma/client'
import type { IChatService } from '../../shared/interfaces/chat.interface'
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface'

// NEW (src/adapters/services/chat.service.ts):
import { DomainError } from '../../application/errors/domain.error'
import { ChatInitiator } from '../../domain/entities/chat.entity'
import type { IChatPort } from '../../application/ports/chat.port'
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface'
```

**Class declaration change** (line 6):
```typescript
// OLD:
export class ChatService implements IChatService {

// NEW:
export class ChatService implements IChatPort {
```

**Error throw pattern change** (all `new AppError(msg, status, code)` → `new DomainError(msg, code, status)`):
```typescript
// OLD pattern (lines 32, 38, 44, 63):
throw new AppError('Chat not found', 404, 'NOT_FOUND')
throw new AppError('Not a participant', 403, 'NOT_PARTICIPANT')
throw new AppError('Recruiter must send first message', 403, 'RECRUITER_MUST_INITIATE')
throw new AppError('Not a participant', 403, 'NOT_PARTICIPANT')

// NEW pattern (note argument order reversal: msg, code, status):
throw new DomainError('Chat not found', 'NOT_FOUND', 404)
throw new DomainError('Not a participant', 'NOT_PARTICIPANT', 403)
throw new DomainError('Recruiter must send first message', 'RECRUITER_MUST_INITIATE', 403)
throw new DomainError('Not a participant', 'NOT_PARTICIPANT', 403)
```

**Core class body** (`src/modules/chat/chat.service.ts`, lines 6-91) — copy verbatim after import/throw fixes.

---

### `src/adapters/services/credit.service.ts` (service, CRUD)

**Analog:** `src/modules/credits/credits.service.ts`
**Action:** Verbatim copy with import swaps and error pattern update.

**Imports to change** (`src/modules/credits/credits.service.ts`, lines 1-6 → new version):
```typescript
// OLD:
import { AppError } from '../../shared/errors/AppError'
import { ChatInitiator } from '@prisma/client'
import { UNLOCK_COST_BY_PLAN } from './credits.constants'
import type { IChatService } from '../../shared/interfaces/chat.interface'
import type { ICreditRepository } from '../../domain/interfaces/credit.repository.interface'
import { DomainError } from '../../application/errors/domain.error'

// NEW (src/adapters/services/credit.service.ts):
import { ChatInitiator } from '../../domain/entities/chat.entity'
import { UNLOCK_COST_BY_PLAN } from '../use-cases/credits/credits.constants'
import type { IChatPort } from '../../application/ports/chat.port'
import type { ICreditRepository } from '../../domain/interfaces/credit.repository.interface'
import { DomainError } from '../../application/errors/domain.error'
```

**Constructor injection type change** (line 10):
```typescript
// OLD:
private readonly chat: IChatService,

// NEW:
private readonly chat: IChatPort,
```

**Error throw pattern** — replace all `new AppError(msg, status, code)` with `new DomainError(msg, code, status)`:
```typescript
// OLD (lines 15, 18, 20, 23, 24, 27, 28, 52):
throw new AppError('Forbidden', 403, 'FORBIDDEN')
throw new AppError('Job not found', 404, 'NOT_FOUND')
// etc.

// NEW:
throw new DomainError('Forbidden', 'FORBIDDEN', 403)
throw new DomainError('Job not found', 'NOT_FOUND', 404)
// etc.
```

**Remove try/catch DomainError re-throw** (lines 32-39 in original — this was a compatibility shim no longer needed):
```typescript
// DELETE this block entirely:
try {
  unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)
} catch (err) {
  if (err instanceof DomainError) {
    throw new AppError(err.message, err.statusCode, err.code)
  }
  throw err
}
// REPLACE with direct assignment:
const unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)
```

**ChatInitiator enum usage** (line 42):
```typescript
// OLD (Prisma enum):
ChatInitiator.CREDIT,

// NEW (domain entity string literal):
'CREDIT' as ChatInitiator,
// OR keep as domain ChatInitiator if the entity exports it as a string union — check domain/entities/chat.entity.ts
```

---

### `src/adapters/services/recommendation.repository.ts` (service, request-response)

**Analog:** `src/modules/recommendation/recommendation.repository.ts`
**Action:** Verbatim copy with 1 import swap.

**Import to change** (`src/modules/recommendation/recommendation.repository.ts`, line 4):
```typescript
// OLD:
import type { IRecommendationService, CandidateData, JobData } from '../../shared/interfaces/recommendation.interface'

// NEW (src/adapters/services/recommendation.repository.ts):
import type {
  IRecommendationRepository,
  FitScoreInput,
  FitScoreJobInput,
} from '../../domain/interfaces/recommendation.repository.interface'
```

**Class declaration change** (line 16):
```typescript
// OLD:
export class RecommendationRepository implements IRecommendationService {

// NEW:
export class RecommendationRepository implements IRecommendationRepository {
```

**Method signature rename** (line 19 — structurally equivalent, just renamed types):
```typescript
// OLD:
async computeFitScore(candidate: CandidateData, job: JobData): Promise<number> {

// NEW:
async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number> {
```

**neo4j.adapter.ts import update** (`src/adapters/services/neo4j.adapter.ts`, line 7):
```typescript
// OLD:
import { RecommendationRepository } from '../../modules/recommendation/recommendation.repository'

// NEW:
import { RecommendationRepository } from './recommendation.repository'
```

---

### `src/infrastructure/http/plugins/require-role.hook.ts` (middleware, request-response)

**Analog:** `src/shared/hooks/requireRole.ts`
**Action:** Verbatim copy with 1 import swap.

**Import to change** (`src/shared/hooks/requireRole.ts`, line 2):
```typescript
// OLD:
import { AppError } from '../errors/AppError'

// NEW (src/infrastructure/http/plugins/require-role.hook.ts):
import { DomainError } from '../../../application/errors/domain.error'
```

**Throw pattern change** (lines 17, 20):
```typescript
// OLD:
throw new AppError('authenticate hook missing before requireRole', 500, 'INTERNAL')
throw new AppError('Forbidden', 403, 'FORBIDDEN')

// NEW:
throw new DomainError('authenticate hook missing before requireRole', 'INTERNAL', 500)
throw new DomainError('Forbidden', 'FORBIDDEN', 403)
```

**Core pattern** (`src/shared/hooks/requireRole.ts`, lines 4-23) — copy verbatim after fixes:
```typescript
type Role = 'CANDIDATE' | 'RECRUITER' | 'ADMIN'

export function requireRole(...roles: Role[]) {
  return async function roleGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new DomainError('authenticate hook missing before requireRole', 'INTERNAL', 500)
    }
    if (!roles.includes(request.user.role)) {
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    }
  }
}
```

**8 infrastructure route files import update** — replace in all 8 files:
```typescript
// OLD (in admin.routes.ts, candidate.routes.ts, chat.routes.ts, company.routes.ts,
//      credits.routes.ts, job.routes.ts, recruiter.routes.ts, swipe.routes.ts):
import { requireRole } from '../../../shared/hooks/requireRole'

// NEW:
import { requireRole } from '../plugins/require-role.hook'
```

---

### `src/infrastructure/http/errors/app.error.ts` (utility)

**Analog:** `src/shared/errors/AppError.ts`
**Action:** Verbatim copy — no content changes.

**Full file** (`src/shared/errors/AppError.ts`, lines 1-12):
```typescript
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'AppError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
```

---

### `src/infrastructure/http/plugins/error-handler.ts` (middleware, request-response)

**Analog:** `src/shared/errors/errorHandler.ts`
**Action:** Verbatim copy with 2 import swaps.

**Imports to change** (`src/shared/errors/errorHandler.ts`, lines 1-5 → new version):
```typescript
// OLD:
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from './AppError'
import { DomainError } from '../../application/errors/domain.error'

// NEW (src/infrastructure/http/plugins/error-handler.ts):
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from '../errors/app.error'
import { DomainError } from '../../../application/errors/domain.error'
```

**Function body** (lines 7-64) — copy verbatim.

---

### `src/infrastructure/http/routes/health.routes.ts` (route, request-response)

**Analog:** `src/modules/health/health.routes.ts`
**Action:** Copy with 1 import swap.

**Import to change** (`src/modules/health/health.routes.ts`, line 2):
```typescript
// OLD:
import { prisma } from '../../shared/db/prisma'

// NEW (src/infrastructure/http/routes/health.routes.ts):
import { prisma } from '../../database/prisma'
```

**Core route body** (lines 4-14) — copy verbatim:
```typescript
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return reply.status(200).send({ status: 'ok', db: 'connected' })
    } catch {
      return reply.status(503).send({ status: 'error', db: 'disconnected' })
    }
  })
}
```

---

### `src/app.ts` (config — import surgery)

**Action:** Fix 5 surviving cross-layer imports. No structural changes to the file.

**Lines to change** (`src/app.ts`):
```typescript
// Line 8 — OLD:
import { errorHandler } from './shared/errors/errorHandler'
// NEW:
import { errorHandler } from './infrastructure/http/plugins/error-handler'

// Line 9 — OLD:
import { healthRoutes } from './modules/health/health.routes'
// NEW:
import { healthRoutes } from './infrastructure/http/routes/health.routes'

// Line 16 — OLD:
import { CreditService } from './modules/credits/credits.service'
// NEW:
import { CreditService } from './adapters/services/credit.service'

// Line 21 — OLD:
import { ChatService } from './modules/chat/chat.service'
// NEW:
import { ChatService } from './adapters/services/chat.service'

// Line 24 — OLD:
import { getNeo4jDriver } from './shared/db/neo4j'
// NEW:
import { getNeo4jDriver } from './infrastructure/database/neo4j'
```

**Composition root** (lines 49-73) — unchanged. `ChatService` and `CreditService` constructors, injection into routes, and the `new Neo4jAdapter(getNeo4jDriver())` call all remain identical.

---

### `src/infrastructure/http/plugins/authenticate.hook.ts` (middleware — import surgery)

**Lines to change** (`src/infrastructure/http/plugins/authenticate.hook.ts`):
```typescript
// Line 2 — OLD:
import { AppError } from '../../../shared/errors/AppError'
// NEW (use DomainError — application layer is accessible from infrastructure):
import { DomainError } from '../../../application/errors/domain.error'

// Line 22 — OLD throw:
throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
// NEW:
throw new DomainError('Unauthorized', 'UNAUTHORIZED', 401)
```

---

### `src/infrastructure/http/routes/chat.routes.ts` (route — import surgery)

**Line to change** (current line 6):
```typescript
// OLD:
import { AppError } from '../../../shared/errors/AppError'
// NEW:
import { DomainError } from '../../../application/errors/domain.error'
// + update all throw sites to new DomainError(msg, code, status) signature
```

---

### `jest.config.ts` (config — alias removal)

**Current** (`jest.config.ts`, lines 14-17):
```typescript
moduleNameMapper: {
  '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  '^@modules/(.*)$': '<rootDir>/src/modules/$1',
},
```

**After Wave B deletion** — remove both entries:
```typescript
moduleNameMapper: {},
// or omit the key entirely if no other aliases exist
```

**Precondition:** Verify zero remaining uses before removing:
```bash
# Must return empty before removing aliases:
grep -r "@shared/\|@modules/" tests/
```

---

### `scripts/check-deps.ts` (utility, batch)

**Analog:** None in codebase — pattern from RESEARCH.md.

**Full pattern** (from `13-RESEARCH.md`, lines 158-206):
```typescript
import madge from 'madge'

const RULES: Array<{ from: RegExp; forbids: RegExp[]; label: string }> = [
  {
    label: 'domain must not import from project',
    from: /^src\/domain\//,
    forbids: [/^src\/application\//, /^src\/adapters\//, /^src\/infrastructure\//],
  },
  {
    label: 'application must not import adapters or infrastructure',
    from: /^src\/application\//,
    forbids: [/^src\/adapters\//, /^src\/infrastructure\//],
  },
  {
    label: 'adapters must not import infrastructure',
    from: /^src\/adapters\//,
    forbids: [/^src\/infrastructure\//],
  },
]

async function main() {
  const res = await madge('src/', { fileExtensions: ['ts'] })
  const graph = res.obj()
  const violations: string[] = []

  for (const [file, deps] of Object.entries(graph)) {
    for (const rule of RULES) {
      if (rule.from.test(file)) {
        for (const dep of deps) {
          for (const forbidden of rule.forbids) {
            if (forbidden.test(dep)) {
              violations.push(`VIOLATION [${rule.label}]: ${file} → ${dep}`)
            }
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    violations.forEach((v) => console.error(v))
    process.exit(1)
  }
  console.log('Dependency rule: OK')
}

main()
```

**Note:** RESEARCH.md marks `res.obj()` as [ASSUMED] — verify against `madge` 8.x TypeScript types (`import type { MadgeInstance }` from `'madge'`) before implementing. If `obj()` does not exist, try `result.obj()` via `.then(r => r.obj())` or inspect the MadgeInstance type definition.

**`package.json` script to add:**
```json
"check:deps": "ts-node scripts/check-deps.ts"
```

---

### `tests/unit/create-or-get-chat.use-case.test.ts` (test, request-response)

**Analog:** `tests/unit/chat.service.test.ts`
**Target use case:** `src/application/use-cases/chat/create-or-get-chat.use-case.ts`

**Imports pattern** (modeled on `chat.service.test.ts` lines 1-3, updated for use-case layer):
```typescript
import { CreateOrGetChatUseCase } from '../../src/application/use-cases/chat/create-or-get-chat.use-case'
import { IChatRepository } from '../../src/domain/interfaces/chat.repository.interface'
import { ChatInitiator } from '../../src/domain/entities/chat.entity'
```

**Mock factory pattern** (from `chat.service.test.ts` lines 6-15):
```typescript
const makeRepo = (): jest.Mocked<IChatRepository> => ({
  createOrGetChat: jest.fn(),
  createMessage: jest.fn(),
  findMessages: jest.fn(),
  findById: jest.fn(),
  findParticipants: jest.fn(),
  countRecruiterMessages: jest.fn(),
  findByUserId: jest.fn(),
  markMessagesRead: jest.fn(),
} as jest.Mocked<IChatRepository>)
```

**Test cases to cover** (use case has only `execute()` wrapping `repo.createOrGetChat`):
```typescript
describe('CreateOrGetChatUseCase', () => {
  it('returns chatId from repo.createOrGetChat', async () => {
    const repo = makeRepo()
    repo.createOrGetChat.mockResolvedValue({ id: 'chat-1' } as any)
    const uc = new CreateOrGetChatUseCase(repo)
    const result = await uc.execute('cand-1', 'comp-1', 'job-1', 'MATCH')
    expect(result).toEqual({ chatId: 'chat-1' })
    expect(repo.createOrGetChat).toHaveBeenCalledWith('cand-1', 'comp-1', 'job-1', 'MATCH')
  })

  it('is idempotent — returns same chatId on repeated calls', async () => {
    const repo = makeRepo()
    repo.createOrGetChat.mockResolvedValue({ id: 'existing-chat' } as any)
    const uc = new CreateOrGetChatUseCase(repo)
    const r1 = await uc.execute('cand-1', 'comp-1', 'job-1', 'MATCH')
    const r2 = await uc.execute('cand-1', 'comp-1', 'job-1', 'CREDIT')
    expect(r1.chatId).toBe('existing-chat')
    expect(r2.chatId).toBe('existing-chat')
  })
})
```

---

### `tests/unit/register.use-case.test.ts` (test, request-response)

**Analog:** RESEARCH.md canonical example (lines 286-340) + `chat.service.test.ts` structure
**Target use case:** `src/application/use-cases/auth/register.use-case.ts`

**Imports pattern:**
```typescript
import { RegisterUseCase } from '../../src/application/use-cases/auth/register.use-case'
import { IUserRepository } from '../../src/domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../src/domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../src/application/ports/hash.port'
import { ITokenPort } from '../../src/application/ports/token.port'
import { DomainError } from '../../src/application/errors/domain.error'
```

**Mock factories** (from RESEARCH.md lines 293-318 — copy verbatim):
```typescript
const makeUserRepo = (): jest.Mocked<IUserRepository> => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateGoogleId: jest.fn(),
  findMany: jest.fn(),
  findByIdPublic: jest.fn(),
} as jest.Mocked<IUserRepository>)

const makeHash = (): jest.Mocked<IHashPort> => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
} as jest.Mocked<IHashPort>)

const makeToken = (): jest.Mocked<ITokenPort> => ({
  signAccess: jest.fn().mockReturnValue('access-token'),
  generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw-token', hashed: 'hashed-token' }),
} as jest.Mocked<ITokenPort>)

const makeRefreshRepo = (): jest.Mocked<IRefreshTokenRepository> => ({
  create: jest.fn(),
  findByHash: jest.fn(),
  revoke: jest.fn(),
  revokeByFamily: jest.fn(),
  revokeByHash: jest.fn(),
} as jest.Mocked<IRefreshTokenRepository>)
```

**Note on mock shapes:** `IRefreshTokenRepository.revokeByHash` inclusion is marked [ASSUMED] in RESEARCH.md — verify against `src/domain/interfaces/refresh-token.repository.interface.ts` before implementing the mock factory.

**Test cases** (from RESEARCH.md lines 320-340 — copy verbatim).

---

### `tests/unit/upsert-candidate-profile.use-case.test.ts` (test, CRUD)

**Analog:** `tests/unit/chat.service.test.ts` (structure); target is `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts`

**Imports pattern:**
```typescript
import { UpsertCandidateProfileUseCase } from '../../src/application/use-cases/candidate/upsert-candidate-profile.use-case'
import { ICandidateRepository } from '../../src/domain/interfaces/candidate.repository.interface'
```

**Mock factory:**
```typescript
const makeRepo = (): jest.Mocked<ICandidateRepository> => ({
  upsertProfile: jest.fn(),
  // add other ICandidateRepository methods as needed
} as jest.Mocked<ICandidateRepository>)
```

**Test cases to cover** (use case has 1 method: `execute()` delegates to `repo.upsertProfile`):
```typescript
describe('UpsertCandidateProfileUseCase', () => {
  it('delegates to repo.upsertProfile and returns result', async () => {
    const repo = makeRepo()
    const mockProfile = { id: 'cand-1', userId: 'user-1', name: 'Alice' }
    repo.upsertProfile.mockResolvedValue(mockProfile as any)
    const uc = new UpsertCandidateProfileUseCase(repo)
    const input = {
      name: 'Alice',
      professionId: 'backend-dev',
      skills: ['Node.js'],
      preferredModalities: ['REMOTE' as any],
    }
    const result = await uc.execute('user-1', input as any)
    expect(repo.upsertProfile).toHaveBeenCalledWith('user-1', input)
    expect(result).toEqual(mockProfile)
  })
})
```

---

### `tests/unit/create-job.use-case.test.ts` (test, CRUD)

**Analog:** `tests/unit/chat.service.test.ts` (structure); target is `src/application/use-cases/job/create-job.use-case.ts`

**Imports pattern:**
```typescript
import { CreateJobUseCase } from '../../src/application/use-cases/job/create-job.use-case'
import { IJobRepository } from '../../src/domain/interfaces/job.repository.interface'
import { DomainError } from '../../src/application/errors/domain.error'
```

**Mock factory:**
```typescript
const makeRepo = (): jest.Mocked<IJobRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findByRecruiterId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  deactivateExpiredJobs: jest.fn(),
} as jest.Mocked<IJobRepository>)
```

**Test cases to cover** (`create-job.use-case.ts` — throws when recruiter profile missing, delegates to `repo.create` otherwise):
```typescript
describe('CreateJobUseCase', () => {
  it('throws NOT_FOUND when recruiter profile does not exist', async () => {
    const repo = makeRepo()
    repo.findRecruiterProfileByUserId.mockResolvedValue(null)
    const uc = new CreateJobUseCase(repo)
    await expect(uc.execute('user-1', {
      title: 'Dev', description: 'desc', professionId: 'backend-dev',
      modality: 'REMOTE', requiredSkills: [], expiresAt: new Date(),
    })).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('delegates to repo.create with recruiter companyId', async () => {
    const repo = makeRepo()
    repo.findRecruiterProfileByUserId.mockResolvedValue({
      id: 'rec-1', companyId: 'comp-1'
    } as any)
    repo.create.mockResolvedValue({ id: 'job-1' } as any)
    const uc = new CreateJobUseCase(repo)
    const result = await uc.execute('user-1', {
      title: 'Dev', description: 'desc', professionId: 'backend-dev',
      modality: 'REMOTE', requiredSkills: [], expiresAt: new Date(),
    })
    expect(repo.create).toHaveBeenCalledWith('rec-1', expect.objectContaining({ companyId: 'comp-1' }))
    expect(result).toMatchObject({ id: 'job-1' })
  })
})
```

---

### `tests/unit/record-swipe.use-case.test.ts` (test, event-driven)

**Analog:** `tests/unit/swipe.service.test.ts` (same behavior, new class)
**Target:** `src/application/use-cases/swipe/record-swipe.use-case.ts`

**Imports pattern:**
```typescript
import { RecordSwipeUseCase } from '../../src/application/use-cases/swipe/record-swipe.use-case'
import { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import { IChatPort } from '../../src/application/ports/chat.port'
import { DomainError } from '../../src/application/errors/domain.error'
```

**Mock factories** (from RESEARCH.md lines 420-431):
```typescript
const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
} as jest.Mocked<ISwipeRepository>)

const makeChatPort = (): jest.Mocked<IChatPort> => ({
  createOrGetChat: jest.fn().mockResolvedValue({ chatId: 'chat-1' }),
} as jest.Mocked<IChatPort>)
```

**Test cases** (from RESEARCH.md lines 433-456 — copy verbatim; covers NOT_FOUND on missing candidate profile and chat creation on LIKE).

Additional cases to add (porting from `swipe.service.test.ts`):
```typescript
it('throws NOT_FOUND when job does not exist', ...)
it('throws NOT_FOUND when job is inactive', ...)
it('throws NOT_FOUND when job is expired', ...)
it('returns chatId: null when direction is DISLIKE', ...)
```

---

### `tests/unit/unlock-candidate.use-case.test.ts` (test, CRUD)

**Analog:** `tests/unit/credit.service.test.ts` (same behavior, new class)
**Target:** `src/application/use-cases/credits/unlock-candidate.use-case.ts`

**Imports pattern:**
```typescript
import { UnlockCandidateUseCase } from '../../src/application/use-cases/credits/unlock-candidate.use-case'
import { ICreditRepository } from '../../src/domain/interfaces/credit.repository.interface'
import { IChatPort } from '../../src/application/ports/chat.port'
import { DomainError } from '../../src/application/errors/domain.error'
```

**Mock factories** (ported from `credit.service.test.ts` but typed against interfaces not concrete classes):
```typescript
const makeRepo = (): jest.Mocked<ICreditRepository> => ({
  findRecruiterByUserId: jest.fn(),
  findJobById: jest.fn(),
  findSwipe: jest.fn(),
  findUnlock: jest.fn(),
  findCandidateProfileById: jest.fn(),
  executeUnlock: jest.fn(),
  grantCredits: jest.fn(),
} as jest.Mocked<ICreditRepository>)

const makeChatPort = (): jest.Mocked<IChatPort> => ({
  createOrGetChat: jest.fn().mockResolvedValue({ chatId: 'chat-uuid-1' }),
} as jest.Mocked<IChatPort>)
```

**Test cases to port from `credit.service.test.ts`** (all `unlockCandidate` tests, renaming method from `service.unlockCandidate` to `uc.execute`):
- throws FORBIDDEN when recruiter profile missing
- throws NOT_FOUND when job not found
- throws FORBIDDEN when job owned by different recruiter
- throws NOT_FOUND when candidate has no swipe on job
- throws CANDIDATE_ALREADY_VISIBLE when swipe is LIKE
- throws ALREADY_UNLOCKED when unlock already exists
- calls executeUnlock with cost=2 for FREE plan
- calls executeUnlock with cost=1 for PRO plan
- uses FREE cost as fallback for unknown plan

**Key difference from old test:** `UnlockCandidateUseCase` throws `DomainError` (not `AppError`), so `rejects.toMatchObject({ code, statusCode })` still works (both classes have these fields). `IChatPort` replaces `IChatService` in the constructor — the `createOrGetChat` mock signature is identical.

---

## Shared Patterns

### DomainError — replace AppError everywhere in new/moved files
**Source:** `src/application/errors/domain.error.ts`
**Apply to:** `chat.service.ts`, `credit.service.ts`, `require-role.hook.ts`, `authenticate.hook.ts`, `chat.routes.ts`

```typescript
// Constructor signature (note: DomainError has REVERSED arg order vs AppError):
// AppError:    new AppError(message, statusCode, code)
// DomainError: new DomainError(message, code, statusCode)

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'DomainError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
```

### Infrastructure prisma import path
**Source:** `src/infrastructure/database/prisma.ts`
**Apply to:** `health.routes.ts` (new), all test helpers and integration tests

```typescript
// All files outside src/shared/ must use:
import { prisma } from '../../../infrastructure/database/prisma'
// (adjust relative depth per file location)
```

### Infrastructure neo4j import path
**Source:** `src/infrastructure/database/neo4j.ts`
**Apply to:** `src/app.ts` (line 24), `tests/helpers/neo4j-setup.ts`

```typescript
import { getNeo4jDriver } from './infrastructure/database/neo4j'
```

### Adapter service — implements application port pattern
**Source:** `src/adapters/services/bcrypt.adapter.ts` (lines 1-12)
**Apply to:** `chat.service.ts`, `credit.service.ts` (both implement application-layer interfaces)

```typescript
// Pattern: adapter imports port from application layer; class implements that port
import { ISomePort } from '../../application/ports/some.port'

export class SomeAdapter implements ISomePort {
  // only depends on domain interfaces and other application ports — no infrastructure imports
}
```

### Unit test mock factory pattern
**Source:** `tests/unit/chat.service.test.ts` (lines 6-15)
**Apply to:** All 6 new unit test files

```typescript
// Factories return jest.Mocked<IInterfaceName> with all methods explicitly listed
const makeRepo = (): jest.Mocked<IInterface> => ({
  method1: jest.fn(),
  method2: jest.fn(),
} as jest.Mocked<IInterface>)
```

Key rules observed across all existing unit tests:
- Use `as jest.Mocked<T>` (not `as any`) for type safety on mock methods
- Use `as unknown as jest.Mocked<T>` when the interface has optional methods that make direct cast fail
- `jest.clearAllMocks()` in `beforeEach`; re-set default mock return values AFTER `clearAllMocks()`
- `rejects.toMatchObject({ code, statusCode })` works for both `AppError` and `DomainError` since both expose those fields

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/check-deps.ts` | utility | batch | No existing dependency-rule scripts in codebase; pattern from RESEARCH.md (madge programmatic API) |

---

## Test File Import Updates (Wave A — not new files, just surgery)

The following test and helper files need import path updates only (no logic changes):

| File | Old Import | New Import |
|------|-----------|------------|
| `tests/helpers/factories.ts` | `src/shared/db/prisma` | `src/infrastructure/database/prisma` |
| `tests/helpers/setup.ts` | `src/shared/db/prisma` | `src/infrastructure/database/prisma` |
| `tests/helpers/neo4j-setup.ts` | `shared/db/...`, `modules/recommendation/...` | `infrastructure/database/neo4j`, `adapters/services/recommendation.repository` |
| `tests/integration/admin.test.ts` | `shared/db/prisma` | `infrastructure/database/prisma` |
| `tests/integration/chat.test.ts` | `shared/db/prisma` | `infrastructure/database/prisma` |
| `tests/integration/credits.test.ts` | `shared/db/prisma` | `infrastructure/database/prisma` |
| `tests/integration/job-routes.test.ts` | `shared/db/prisma` | `infrastructure/database/prisma` |
| `tests/integration/job.test.ts` | `shared/db/prisma`, `modules/...` | `infrastructure/database/prisma`, `adapters/...` |
| `tests/integration/recommendation.test.ts` | `shared/...`, `modules/...` | `infrastructure/database/neo4j`, `adapters/services/recommendation.repository` |
| `tests/integration/swipe.test.ts` | `shared/db/prisma` | `infrastructure/database/prisma` |
| `tests/unit/appError.test.ts` | `shared/errors/AppError` | `infrastructure/http/errors/app.error` |
| `tests/unit/errorHandler.test.ts` | `shared/errors/...` | `infrastructure/http/plugins/error-handler`, `infrastructure/http/errors/app.error` |
| `tests/unit/job.scheduler.test.ts` | `modules/...` | infrastructure scheduler path |
| `tests/unit/recommendation.service.test.ts` | `modules/recommendation/...` | `adapters/services/recommendation.repository` |

The remaining unit test files (`auth.service.test.ts`, `candidate.service.test.ts`, `recruiter.service.test.ts`, `job.service.test.ts`, `credit.service.test.ts`, `swipe.service.test.ts`, `company.service.test.ts`, `chat.service.test.ts`) are **replaced** by the 6 new use-case tests — they should be deleted after the new tests are written and passing.

---

## Metadata

**Analog search scope:** `src/adapters/`, `src/application/`, `src/infrastructure/`, `src/shared/`, `src/modules/`, `tests/unit/`
**Files scanned:** 30
**Pattern extraction date:** 2026-05-09
