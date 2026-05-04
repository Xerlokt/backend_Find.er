# Architecture Plan — Clean Architecture

## Princípio Central: A Regra da Dependência

Dependências apontam **para dentro**. Camadas internas nunca importam camadas externas.

```
┌─────────────────────────────────────────────────┐
│           Frameworks & Drivers (outer)           │
│  ┌───────────────────────────────────────────┐  │
│  │        Interface Adapters (controllers)    │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │        Application (use cases)       │  │  │
│  │  │  ┌───────────────────────────────┐  │  │  │
│  │  │  │     Domain (entities)         │  │  │  │
│  │  │  └───────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         dependências só entram → nunca saem
```

---

## Camada 1 — Entities (Domain)

**Responsabilidade:** Regras de negócio do domínio. Independente de framework, banco, HTTP.

**O que pertence aqui:**
- Classes/types representando o domínio (User, Job, Swipe, Chat, CreditTransaction)
- Validações internas de invariantes (ex: créditos não negativos)
- Value Objects (ex: FitScore, Money, Location)
- Interfaces de repositório (portas de saída — definidas aqui, implementadas fora)

**O que NÃO pertence aqui:**
- Imports de Prisma, Fastify, bcrypt, JWT, ou qualquer lib externa
- Lógica de I/O (banco, HTTP, email)

### Estrutura de Arquivos

```
src/domain/
  entities/
    user.entity.ts
    candidate.entity.ts
    company.entity.ts
    job.entity.ts
    swipe.entity.ts
    chat.entity.ts
    credit-transaction.entity.ts
  value-objects/
    fit-score.vo.ts
    location.vo.ts
  interfaces/
    user.repository.interface.ts
    job.repository.interface.ts
    swipe.repository.interface.ts
    chat.repository.interface.ts
    credit.repository.interface.ts
    recommendation.repository.interface.ts
```

### Exemplo: Entity

```typescript
// src/domain/entities/user.entity.ts
export type UserRole = 'CANDIDATE' | 'RECRUITER' | 'ADMIN'

export interface User {
  id: string
  email: string
  passwordHash: string | null
  googleId: string | null
  avatarUrl: string | null
  role: UserRole
  createdAt: Date
}
```

```typescript
// src/domain/entities/job.entity.ts
export type Modality = 'REMOTE' | 'HYBRID' | 'IN_PERSON'

export interface Job {
  id: string
  companyId: string
  title: string
  description: string
  professionId: string
  salaryMin: number | null
  salaryMax: number | null
  lat: number | null
  lng: number | null
  modality: Modality
  requiredSkills: string[]
  expiresAt: Date
  isActive: boolean
  createdAt: Date
}
```

### Exemplo: Interface de Repositório (Porta de Saída)

```typescript
// src/domain/interfaces/user.repository.interface.ts
import { User, UserRole } from '../entities/user.entity'

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  create(data: { email: string; passwordHash: string; role: UserRole }): Promise<User>
  updateGoogleId(id: string, googleId: string, avatarUrl?: string): Promise<User>
}
```

---

## Camada 2 — Use Cases (Application)

**Responsabilidade:** Regras de negócio da aplicação. Orquestra entities, chama repositórios via interfaces.

**O que pertence aqui:**
- Um caso de uso por arquivo, uma responsabilidade por classe
- Recebe repositórios por injeção de dependência (interfaces, nunca implementações concretas)
- Retorna dados da camada de domínio, nunca objetos HTTP (sem `reply`, sem status codes)
- Lança erros de domínio — quem mapeia para HTTP são os controllers

**O que NÃO pertence aqui:**
- Imports de Fastify, Prisma, bcrypt diretamente
- Lógica de rota (método HTTP, path, headers)
- Formatação de resposta HTTP

### Estrutura de Arquivos

```
src/application/
  use-cases/
    auth/
      register.use-case.ts
      login.use-case.ts
      refresh-token.use-case.ts
      logout.use-case.ts
      login-with-google.use-case.ts
    candidate/
      create-candidate-profile.use-case.ts
      get-candidate-profile.use-case.ts
      update-candidate-profile.use-case.ts
    job/
      create-job.use-case.ts
      list-jobs.use-case.ts
      expire-jobs.use-case.ts
    swipe/
      record-swipe.use-case.ts
      get-swipe-feed.use-case.ts
    credits/
      purchase-credits.use-case.ts
      unlock-candidate.use-case.ts
      adjust-credits.use-case.ts
    recommendation/
      calculate-fit-score.use-case.ts
      sync-candidate-graph.use-case.ts
    chat/
      get-chat-history.use-case.ts
      send-message.use-case.ts
  ports/
    hash.port.ts           (interface para bcrypt)
    token.port.ts          (interface para JWT)
    graph.port.ts          (interface para Neo4j)
  errors/
    domain.error.ts
```

### Exemplo: Use Case

```typescript
// src/application/use-cases/auth/register.use-case.ts
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../ports/hash.port'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

interface RegisterInput {
  email: string
  password: string
  role: 'CANDIDATE' | 'RECRUITER'
}

interface TokenPair {
  accessToken: string
  refreshToken: string
}

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly hash: IHashPort,
    private readonly token: ITokenPort,
  ) {}

  async execute(input: RegisterInput): Promise<TokenPair> {
    const existing = await this.userRepo.findByEmail(input.email)
    if (existing) {
      throw new DomainError('Email already in use', 'CONFLICT', 409)
    }

    const passwordHash = await this.hash.hash(input.password)
    const user = await this.userRepo.create({ email: input.email, passwordHash, role: input.role })

    const accessToken = this.token.signAccess({ id: user.id, role: user.role })
    const { raw, hashed } = this.token.generateRefreshToken()
    await this.refreshTokenRepo.create({ tokenHash: hashed, userId: user.id })

    return { accessToken, refreshToken: raw }
  }
}
```

### Exemplo: Port (Interface de Serviço Externo)

```typescript
// src/application/ports/hash.port.ts
export interface IHashPort {
  hash(plain: string): Promise<string>
  compare(plain: string, hashed: string): Promise<boolean>
}

// src/application/ports/token.port.ts
export interface ITokenPort {
  signAccess(payload: { id: string; role: string }): string
  signRefresh(): { raw: string; hashed: string }
  generateRefreshToken(): { raw: string; hashed: string }
}

// src/application/ports/graph.port.ts
export interface IGraphPort {
  syncCandidate(candidate: { id: string; skills: string[]; professionId: string }): Promise<void>
  syncJob(job: { id: string; requiredSkills: string[]; professionId: string }): Promise<void>
  calculateFitScore(candidateId: string, jobId: string): Promise<number>
  getRecommendedJobs(candidateId: string, limit: number): Promise<string[]>
}
```

---

## Camada 3 — Interface Adapters (Controllers + Repositories)

**Responsabilidade:** Traduzir entre o mundo externo (HTTP, banco) e o domínio.

Essa camada tem duas direções:

- **Controllers:** HTTP request → chamam Use Cases → formatam resposta HTTP
- **Repositories (implementações):** chamados pelos Use Cases → falam com Prisma/Neo4j

### 3a. Controllers

**O que pertence aqui:**
- Parsing e validação de input (Zod)
- Instanciação de Use Cases com repositórios concretos
- Mapeamento de erros de domínio para status HTTP
- Retorno de resposta formatada

**O que NÃO pertence aqui:**
- Regra de negócio — delega sempre ao Use Case
- Acesso direto ao Prisma ou banco

```
src/adapters/
  controllers/
    auth.controller.ts
    candidate.controller.ts
    company.controller.ts
    recruiter.controller.ts
    job.controller.ts
    swipe.controller.ts
    credits.controller.ts
    chat.controller.ts
    admin.controller.ts
```

### Exemplo: Controller

```typescript
// src/adapters/controllers/auth.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { RegisterUseCase } from '../../application/use-cases/auth/register.use-case'
import { UserRepository } from '../repositories/user.repository'
import { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import { BcryptAdapter } from '../services/bcrypt.adapter'
import { JwtAdapter } from '../services/jwt.adapter'
import { DomainError } from '../../application/errors/domain.error'

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

export class AuthController {
  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterBodySchema.parse(request.body)

    const useCase = new RegisterUseCase(
      new UserRepository(),
      new RefreshTokenRepository(),
      new BcryptAdapter(),
      new JwtAdapter(request.server),
    )

    const tokens = await useCase.execute(body)
    reply.status(201).send(tokens)
  }
}
```

### 3b. Repositories (implementações)

**O que pertence aqui:**
- Implementação das interfaces `IXxxRepository` definidas no domínio
- Mapeamento de modelo Prisma → entity de domínio
- Queries SQL via Prisma ORM (nunca interpolação de string)

```
src/adapters/
  repositories/
    user.repository.ts
    refresh-token.repository.ts
    candidate.repository.ts
    company.repository.ts
    job.repository.ts
    swipe.repository.ts
    chat.repository.ts
    credit.repository.ts
  services/
    bcrypt.adapter.ts      (implementa IHashPort)
    jwt.adapter.ts         (implementa ITokenPort)
    neo4j.adapter.ts       (implementa IGraphPort)
```

### Exemplo: Repository Implementation

```typescript
// src/adapters/repositories/user.repository.ts
import { prisma } from '../../infrastructure/database/prisma'
import { IUserRepository } from '../../domain/interfaces/user.repository.interface'
import { User } from '../../domain/entities/user.entity'

export class UserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } })
    return row ? this.toDomain(row) : null
  }

  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async create(data: { email: string; passwordHash: string; role: 'CANDIDATE' | 'RECRUITER' }): Promise<User> {
    const row = await prisma.user.create({ data })
    return this.toDomain(row)
  }

  private toDomain(row: any): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      googleId: row.googleId,
      avatarUrl: row.avatarUrl,
      role: row.role,
      createdAt: row.createdAt,
    }
  }
}
```

---

## Camada 4 — Frameworks & Drivers

**Responsabilidade:** Cola do sistema. Registra rotas, plugins, conecta infraestrutura. Nunca contém regra de negócio.

### O que pertence aqui

```
src/infrastructure/
  http/
    routes/
      auth.routes.ts          (registra /auth/*, chama AuthController)
      candidate.routes.ts
      company.routes.ts
      recruiter.routes.ts
      job.routes.ts
      swipe.routes.ts
      credits.routes.ts
      chat.routes.ts
      admin.routes.ts
      health.routes.ts
    plugins/
      helmet.plugin.ts
      cors.plugin.ts
      jwt.plugin.ts
      rate-limit.plugin.ts
      websocket.plugin.ts
      scheduler.plugin.ts
    app.ts                    (buildApp — registra plugins e rotas)
    server.ts                 (entry point — listen)
  database/
    prisma.ts                 (singleton PrismaClient)
    neo4j.ts                  (singleton Neo4j Driver)
  scheduler/
    job-expiry.scheduler.ts
```

### Exemplo: Route File (camada mais externa)

```typescript
// src/infrastructure/http/routes/auth.routes.ts
import { FastifyInstance } from 'fastify'
import { AuthController } from '../../../adapters/controllers/auth.controller'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new AuthController()

  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, ctrl.register.bind(ctrl))

  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, ctrl.login.bind(ctrl))

  app.post('/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, ctrl.refresh.bind(ctrl))

  app.post('/logout', ctrl.logout.bind(ctrl))
  app.post('/google', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, ctrl.loginWithGoogle.bind(ctrl))
}
```

---

## Estrutura Completa de Pastas

```
src/
├── domain/                         ← Entities (núcleo)
│   ├── entities/
│   │   ├── user.entity.ts
│   │   ├── candidate.entity.ts
│   │   ├── company.entity.ts
│   │   ├── recruiter.entity.ts
│   │   ├── job.entity.ts
│   │   ├── swipe.entity.ts
│   │   ├── chat.entity.ts
│   │   ├── message.entity.ts
│   │   └── credit-transaction.entity.ts
│   ├── value-objects/
│   │   ├── fit-score.vo.ts
│   │   └── location.vo.ts
│   └── interfaces/
│       ├── user.repository.interface.ts
│       ├── candidate.repository.interface.ts
│       ├── company.repository.interface.ts
│       ├── job.repository.interface.ts
│       ├── swipe.repository.interface.ts
│       ├── chat.repository.interface.ts
│       └── credit.repository.interface.ts
│
├── application/                    ← Use Cases
│   ├── use-cases/
│   │   ├── auth/
│   │   │   ├── register.use-case.ts
│   │   │   ├── login.use-case.ts
│   │   │   ├── refresh-token.use-case.ts
│   │   │   ├── logout.use-case.ts
│   │   │   └── login-with-google.use-case.ts
│   │   ├── candidate/
│   │   │   ├── create-profile.use-case.ts
│   │   │   ├── get-profile.use-case.ts
│   │   │   └── update-profile.use-case.ts
│   │   ├── job/
│   │   │   ├── create-job.use-case.ts
│   │   │   ├── list-jobs.use-case.ts
│   │   │   └── expire-jobs.use-case.ts
│   │   ├── swipe/
│   │   │   ├── record-swipe.use-case.ts
│   │   │   └── get-feed.use-case.ts
│   │   ├── credits/
│   │   │   ├── purchase-credits.use-case.ts
│   │   │   ├── unlock-candidate.use-case.ts
│   │   │   └── adjust-credits.use-case.ts
│   │   ├── recommendation/
│   │   │   ├── calculate-fit-score.use-case.ts
│   │   │   └── sync-graph.use-case.ts
│   │   └── chat/
│   │       ├── get-history.use-case.ts
│   │       └── send-message.use-case.ts
│   ├── ports/
│   │   ├── hash.port.ts
│   │   ├── token.port.ts
│   │   └── graph.port.ts
│   └── errors/
│       └── domain.error.ts
│
├── adapters/                       ← Interface Adapters
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── candidate.controller.ts
│   │   ├── company.controller.ts
│   │   ├── recruiter.controller.ts
│   │   ├── job.controller.ts
│   │   ├── swipe.controller.ts
│   │   ├── credits.controller.ts
│   │   ├── chat.controller.ts
│   │   └── admin.controller.ts
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── refresh-token.repository.ts
│   │   ├── candidate.repository.ts
│   │   ├── company.repository.ts
│   │   ├── job.repository.ts
│   │   ├── swipe.repository.ts
│   │   ├── chat.repository.ts
│   │   └── credit.repository.ts
│   └── services/
│       ├── bcrypt.adapter.ts
│       ├── jwt.adapter.ts
│       └── neo4j.adapter.ts
│
└── infrastructure/                 ← Frameworks & Drivers
    ├── http/
    │   ├── routes/
    │   │   ├── auth.routes.ts
    │   │   ├── candidate.routes.ts
    │   │   ├── company.routes.ts
    │   │   ├── recruiter.routes.ts
    │   │   ├── job.routes.ts
    │   │   ├── swipe.routes.ts
    │   │   ├── credits.routes.ts
    │   │   ├── chat.routes.ts
    │   │   ├── admin.routes.ts
    │   │   └── health.routes.ts
    │   ├── plugins/
    │   │   ├── helmet.plugin.ts
    │   │   ├── cors.plugin.ts
    │   │   ├── jwt.plugin.ts
    │   │   ├── rate-limit.plugin.ts
    │   │   ├── websocket.plugin.ts
    │   │   └── scheduler.plugin.ts
    │   ├── app.ts
    │   └── server.ts
    ├── database/
    │   ├── prisma.ts
    │   └── neo4j.ts
    └── scheduler/
        └── job-expiry.scheduler.ts
```

---

## Mapeamento da Estrutura Atual → Nova Arquitetura

| Arquivo Atual | Nova Localização | Camada |
|---|---|---|
| `src/modules/auth/auth.service.ts` | `src/application/use-cases/auth/*.use-case.ts` | Use Cases |
| `src/modules/auth/auth.repository.ts` | `src/adapters/repositories/user.repository.ts` | Adapters |
| `src/modules/auth/auth.routes.ts` | `src/infrastructure/http/routes/auth.routes.ts` + `src/adapters/controllers/auth.controller.ts` | Infra + Adapters |
| `src/shared/db/prisma.ts` | `src/infrastructure/database/prisma.ts` | Infrastructure |
| `src/shared/db/neo4j.ts` | `src/infrastructure/database/neo4j.ts` | Infrastructure |
| `src/shared/plugins/*.ts` | `src/infrastructure/http/plugins/*.ts` | Infrastructure |
| `src/shared/hooks/authenticate.ts` | `src/infrastructure/http/plugins/authenticate.hook.ts` | Infrastructure |
| `src/shared/errors/AppError.ts` | `src/application/errors/domain.error.ts` | Application |
| `src/app.ts` | `src/infrastructure/http/app.ts` | Infrastructure |

---

## Regras de Import por Camada

```
domain/         → não importa nada do projeto
application/    → importa apenas domain/
adapters/       → importa application/ e domain/
infrastructure/ → importa adapters/, application/, domain/
```

**Violação a evitar:**

```typescript
// ❌ ERRADO — use case importando Prisma diretamente
import { prisma } from '../../infrastructure/database/prisma'

// ✓ CORRETO — use case recebe interface injetada
constructor(private readonly userRepo: IUserRepository) {}
```

```typescript
// ❌ ERRADO — domain entity importando lib externa
import { User as PrismaUser } from '@prisma/client'

// ✓ CORRETO — domain define seus próprios tipos
export interface User { id: string; email: string; ... }
```

---

## Testabilidade por Camada

| Camada | Tipo de Teste | O que mockar |
|---|---|---|
| Entities | Unitário puro | Nada — sem dependências |
| Use Cases | Unitário | Interfaces dos repositórios e ports (Jest mock) |
| Controllers | Unitário | Use Cases |
| Repositories | Integração | Banco real (Docker) — sem mock |
| Routes | E2E | Nada — `buildApp()` + Supertest |

```typescript
// Teste unitário de use case — sem banco, sem HTTP
describe('RegisterUseCase', () => {
  it('throws CONFLICT when email exists', async () => {
    const userRepo = { findByEmail: jest.fn().mockResolvedValue({ id: '1' }) } as any
    const useCase = new RegisterUseCase(userRepo, mockRefreshRepo, mockHash, mockToken)
    await expect(useCase.execute({ email: 'x@x.com', password: 'abc', role: 'CANDIDATE' }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
```

---

## Convenções de Nomenclatura

| Tipo | Convenção | Exemplo |
|---|---|---|
| Entity | `*.entity.ts` | `user.entity.ts` |
| Use Case | `*.use-case.ts` | `register.use-case.ts` |
| Repository Interface | `*.repository.interface.ts` | `user.repository.interface.ts` |
| Repository Impl | `*.repository.ts` | `user.repository.ts` |
| Port | `*.port.ts` | `hash.port.ts` |
| Adapter | `*.adapter.ts` | `bcrypt.adapter.ts` |
| Controller | `*.controller.ts` | `auth.controller.ts` |
| Route | `*.routes.ts` | `auth.routes.ts` |
| Plugin | `*.plugin.ts` | `helmet.plugin.ts` |
