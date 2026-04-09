# Job Tinder — Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o backend completo do Job Tinder com autenticação, gestão de vagas, mecânica de swipe, scoring de match, chat em tempo real e sistema de créditos.

**Architecture:** Monolito modular com Fastify. Módulos de recomendação (Neo4j) e chat (WebSocket) isolados para futura extração. PostgreSQL via Prisma para dados relacionais, Neo4j para grafo de profissões.

**Tech Stack:** Node.js 20, TypeScript 5, Fastify 4, Prisma ORM, PostgreSQL 16, Neo4j 5, Jest 29, Supertest, Docker Compose

---

## File Structure

```
src/
  app.ts                          — Fastify factory (buildApp)
  server.ts                       — Entry point
  shared/
    db/
      prisma.ts                   — Prisma client singleton
      neo4j.ts                    — Neo4j driver singleton
    plugins/
      jwt.ts                      — JWT plugin (@fastify/jwt)
      oauth.ts                    — Google OAuth2 (@fastify/oauth2)
      websocket.ts                — WebSocket plugin (@fastify/websocket)
    hooks/
      authenticate.ts             — Verifica JWT, popula request.user
      requireRole.ts              — Verifica role (CANDIDATE | RECRUITER | ADMIN)
    errors/
      AppError.ts                 — Classe de erro com statusCode
      errorHandler.ts             — Handler global de erros
  modules/
    auth/
      auth.routes.ts
      auth.service.ts
      auth.schema.ts
    candidates/
      candidates.routes.ts
      candidates.service.ts
      candidates.repository.ts
      candidates.schema.ts
    companies/
      companies.routes.ts
      companies.service.ts
      companies.repository.ts
      companies.schema.ts
    jobs/
      jobs.routes.ts
      jobs.service.ts
      jobs.repository.ts
      jobs.schema.ts
      jobs.scheduler.ts
    swipes/
      swipes.routes.ts
      swipes.service.ts
      swipes.repository.ts
    recommendation/
      recommendation.service.ts
      recommendation.repository.ts  — Queries Neo4j
    chat/
      chat.routes.ts
      chat.service.ts
      chat.repository.ts
      chat.gateway.ts               — WebSocket handler
    credits/
      credits.service.ts
      credits.repository.ts
    admin/
      admin.routes.ts
      admin.service.ts
tests/
  helpers/
    setup.ts                      — beforeAll/afterAll com DB de teste
    factories.ts                  — Factories de dados de teste
  unit/
    auth.service.test.ts
    candidates.service.test.ts
    companies.service.test.ts
    jobs.service.test.ts
    swipes.service.test.ts
    recommendation.service.test.ts
    credits.service.test.ts
    chat.service.test.ts
  integration/
    auth.test.ts
    candidates.test.ts
    companies.test.ts
    jobs.test.ts
    swipes.test.ts
    chat.test.ts
prisma/
  schema.prisma
docker-compose.yml
.env.example
package.json
tsconfig.json
jest.config.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.ts`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Inicializar projeto e instalar dependências**

```bash
cd D:/VCAT/projects/personalProject
npm init -y
npm install fastify @fastify/jwt @fastify/oauth2 @fastify/websocket @fastify/cors
npm install @prisma/client neo4j-driver bcryptjs zod node-cron
npm install --save-dev typescript ts-node ts-jest jest supertest @types/node @types/jest @types/supertest @types/bcryptjs @types/node-cron prisma
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@modules/*": ["./src/modules/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Criar `jest.config.ts`**

```typescript
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
  },
  setupFilesAfterFramework: ['<rootDir>/tests/helpers/setup.ts'],
  testTimeout: 30000,
}

export default config
```

- [ ] **Step 4: Criar `docker-compose.yml`**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: jobtinder
      POSTGRES_PASSWORD: jobtinder
      POSTGRES_DB: jobtinder
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  postgres_test:
    image: postgres:16
    environment:
      POSTGRES_USER: jobtinder_test
      POSTGRES_PASSWORD: jobtinder_test
      POSTGRES_DB: jobtinder_test
    ports:
      - '5433:5432'

  neo4j:
    image: neo4j:5
    environment:
      NEO4J_AUTH: neo4j/jobtinder
    ports:
      - '7474:7474'
      - '7687:7687'
    volumes:
      - neo4j_data:/data

volumes:
  postgres_data:
  neo4j_data:
```

- [ ] **Step 5: Criar `.env.example`**

```env
DATABASE_URL=postgresql://jobtinder:jobtinder@localhost:5432/jobtinder
DATABASE_URL_TEST=postgresql://jobtinder_test:jobtinder_test@localhost:5433/jobtinder_test
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=jobtinder
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-too
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
PORT=3000
```

- [ ] **Step 6: Adicionar scripts ao `package.json`**

```json
{
  "scripts": {
    "dev": "ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest --runInBand",
    "test:unit": "jest tests/unit --runInBand",
    "test:integration": "jest tests/integration --runInBand",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 7: Subir containers**

```bash
docker-compose up -d
```
Expected: postgres, postgres_test e neo4j rodando.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: project scaffold with Fastify, TypeScript, Jest, Docker"
```

---

## Task 2: Prisma Schema + Migration

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Inicializar Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Criar `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CANDIDATE
  RECRUITER
  ADMIN
}

enum Modality {
  REMOTE
  HYBRID
  IN_PERSON
}

enum SwipeDirection {
  LIKE
  DISLIKE
}

enum ChatInitiator {
  MATCH
  CREDIT
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?
  googleId     String?   @unique
  avatarUrl    String?
  role         Role
  createdAt    DateTime  @default(now())

  candidateProfile CandidateProfile?
  recruiterProfile RecruiterProfile?
  sentMessages     Message[]         @relation("SentMessages")
}

model CandidateProfile {
  id                  String     @id @default(uuid())
  userId              String     @unique
  user                User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  name                String
  bio                 String?
  lat                 Float?
  lng                 Float?
  professionId        String
  skills              String[]
  preferredModalities Modality[]
  searchRadiusKm      Int        @default(50)

  swipes Swipe[]
  chats  Chat[]
}

model RecruiterProfile {
  id        String  @id @default(uuid())
  userId    String  @unique
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
}

model Company {
  id            String    @id @default(uuid())
  name          String
  logoUrl       String?
  description   String?
  rating        Float     @default(0)
  plan          String    @default("FREE")
  planExpiresAt DateTime?
  credits       Int       @default(0)
  createdAt     DateTime  @default(now())

  recruiters         RecruiterProfile[]
  jobs               Job[]
  chats              Chat[]
  creditTransactions CreditTransaction[]
}

model Job {
  id             String    @id @default(uuid())
  companyId      String
  company        Company   @relation(fields: [companyId], references: [id])
  title          String
  description    String
  professionId   String
  salaryMin      Float?
  salaryMax      Float?
  lat            Float?
  lng            Float?
  modality       Modality
  requiredSkills String[]
  expiresAt      DateTime
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())

  swipes Swipe[]
  chats  Chat[]
}

model Swipe {
  id          String           @id @default(uuid())
  candidateId String
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id])
  jobId       String
  job         Job              @relation(fields: [jobId], references: [id])
  direction   SwipeDirection
  swipedAt    DateTime         @default(now())

  @@unique([candidateId, jobId])
}

model Chat {
  id          String           @id @default(uuid())
  candidateId String
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id])
  jobId       String
  job         Job              @relation(fields: [jobId], references: [id])
  companyId   String
  company     Company          @relation(fields: [companyId], references: [id])
  initiatedBy ChatInitiator
  expiresAt   DateTime?
  isActive    Boolean          @default(true)
  createdAt   DateTime         @default(now())

  messages Message[]
}

model Message {
  id        String    @id @default(uuid())
  chatId    String
  chat      Chat      @relation(fields: [chatId], references: [id])
  senderId  String
  sender    User      @relation("SentMessages", fields: [senderId], references: [id])
  content   String
  createdAt DateTime  @default(now())
  readAt    DateTime?
}

model CreditTransaction {
  id        String   @id @default(uuid())
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
  amount    Int
  reason    String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Rodar migration**

```bash
npx prisma migrate dev --name init
npx prisma generate
```
Expected: Migration criada em `prisma/migrations/`, client gerado.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: prisma schema with all models and initial migration"
```

---

## Task 3: Shared Infrastructure

**Files:**
- Create: `src/shared/db/prisma.ts`
- Create: `src/shared/db/neo4j.ts`
- Create: `src/shared/errors/AppError.ts`
- Create: `src/shared/errors/errorHandler.ts`
- Create: `src/app.ts`
- Create: `src/server.ts`
- Create: `tests/helpers/setup.ts`
- Create: `tests/helpers/factories.ts`

- [ ] **Step 1: Criar `src/shared/errors/AppError.ts`**

```typescript
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
```

- [ ] **Step 2: Criar `src/shared/errors/errorHandler.ts`**

```typescript
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from './AppError'

export function errorHandler(
  error: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message })
  }

  if ('statusCode' in error && error.statusCode) {
    return reply.status(error.statusCode).send({ error: error.message })
  }

  console.error(error)
  return reply.status(500).send({ error: 'Internal server error' })
}
```

- [ ] **Step 3: Criar `src/shared/db/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 4: Criar `src/shared/db/neo4j.ts`**

```typescript
import neo4j, { Driver } from 'neo4j-driver'

let driver: Driver

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
    )
  }
  return driver
}

export async function closeNeo4j(): Promise<void> {
  if (driver) await driver.close()
}
```

- [ ] **Step 5: Criar `src/app.ts`**

```typescript
import Fastify, { FastifyInstance } from 'fastify'
import { errorHandler } from './shared/errors/errorHandler'

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: !opts.testing,
  })

  app.setErrorHandler(errorHandler)

  // Plugins e rotas serão registrados aqui nas tasks seguintes

  return app
}
```

- [ ] **Step 6: Criar `src/server.ts`**

```typescript
import 'dotenv/config'
import { buildApp } from './app'

async function main() {
  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3000)

  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server running on port ${port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 7: Criar `tests/helpers/setup.ts`**

```typescript
import { execSync } from 'child_process'
import { prisma } from '../../src/shared/db/prisma'

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!
  execSync('npx prisma migrate deploy', { env: process.env })
})

afterAll(async () => {
  await prisma.$disconnect()
})

afterEach(async () => {
  // Limpa tabelas na ordem correta para evitar FK violations
  await prisma.message.deleteMany()
  await prisma.chat.deleteMany()
  await prisma.swipe.deleteMany()
  await prisma.creditTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.recruiterProfile.deleteMany()
  await prisma.company.deleteMany()
  await prisma.candidateProfile.deleteMany()
  await prisma.user.deleteMany()
})
```

- [ ] **Step 8: Criar `tests/helpers/factories.ts`**

```typescript
import { prisma } from '../../src/shared/db/prisma'
import bcrypt from 'bcryptjs'
import { Modality, Role } from '@prisma/client'

export async function createUser(overrides: Partial<{
  email: string
  role: Role
  passwordHash: string
}> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}@test.com`,
      role: overrides.role ?? 'CANDIDATE',
      passwordHash: overrides.passwordHash ?? await bcrypt.hash('password123', 10),
    },
  })
}

export async function createCandidate(overrides: Partial<{
  email: string
  professionId: string
  skills: string[]
  preferredModalities: Modality[]
}> = {}) {
  const user = await createUser({ role: 'CANDIDATE', email: overrides.email })
  const profile = await prisma.candidateProfile.create({
    data: {
      userId: user.id,
      name: 'Test Candidate',
      professionId: overrides.professionId ?? 'backend-dev',
      skills: overrides.skills ?? ['Node.js', 'TypeScript'],
      preferredModalities: overrides.preferredModalities ?? ['REMOTE'],
      searchRadiusKm: 50,
    },
  })
  return { user, profile }
}

export async function createCompany(overrides: Partial<{
  plan: string
  credits: number
}> = {}) {
  return prisma.company.create({
    data: {
      name: 'Test Company',
      plan: overrides.plan ?? 'FREE',
      credits: overrides.credits ?? 0,
    },
  })
}

export async function createRecruiter(companyId: string) {
  const user = await createUser({ role: 'RECRUITER' })
  const profile = await prisma.recruiterProfile.create({
    data: { userId: user.id, companyId },
  })
  return { user, profile }
}

export async function createJob(companyId: string, overrides: Partial<{
  professionId: string
  modality: Modality
  requiredSkills: string[]
  isActive: boolean
  expiresAt: Date
}> = {}) {
  return prisma.job.create({
    data: {
      companyId,
      title: 'Backend Developer',
      description: 'We need a backend dev',
      professionId: overrides.professionId ?? 'backend-dev',
      modality: overrides.modality ?? 'REMOTE',
      requiredSkills: overrides.requiredSkills ?? ['Node.js', 'TypeScript'],
      isActive: overrides.isActive ?? true,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  })
}
```

- [ ] **Step 9: Verificar que o servidor inicia**

```bash
cp .env.example .env
# Preencher .env com os valores reais
npx ts-node src/server.ts
```
Expected: `Server running on port 3000`

- [ ] **Step 10: Commit**

```bash
git add src/ tests/
git commit -m "feat: shared infrastructure, app factory, test helpers and factories"
```

---

## Task 4: Auth — Register e Login

**Files:**
- Create: `src/shared/plugins/jwt.ts`
- Create: `src/shared/hooks/authenticate.ts`
- Create: `src/modules/auth/auth.schema.ts`
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/auth.routes.ts`
- Create: `tests/unit/auth.service.test.ts`
- Create: `tests/integration/auth.test.ts`

- [ ] **Step 1: Escrever testes unitários para AuthService (failing)**

```typescript
// tests/unit/auth.service.test.ts
import { AuthService } from '../../src/modules/auth/auth.service'
import { AppError } from '../../src/shared/errors/AppError'
import bcrypt from 'bcryptjs'

jest.mock('../../src/shared/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

import { prisma } from '../../src/shared/db/prisma'
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService()
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('should throw if email already exists', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: '1' })

      await expect(
        service.register({ email: 'a@a.com', password: '123456', role: 'CANDIDATE' }),
      ).rejects.toThrow(new AppError('Email already in use', 409))
    })

    it('should hash password and create user', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'uuid-1',
        email: 'a@a.com',
        role: 'CANDIDATE',
      })

      const result = await service.register({ email: 'a@a.com', password: '123456', role: 'CANDIDATE' })

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'a@a.com', role: 'CANDIDATE' }),
        }),
      )
      expect(result).toHaveProperty('id')
    })
  })

  describe('validateCredentials', () => {
    it('should throw if user not found', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(
        service.validateCredentials('a@a.com', 'wrongpass'),
      ).rejects.toThrow(new AppError('Invalid credentials', 401))
    })

    it('should throw if password does not match', async () => {
      const hash = await bcrypt.hash('correctpass', 10)
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        passwordHash: hash,
      })

      await expect(
        service.validateCredentials('a@a.com', 'wrongpass'),
      ).rejects.toThrow(new AppError('Invalid credentials', 401))
    })

    it('should return user if credentials are valid', async () => {
      const hash = await bcrypt.hash('correctpass', 10)
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: '1',
        email: 'a@a.com',
        passwordHash: hash,
        role: 'CANDIDATE',
      })

      const result = await service.validateCredentials('a@a.com', 'correctpass')
      expect(result.id).toBe('1')
    })
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npm run test:unit -- auth.service
```
Expected: FAIL — `Cannot find module '../../src/modules/auth/auth.service'`

- [ ] **Step 3: Criar `src/shared/plugins/jwt.ts`**

```typescript
import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import { FastifyInstance } from 'fastify'

export default fp(async function jwtPlugin(app: FastifyInstance) {
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  })
})
```

- [ ] **Step 4: Criar `src/shared/hooks/authenticate.ts`**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}
```

- [ ] **Step 5: Criar `src/modules/auth/auth.schema.ts`**

```typescript
import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
```

- [ ] **Step 6: Criar `src/modules/auth/auth.service.ts`**

```typescript
import bcrypt from 'bcryptjs'
import { prisma } from '@shared/db/prisma'
import { AppError } from '@shared/errors/AppError'
import { RegisterInput } from './auth.schema'
import { Role } from '@prisma/client'

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw new AppError('Email already in use', 409)

    const passwordHash = await bcrypt.hash(input.password, 12)

    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role as Role,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    })
  }

  async validateCredentials(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401)

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new AppError('Invalid credentials', 401)

    return user
  }
}
```

- [ ] **Step 7: Rodar testes unitários**

```bash
npm run test:unit -- auth.service
```
Expected: PASS (3 testes)

- [ ] **Step 8: Criar `src/modules/auth/auth.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { AuthService } from './auth.service'
import { loginSchema, registerSchema } from './auth.schema'

const authService = new AuthService()

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body)
    const user = await authService.register(body)
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' })
    return reply.status(201).send({ accessToken, refreshToken, user })
  })

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const user = await authService.validateCredentials(body.email, body.password)
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' })
    return reply.send({ accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } })
  })

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string }
    try {
      const payload = app.jwt.verify<{ sub: string; type: string }>(refreshToken)
      if (payload.type !== 'refresh') throw new Error()
      // Busca user para obter role atual
      const { prisma } = await import('@shared/db/prisma')
      const user = await prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user) throw new Error()
      const accessToken = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '15m' })
      return reply.send({ accessToken })
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }
  })
}
```

- [ ] **Step 9: Registrar plugin e rotas em `src/app.ts`**

```typescript
import Fastify, { FastifyInstance } from 'fastify'
import { errorHandler } from './shared/errors/errorHandler'
import jwtPlugin from './shared/plugins/jwt'
import { authRoutes } from './modules/auth/auth.routes'

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: !opts.testing })

  app.setErrorHandler(errorHandler)

  await app.register(jwtPlugin)
  await app.register(authRoutes)

  return app
}
```

- [ ] **Step 10: Escrever testes de integração para auth (failing)**

```typescript
// tests/integration/auth.test.ts
import supertest from 'supertest'
import { buildApp } from '../../src/app'
import { FastifyInstance } from 'fastify'

describe('Auth Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ testing: true })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('POST /auth/register', () => {
    it('should register a new candidate', async () => {
      const res = await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'candidate@test.com', password: 'password123', role: 'CANDIDATE' })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('accessToken')
      expect(res.body.user.role).toBe('CANDIDATE')
    })

    it('should return 409 if email already exists', async () => {
      await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'dup@test.com', password: 'password123', role: 'CANDIDATE' })

      const res = await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'dup@test.com', password: 'password123', role: 'CANDIDATE' })

      expect(res.status).toBe(409)
    })
  })

  describe('POST /auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'login@test.com', password: 'password123', role: 'CANDIDATE' })

      const res = await supertest(app.server)
        .post('/auth/login')
        .send({ email: 'login@test.com', password: 'password123' })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('accessToken')
      expect(res.body).toHaveProperty('refreshToken')
    })

    it('should return 401 for invalid credentials', async () => {
      const res = await supertest(app.server)
        .post('/auth/login')
        .send({ email: 'noone@test.com', password: 'wrong' })

      expect(res.status).toBe(401)
    })
  })
})
```

- [ ] **Step 11: Rodar testes de integração**

```bash
npm run test:integration -- auth
```
Expected: PASS (4 testes)

- [ ] **Step 12: Commit**

```bash
git add src/modules/auth/ src/shared/ tests/
git commit -m "feat: auth module with register, login, and JWT refresh"
```

---

## Task 5: Google OAuth

**Files:**
- Create: `src/shared/plugins/oauth.ts`
- Modify: `src/modules/auth/auth.routes.ts`

- [ ] **Step 1: Criar `src/shared/plugins/oauth.ts`**

```typescript
import fp from 'fastify-plugin'
import oauthPlugin from '@fastify/oauth2'
import { FastifyInstance } from 'fastify'

export default fp(async function googleOAuth(app: FastifyInstance) {
  app.register(oauthPlugin, {
    name: 'googleOAuth2',
    scope: ['profile', 'email'],
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID!,
        secret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      auth: oauthPlugin.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/auth/google',
    callbackUri: process.env.GOOGLE_CALLBACK_URL!,
  })
})
```

- [ ] **Step 2: Adicionar rota de callback em `auth.routes.ts`**

Adicionar ao final da função `authRoutes`:

```typescript
  app.get('/auth/google/callback', async (request, reply) => {
    const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    const googleUser = await userInfoRes.json() as { id: string; email: string; picture: string }

    const { prisma } = await import('@shared/db/prisma')

    let user = await prisma.user.findUnique({ where: { googleId: googleUser.id } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          googleId: googleUser.id,
          avatarUrl: googleUser.picture,
          role: 'CANDIDATE', // default; pode ser alterado no onboarding
        },
      })
    }

    const accessToken = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: '7d' })

    return reply.send({ accessToken, refreshToken })
  })
```

- [ ] **Step 3: Registrar plugin OAuth em `src/app.ts`**

```typescript
import googleOAuth from './shared/plugins/oauth'
// adicionar após jwtPlugin:
await app.register(googleOAuth)
```

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: Google OAuth2 callback flow"
```

---

## Task 6: Candidate Profile

**Files:**
- Create: `src/modules/candidates/candidates.schema.ts`
- Create: `src/modules/candidates/candidates.repository.ts`
- Create: `src/modules/candidates/candidates.service.ts`
- Create: `src/modules/candidates/candidates.routes.ts`
- Create: `src/shared/hooks/requireRole.ts`
- Create: `tests/unit/candidates.service.test.ts`
- Create: `tests/integration/candidates.test.ts`

- [ ] **Step 1: Criar `src/shared/hooks/requireRole.ts`**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { Role } from '@prisma/client'

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = request.user as { sub: string; role: Role }
    if (!roles.includes(payload.role)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}
```

- [ ] **Step 2: Escrever testes unitários para CandidatesService (failing)**

```typescript
// tests/unit/candidates.service.test.ts
import { CandidatesService } from '../../src/modules/candidates/candidates.service'
import { AppError } from '../../src/shared/errors/AppError'

jest.mock('../../src/modules/candidates/candidates.repository')
import { CandidatesRepository } from '../../src/modules/candidates/candidates.repository'

const mockRepo = CandidatesRepository as jest.MockedClass<typeof CandidatesRepository>

describe('CandidatesService', () => {
  let service: CandidatesService

  beforeEach(() => {
    mockRepo.mockClear()
    service = new CandidatesService(new mockRepo())
  })

  it('should throw if profile already exists', async () => {
    mockRepo.prototype.findByUserId.mockResolvedValue({ id: 'exists' } as any)

    await expect(
      service.createProfile('user-1', {
        name: 'John',
        professionId: 'backend-dev',
        skills: ['Node.js'],
        preferredModalities: ['REMOTE'],
        searchRadiusKm: 50,
      }),
    ).rejects.toThrow(new AppError('Profile already exists', 409))
  })

  it('should create profile if none exists', async () => {
    mockRepo.prototype.findByUserId.mockResolvedValue(null)
    mockRepo.prototype.create.mockResolvedValue({ id: 'new-profile' } as any)

    const result = await service.createProfile('user-1', {
      name: 'John',
      professionId: 'backend-dev',
      skills: ['Node.js'],
      preferredModalities: ['REMOTE'],
      searchRadiusKm: 50,
    })

    expect(result).toHaveProperty('id', 'new-profile')
  })
})
```

- [ ] **Step 3: Rodar para confirmar falha**

```bash
npm run test:unit -- candidates.service
```
Expected: FAIL

- [ ] **Step 4: Criar `src/modules/candidates/candidates.schema.ts`**

```typescript
import { z } from 'zod'

export const createProfileSchema = z.object({
  name: z.string().min(2),
  bio: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  professionId: z.string(),
  skills: z.array(z.string()).min(1),
  preferredModalities: z.array(z.enum(['REMOTE', 'HYBRID', 'IN_PERSON'])).min(1),
  searchRadiusKm: z.number().int().positive().default(50),
})

export const updateProfileSchema = createProfileSchema.partial()

export type CreateProfileInput = z.infer<typeof createProfileSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
```

- [ ] **Step 5: Criar `src/modules/candidates/candidates.repository.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { CreateProfileInput, UpdateProfileInput } from './candidates.schema'

export class CandidatesRepository {
  findByUserId(userId: string) {
    return prisma.candidateProfile.findUnique({ where: { userId } })
  }

  create(userId: string, data: CreateProfileInput) {
    return prisma.candidateProfile.create({ data: { userId, ...data } })
  }

  update(userId: string, data: UpdateProfileInput) {
    return prisma.candidateProfile.update({ where: { userId }, data })
  }
}
```

- [ ] **Step 6: Criar `src/modules/candidates/candidates.service.ts`**

```typescript
import { AppError } from '@shared/errors/AppError'
import { CandidatesRepository } from './candidates.repository'
import { CreateProfileInput, UpdateProfileInput } from './candidates.schema'

export class CandidatesService {
  constructor(private readonly repo: CandidatesRepository) {}

  async createProfile(userId: string, data: CreateProfileInput) {
    const existing = await this.repo.findByUserId(userId)
    if (existing) throw new AppError('Profile already exists', 409)
    return this.repo.create(userId, data)
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const existing = await this.repo.findByUserId(userId)
    if (!existing) throw new AppError('Profile not found', 404)
    return this.repo.update(userId, data)
  }

  async getProfile(userId: string) {
    const profile = await this.repo.findByUserId(userId)
    if (!profile) throw new AppError('Profile not found', 404)
    return profile
  }
}
```

- [ ] **Step 7: Rodar testes unitários**

```bash
npm run test:unit -- candidates.service
```
Expected: PASS (2 testes)

- [ ] **Step 8: Criar `src/modules/candidates/candidates.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { authenticate } from '@shared/hooks/authenticate'
import { requireRole } from '@shared/hooks/requireRole'
import { CandidatesService } from './candidates.service'
import { CandidatesRepository } from './candidates.repository'
import { createProfileSchema, updateProfileSchema } from './candidates.schema'

const service = new CandidatesService(new CandidatesRepository())

export async function candidatesRoutes(app: FastifyInstance) {
  app.post(
    '/candidates/profile',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const body = createProfileSchema.parse(request.body)
      const profile = await service.createProfile(userId, body)
      return reply.status(201).send(profile)
    },
  )

  app.get(
    '/candidates/profile',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      return service.getProfile(userId)
    },
  )

  app.patch(
    '/candidates/profile',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const body = updateProfileSchema.parse(request.body)
      return service.updateProfile(userId, body)
    },
  )
}
```

- [ ] **Step 9: Registrar rotas em `src/app.ts`**

```typescript
import { candidatesRoutes } from './modules/candidates/candidates.routes'
// adicionar:
await app.register(candidatesRoutes)
```

- [ ] **Step 10: Escrever e rodar testes de integração**

```typescript
// tests/integration/candidates.test.ts
import supertest from 'supertest'
import { buildApp } from '../../src/app'
import { FastifyInstance } from 'fastify'
import { createUser } from '../helpers/factories'
import { prisma } from '../../src/shared/db/prisma'

describe('Candidate Profile Endpoints', () => {
  let app: FastifyInstance
  let candidateToken: string

  beforeAll(async () => {
    app = await buildApp({ testing: true })
    await app.ready()
  })

  afterAll(() => app.close())

  beforeEach(async () => {
    const user = await createUser({ role: 'CANDIDATE' })
    candidateToken = app.jwt.sign({ sub: user.id, role: 'CANDIDATE' }, { expiresIn: '1h' })
  })

  it('POST /candidates/profile — should create profile', async () => {
    const res = await supertest(app.server)
      .post('/candidates/profile')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({
        name: 'John Dev',
        professionId: 'backend-dev',
        skills: ['Node.js'],
        preferredModalities: ['REMOTE'],
        searchRadiusKm: 50,
      })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('John Dev')
  })

  it('GET /candidates/profile — should return profile', async () => {
    await supertest(app.server)
      .post('/candidates/profile')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ name: 'John', professionId: 'backend-dev', skills: ['Node.js'], preferredModalities: ['REMOTE'], searchRadiusKm: 50 })

    const res = await supertest(app.server)
      .get('/candidates/profile')
      .set('Authorization', `Bearer ${candidateToken}`)

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('John')
  })
})
```

```bash
npm run test:integration -- candidates
```
Expected: PASS (2 testes)

- [ ] **Step 11: Commit**

```bash
git add src/modules/candidates/ src/shared/hooks/
git commit -m "feat: candidate profile CRUD with role-based auth"
```

---

## Task 7: Company e Recruiter

**Files:**
- Create: `src/modules/companies/companies.schema.ts`
- Create: `src/modules/companies/companies.repository.ts`
- Create: `src/modules/companies/companies.service.ts`
- Create: `src/modules/companies/companies.routes.ts`
- Create: `tests/integration/companies.test.ts`

- [ ] **Step 1: Criar `src/modules/companies/companies.schema.ts`**

```typescript
import { z } from 'zod'

export const createCompanySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
})

export type CreateCompanyInput = z.infer<typeof createCompanySchema>
```

- [ ] **Step 2: Criar `src/modules/companies/companies.repository.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { CreateCompanyInput } from './companies.schema'

export class CompaniesRepository {
  create(data: CreateCompanyInput) {
    return prisma.company.create({ data })
  }

  findById(id: string) {
    return prisma.company.findUnique({ where: { id }, include: { jobs: { where: { isActive: true } } } })
  }

  countActiveJobs(companyId: string) {
    return prisma.job.count({ where: { companyId, isActive: true } })
  }
}
```

- [ ] **Step 3: Criar `src/modules/companies/companies.service.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { AppError } from '@shared/errors/AppError'
import { CompaniesRepository } from './companies.repository'
import { CreateCompanyInput } from './companies.schema'

const PLAN_JOB_LIMITS: Record<string, number> = {
  FREE: 3,
}

export class CompaniesService {
  constructor(private readonly repo: CompaniesRepository) {}

  async createCompanyAndLinkRecruiter(userId: string, data: CreateCompanyInput) {
    const existingProfile = await prisma.recruiterProfile.findUnique({ where: { userId } })
    if (existingProfile) throw new AppError('Recruiter profile already exists', 409)

    const company = await this.repo.create(data)
    await prisma.recruiterProfile.create({ data: { userId, companyId: company.id } })
    return company
  }

  async getCompany(companyId: string) {
    const company = await this.repo.findById(companyId)
    if (!company) throw new AppError('Company not found', 404)
    return company
  }

  async assertCanPostJob(companyId: string) {
    const company = await this.repo.findById(companyId)
    if (!company) throw new AppError('Company not found', 404)

    const activeJobs = await this.repo.countActiveJobs(companyId)
    const limit = PLAN_JOB_LIMITS[company.plan] ?? 999

    if (activeJobs >= limit) {
      throw new AppError(`Job limit reached for plan ${company.plan}. Upgrade to post more.`, 403)
    }
  }
}
```

- [ ] **Step 4: Criar `src/modules/companies/companies.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { authenticate } from '@shared/hooks/authenticate'
import { requireRole } from '@shared/hooks/requireRole'
import { CompaniesService } from './companies.service'
import { CompaniesRepository } from './companies.repository'
import { createCompanySchema } from './companies.schema'

const service = new CompaniesService(new CompaniesRepository())

export async function companiesRoutes(app: FastifyInstance) {
  app.post(
    '/companies',
    { preHandler: [authenticate, requireRole('RECRUITER')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const body = createCompanySchema.parse(request.body)
      const company = await service.createCompanyAndLinkRecruiter(userId, body)
      return reply.status(201).send(company)
    },
  )

  app.get(
    '/companies/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      return service.getCompany(id)
    },
  )
}
```

- [ ] **Step 5: Registrar em `src/app.ts`**

```typescript
import { companiesRoutes } from './modules/companies/companies.routes'
await app.register(companiesRoutes)
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/companies/
git commit -m "feat: company creation and recruiter profile linking with plan job limits"
```

---

## Task 8: Jobs Module

**Files:**
- Create: `src/modules/jobs/jobs.schema.ts`
- Create: `src/modules/jobs/jobs.repository.ts`
- Create: `src/modules/jobs/jobs.service.ts`
- Create: `src/modules/jobs/jobs.routes.ts`
- Create: `tests/integration/jobs.test.ts`

- [ ] **Step 1: Criar `src/modules/jobs/jobs.schema.ts`**

```typescript
import { z } from 'zod'

export const createJobSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  professionId: z.string(),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']),
  requiredSkills: z.array(z.string()).min(1),
})

export type CreateJobInput = z.infer<typeof createJobSchema>
```

- [ ] **Step 2: Criar `src/modules/jobs/jobs.repository.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { CreateJobInput } from './jobs.schema'

const PLAN_DURATION_DAYS: Record<string, number> = { FREE: 3 }

export class JobsRepository {
  async create(companyId: string, plan: string, data: CreateJobInput) {
    const durationDays = PLAN_DURATION_DAYS[plan] ?? 30
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    return prisma.job.create({ data: { companyId, ...data, expiresAt } })
  }

  findById(id: string) {
    return prisma.job.findUnique({ where: { id }, include: { company: true } })
  }

  findByCompany(companyId: string) {
    return prisma.job.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } })
  }

  deactivateExpired() {
    return prisma.job.updateMany({
      where: { isActive: true, expiresAt: { lte: new Date() } },
      data: { isActive: false },
    })
  }

  delete(id: string, companyId: string) {
    return prisma.job.delete({ where: { id, companyId } })
  }
}
```

- [ ] **Step 3: Criar `src/modules/jobs/jobs.service.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { AppError } from '@shared/errors/AppError'
import { CompaniesService } from '@modules/companies/companies.service'
import { CompaniesRepository } from '@modules/companies/companies.repository'
import { JobsRepository } from './jobs.repository'
import { CreateJobInput } from './jobs.schema'

const companiesService = new CompaniesService(new CompaniesRepository())

export class JobsService {
  constructor(private readonly repo: JobsRepository) {}

  async createJob(userId: string, data: CreateJobInput) {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId },
      include: { company: true },
    })
    if (!recruiter) throw new AppError('Recruiter profile not found', 404)

    await companiesService.assertCanPostJob(recruiter.companyId)

    return this.repo.create(recruiter.companyId, recruiter.company.plan, data)
  }

  async getMyJobs(userId: string) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId } })
    if (!recruiter) throw new AppError('Recruiter profile not found', 404)
    return this.repo.findByCompany(recruiter.companyId)
  }

  async deleteJob(userId: string, jobId: string) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId } })
    if (!recruiter) throw new AppError('Recruiter profile not found', 404)
    return this.repo.delete(jobId, recruiter.companyId)
  }
}
```

- [ ] **Step 4: Criar `src/modules/jobs/jobs.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { authenticate } from '@shared/hooks/authenticate'
import { requireRole } from '@shared/hooks/requireRole'
import { JobsService } from './jobs.service'
import { JobsRepository } from './jobs.repository'
import { createJobSchema } from './jobs.schema'

const service = new JobsService(new JobsRepository())

export async function jobsRoutes(app: FastifyInstance) {
  app.post(
    '/jobs',
    { preHandler: [authenticate, requireRole('RECRUITER')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const body = createJobSchema.parse(request.body)
      const job = await service.createJob(userId, body)
      return reply.status(201).send(job)
    },
  )

  app.get(
    '/jobs/mine',
    { preHandler: [authenticate, requireRole('RECRUITER')] },
    async (request) => {
      const userId = (request.user as { sub: string }).sub
      return service.getMyJobs(userId)
    },
  )

  app.delete(
    '/jobs/:id',
    { preHandler: [authenticate, requireRole('RECRUITER')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const { id } = request.params as { id: string }
      await service.deleteJob(userId, id)
      return reply.status(204).send()
    },
  )
}
```

- [ ] **Step 5: Registrar em `src/app.ts`**

```typescript
import { jobsRoutes } from './modules/jobs/jobs.routes'
await app.register(jobsRoutes)
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/jobs/
git commit -m "feat: jobs module with create, list, delete and plan-based limits"
```

---

## Task 9: Job Expiration Scheduler

**Files:**
- Create: `src/modules/jobs/jobs.scheduler.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Criar `src/modules/jobs/jobs.scheduler.ts`**

```typescript
import cron from 'node-cron'
import { JobsRepository } from './jobs.repository'

const repo = new JobsRepository()

export function startJobScheduler() {
  // Roda a cada hora
  cron.schedule('0 * * * *', async () => {
    const result = await repo.deactivateExpired()
    console.log(`[Scheduler] Deactivated ${result.count} expired jobs`)
  })
}
```

- [ ] **Step 2: Iniciar scheduler em `src/server.ts`**

```typescript
import { startJobScheduler } from './modules/jobs/jobs.scheduler'

// adicionar antes de app.listen:
startJobScheduler()
```

- [ ] **Step 3: Escrever teste unitário para scheduler**

```typescript
// tests/unit/jobs.scheduler.test.ts
import { JobsRepository } from '../../src/modules/jobs/jobs.repository'

jest.mock('../../src/modules/jobs/jobs.repository')
const mockRepo = JobsRepository as jest.MockedClass<typeof JobsRepository>

describe('JobsRepository.deactivateExpired', () => {
  it('should call updateMany with correct filter', async () => {
    const repo = new mockRepo()
    mockRepo.prototype.deactivateExpired.mockResolvedValue({ count: 2 })

    const result = await repo.deactivateExpired()
    expect(result.count).toBe(2)
    expect(mockRepo.prototype.deactivateExpired).toHaveBeenCalledTimes(1)
  })
})
```

```bash
npm run test:unit -- jobs.scheduler
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/jobs/jobs.scheduler.ts src/server.ts tests/unit/jobs.scheduler.test.ts
git commit -m "feat: job expiration scheduler running hourly"
```

---

## Task 10: Swipes Module

**Files:**
- Create: `src/modules/swipes/swipes.schema.ts`
- Create: `src/modules/swipes/swipes.repository.ts`
- Create: `src/modules/swipes/swipes.service.ts`
- Create: `src/modules/swipes/swipes.routes.ts`
- Create: `tests/unit/swipes.service.test.ts`
- Create: `tests/integration/swipes.test.ts`

- [ ] **Step 1: Escrever testes unitários (failing)**

```typescript
// tests/unit/swipes.service.test.ts
import { SwipesService } from '../../src/modules/swipes/swipes.service'
import { AppError } from '../../src/shared/errors/AppError'

jest.mock('../../src/modules/swipes/swipes.repository')
import { SwipesRepository } from '../../src/modules/swipes/swipes.repository'

const mockRepo = SwipesRepository as jest.MockedClass<typeof SwipesRepository>

describe('SwipesService', () => {
  let service: SwipesService

  beforeEach(() => {
    mockRepo.mockClear()
    service = new SwipesService(new mockRepo())
  })

  it('should throw if already swiped', async () => {
    mockRepo.prototype.findSwipe.mockResolvedValue({ id: 'exists' } as any)

    await expect(
      service.swipe('candidate-1', 'job-1', 'LIKE'),
    ).rejects.toThrow(new AppError('Already swiped on this job', 409))
  })

  it('should record swipe if not exists', async () => {
    mockRepo.prototype.findSwipe.mockResolvedValue(null)
    mockRepo.prototype.create.mockResolvedValue({ id: 'new-swipe', direction: 'LIKE' } as any)

    const result = await service.swipe('candidate-1', 'job-1', 'LIKE')
    expect(result.direction).toBe('LIKE')
  })
})
```

```bash
npm run test:unit -- swipes.service
```
Expected: FAIL

- [ ] **Step 2: Criar `src/modules/swipes/swipes.repository.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { SwipeDirection } from '@prisma/client'

export class SwipesRepository {
  findSwipe(candidateId: string, jobId: string) {
    return prisma.swipe.findUnique({ where: { candidateId_jobId: { candidateId, jobId } } })
  }

  create(candidateId: string, jobId: string, direction: SwipeDirection) {
    return prisma.swipe.create({ data: { candidateId, jobId, direction } })
  }

  getLikedCandidatesForJob(jobId: string) {
    return prisma.swipe.findMany({
      where: { jobId, direction: 'LIKE' },
      include: { candidate: true },
    })
  }
}
```

- [ ] **Step 3: Criar `src/modules/swipes/swipes.service.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { AppError } from '@shared/errors/AppError'
import { SwipesRepository } from './swipes.repository'
import { SwipeDirection } from '@prisma/client'

export class SwipesService {
  constructor(private readonly repo: SwipesRepository) {}

  async swipe(userId: string, jobId: string, direction: SwipeDirection) {
    const candidate = await prisma.candidateProfile.findUnique({ where: { userId } })
    if (!candidate) throw new AppError('Candidate profile not found', 404)

    const existing = await this.repo.findSwipe(candidate.id, jobId)
    if (existing) throw new AppError('Already swiped on this job', 409)

    const swipe = await this.repo.create(candidate.id, jobId, direction)

    // Se LIKE, criar chat automaticamente
    if (direction === 'LIKE') {
      const job = await prisma.job.findUnique({ where: { id: jobId } })
      if (job) {
        await prisma.chat.create({
          data: {
            candidateId: candidate.id,
            jobId,
            companyId: job.companyId,
            initiatedBy: 'MATCH',
          },
        })
      }
    }

    return swipe
  }

  async getLikedCandidatesForJob(userId: string, jobId: string) {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId },
      include: { company: true },
    })
    if (!recruiter) throw new AppError('Recruiter not found', 404)

    const job = await prisma.job.findUnique({ where: { id: jobId } })
    if (!job || job.companyId !== recruiter.companyId) throw new AppError('Job not found', 404)

    return this.repo.getLikedCandidatesForJob(jobId)
  }
}
```

- [ ] **Step 4: Criar `src/modules/swipes/swipes.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '@shared/hooks/authenticate'
import { requireRole } from '@shared/hooks/requireRole'
import { SwipesService } from './swipes.service'
import { SwipesRepository } from './swipes.repository'

const service = new SwipesService(new SwipesRepository())

const swipeSchema = z.object({
  jobId: z.string().uuid(),
  direction: z.enum(['LIKE', 'DISLIKE']),
})

export async function swipesRoutes(app: FastifyInstance) {
  app.post(
    '/swipes',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const { jobId, direction } = swipeSchema.parse(request.body)
      const swipe = await service.swipe(userId, jobId, direction)
      return reply.status(201).send(swipe)
    },
  )

  app.get(
    '/jobs/:jobId/candidates',
    { preHandler: [authenticate, requireRole('RECRUITER')] },
    async (request) => {
      const userId = (request.user as { sub: string }).sub
      const { jobId } = request.params as { jobId: string }
      return service.getLikedCandidatesForJob(userId, jobId)
    },
  )
}
```

- [ ] **Step 5: Registrar em `src/app.ts`**

```typescript
import { swipesRoutes } from './modules/swipes/swipes.routes'
await app.register(swipesRoutes)
```

- [ ] **Step 6: Rodar testes unitários**

```bash
npm run test:unit -- swipes.service
```
Expected: PASS (2 testes)

- [ ] **Step 7: Commit**

```bash
git add src/modules/swipes/
git commit -m "feat: swipes module with like/dislike and auto-chat creation on match"
```

---

## Task 11: Neo4j Setup e Admin de Profissões

**Files:**
- Create: `src/modules/recommendation/recommendation.repository.ts`
- Create: `src/modules/admin/admin.service.ts`
- Create: `src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Criar `src/modules/recommendation/recommendation.repository.ts`**

```typescript
import { getNeo4jDriver } from '@shared/db/neo4j'

export interface ProfessionNode {
  id: string
  name: string
  area: string
}

export interface ProfessionRelation {
  fromId: string
  toId: string
  weight: number
}

export class RecommendationRepository {
  private get driver() {
    return getNeo4jDriver()
  }

  async createProfession(profession: ProfessionNode): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        'MERGE (p:Profession {id: $id}) SET p.name = $name, p.area = $area',
        profession,
      )
    } finally {
      await session.close()
    }
  }

  async createRelation(relation: ProfessionRelation): Promise<void> {
    const session = this.driver.session()
    try {
      await session.run(
        `MATCH (a:Profession {id: $fromId}), (b:Profession {id: $toId})
         MERGE (a)-[r:RELATED_TO]->(b)
         SET r.weight = $weight
         MERGE (b)-[r2:RELATED_TO]->(a)
         SET r2.weight = $weight`,
        relation,
      )
    } finally {
      await session.close()
    }
  }

  async getAllProfessions(): Promise<ProfessionNode[]> {
    const session = this.driver.session()
    try {
      const result = await session.run('MATCH (p:Profession) RETURN p ORDER BY p.area, p.name')
      return result.records.map((r) => r.get('p').properties as ProfessionNode)
    } finally {
      await session.close()
    }
  }

  async getMatchScore(candidateProfessionId: string, jobProfessionId: string): Promise<number> {
    if (candidateProfessionId === jobProfessionId) return 1.0

    const session = this.driver.session()
    try {
      // Busca caminho mais curto e multiplica pesos das arestas
      const result = await session.run(
        `MATCH p = shortestPath(
           (a:Profession {id: $candidateId})-[:RELATED_TO*1..3]-(b:Profession {id: $jobId})
         )
         WITH relationships(p) AS rels
         RETURN reduce(score = 1.0, r IN rels | score * r.weight) AS score`,
        { candidateId: candidateProfessionId, jobId: jobProfessionId },
      )

      if (result.records.length === 0) return 0
      return result.records[0].get('score') as number
    } finally {
      await session.close()
    }
  }
}
```

- [ ] **Step 2: Criar `src/modules/admin/admin.service.ts`**

```typescript
import { RecommendationRepository, ProfessionNode, ProfessionRelation } from '@modules/recommendation/recommendation.repository'

const repo = new RecommendationRepository()

export class AdminService {
  createProfession(data: ProfessionNode) {
    return repo.createProfession(data)
  }

  createRelation(data: ProfessionRelation) {
    return repo.createRelation(data)
  }

  getAllProfessions() {
    return repo.getAllProfessions()
  }
}
```

- [ ] **Step 3: Criar `src/modules/admin/admin.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '@shared/hooks/authenticate'
import { requireRole } from '@shared/hooks/requireRole'
import { AdminService } from './admin.service'

const service = new AdminService()

const professionSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: z.string(),
})

const relationSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  weight: z.number().min(0).max(1),
})

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    '/admin/professions',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    async () => service.getAllProfessions(),
  )

  app.post(
    '/admin/professions',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    async (request, reply) => {
      const body = professionSchema.parse(request.body)
      await service.createProfession(body)
      return reply.status(201).send({ message: 'Profession created' })
    },
  )

  app.post(
    '/admin/professions/relations',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    async (request, reply) => {
      const body = relationSchema.parse(request.body)
      await service.createRelation(body)
      return reply.status(201).send({ message: 'Relation created' })
    },
  )
}
```

- [ ] **Step 4: Registrar em `src/app.ts`**

```typescript
import { adminRoutes } from './modules/admin/admin.routes'
await app.register(adminRoutes)
```

- [ ] **Step 5: Seed inicial de profissões tech**

Criar `prisma/seed-neo4j.ts`:

```typescript
import 'dotenv/config'
import { RecommendationRepository } from '../src/modules/recommendation/recommendation.repository'
import { closeNeo4j } from '../src/shared/db/neo4j'

const repo = new RecommendationRepository()

async function seed() {
  const professions = [
    { id: 'backend-dev', name: 'Backend Developer', area: 'Tech' },
    { id: 'frontend-dev', name: 'Frontend Developer', area: 'Tech' },
    { id: 'fullstack-dev', name: 'Fullstack Developer', area: 'Tech' },
    { id: 'mobile-dev', name: 'Mobile Developer', area: 'Tech' },
    { id: 'devops', name: 'DevOps Engineer', area: 'Tech' },
    { id: 'data-engineer', name: 'Data Engineer', area: 'Tech' },
    { id: 'data-scientist', name: 'Data Scientist', area: 'Tech' },
    { id: 'ml-engineer', name: 'ML Engineer', area: 'Tech' },
    { id: 'ai-engineer', name: 'AI Engineer', area: 'Tech' },
    { id: 'qa-engineer', name: 'QA Engineer', area: 'Tech' },
    { id: 'tech-lead', name: 'Tech Lead', area: 'Tech' },
    { id: 'software-architect', name: 'Software Architect', area: 'Tech' },
  ]

  for (const p of professions) {
    await repo.createProfession(p)
    console.log(`Created: ${p.name}`)
  }

  const relations = [
    { fromId: 'backend-dev', toId: 'fullstack-dev', weight: 0.8 },
    { fromId: 'frontend-dev', toId: 'fullstack-dev', weight: 0.8 },
    { fromId: 'backend-dev', toId: 'frontend-dev', weight: 0.5 },
    { fromId: 'backend-dev', toId: 'devops', weight: 0.6 },
    { fromId: 'backend-dev', toId: 'tech-lead', weight: 0.7 },
    { fromId: 'fullstack-dev', toId: 'tech-lead', weight: 0.7 },
    { fromId: 'tech-lead', toId: 'software-architect', weight: 0.8 },
    { fromId: 'data-engineer', toId: 'data-scientist', weight: 0.7 },
    { fromId: 'data-scientist', toId: 'ml-engineer', weight: 0.8 },
    { fromId: 'ml-engineer', toId: 'ai-engineer', weight: 0.9 },
    { fromId: 'backend-dev', toId: 'data-engineer', weight: 0.5 },
    { fromId: 'mobile-dev', toId: 'frontend-dev', weight: 0.6 },
    { fromId: 'mobile-dev', toId: 'fullstack-dev', weight: 0.6 },
    { fromId: 'qa-engineer', toId: 'backend-dev', weight: 0.4 },
    { fromId: 'qa-engineer', toId: 'devops', weight: 0.5 },
  ]

  for (const r of relations) {
    await repo.createRelation(r)
    console.log(`Relation: ${r.fromId} <-> ${r.toId} (${r.weight})`)
  }

  await closeNeo4j()
  console.log('Seed complete')
}

seed().catch(console.error)
```

Adicionar script ao `package.json`:
```json
"seed:neo4j": "ts-node prisma/seed-neo4j.ts"
```

- [ ] **Step 6: Rodar seed**

```bash
npm run seed:neo4j
```
Expected: 12 profissões e 15 relações criadas no Neo4j.

- [ ] **Step 7: Commit**

```bash
git add src/modules/recommendation/ src/modules/admin/ prisma/seed-neo4j.ts
git commit -m "feat: Neo4j profession graph setup with admin CRUD and tech seed"
```

---

## Task 12: Recommendation Engine + Feed

**Files:**
- Create: `src/modules/recommendation/recommendation.service.ts`
- Create: `tests/unit/recommendation.service.test.ts`
- Modify: `src/modules/swipes/swipes.routes.ts` (adicionar endpoint de feed)

- [ ] **Step 1: Escrever testes unitários (failing)**

```typescript
// tests/unit/recommendation.service.test.ts
import { RecommendationService } from '../../src/modules/recommendation/recommendation.service'

jest.mock('../../src/modules/recommendation/recommendation.repository')
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'

const mockRepo = RecommendationRepository as jest.MockedClass<typeof RecommendationRepository>

describe('RecommendationService.calculateMatchScore', () => {
  let service: RecommendationService

  beforeEach(() => {
    mockRepo.mockClear()
    service = new RecommendationService(new mockRepo())
  })

  it('should return 0 for no profession match and no skill overlap', async () => {
    mockRepo.prototype.getMatchScore.mockResolvedValue(0)

    const score = await service.calculateMatchScore(
      { professionId: 'backend-dev', skills: ['Go'], lat: null, lng: null, searchRadiusKm: 50, preferredModalities: ['REMOTE'] },
      { professionId: 'designer', requiredSkills: ['Figma'], modality: 'REMOTE', lat: null, lng: null },
    )

    expect(score).toBe(0)
  })

  it('should return high score for same profession and all skills matching', async () => {
    mockRepo.prototype.getMatchScore.mockResolvedValue(1.0)

    const score = await service.calculateMatchScore(
      { professionId: 'backend-dev', skills: ['Node.js', 'TypeScript'], lat: null, lng: null, searchRadiusKm: 50, preferredModalities: ['REMOTE'] },
      { professionId: 'backend-dev', requiredSkills: ['Node.js', 'TypeScript'], modality: 'REMOTE', lat: null, lng: null },
    )

    expect(score).toBeCloseTo(0.85, 1) // 50% cargo + 35% skills = 85%
  })

  it('should return 0 when modality does not match', async () => {
    mockRepo.prototype.getMatchScore.mockResolvedValue(1.0)

    const score = await service.calculateMatchScore(
      { professionId: 'backend-dev', skills: ['Node.js'], lat: null, lng: null, searchRadiusKm: 50, preferredModalities: ['REMOTE'] },
      { professionId: 'backend-dev', requiredSkills: ['Node.js'], modality: 'IN_PERSON', lat: null, lng: null },
    )

    expect(score).toBe(0) // Filtro rígido de modalidade
  })
})
```

```bash
npm run test:unit -- recommendation.service
```
Expected: FAIL

- [ ] **Step 2: Criar `src/modules/recommendation/recommendation.service.ts`**

```typescript
import { RecommendationRepository } from './recommendation.repository'
import { CandidateProfile, Modality } from '@prisma/client'

interface CandidateContext {
  professionId: string
  skills: string[]
  lat: number | null
  lng: null | number
  searchRadiusKm: number
  preferredModalities: Modality[]
}

interface JobContext {
  professionId: string
  requiredSkills: string[]
  modality: Modality
  lat: number | null
  lng: number | null
}

const WEIGHTS = { profession: 0.5, skills: 0.35, location: 0.15 }
const MIN_SCORE = 0.3

export class RecommendationService {
  constructor(private readonly repo: RecommendationRepository) {}

  async calculateMatchScore(candidate: CandidateContext, job: JobContext): Promise<number> {
    // Filtro rígido de modalidade
    if (!candidate.preferredModalities.includes(job.modality)) return 0

    const professionScore = await this.repo.getMatchScore(candidate.professionId, job.professionId)

    const skillsInCommon = candidate.skills.filter((s) => job.requiredSkills.includes(s)).length
    const skillsScore = job.requiredSkills.length > 0 ? skillsInCommon / job.requiredSkills.length : 0

    let locationScore = 1.0
    if (job.modality !== 'REMOTE' && job.lat && job.lng && candidate.lat && candidate.lng) {
      const distKm = this.haversineKm(candidate.lat, candidate.lng, job.lat, job.lng)
      locationScore = distKm <= candidate.searchRadiusKm ? 1.0 : 0
    }

    return (
      professionScore * WEIGHTS.profession +
      skillsScore * WEIGHTS.skills +
      locationScore * WEIGHTS.location
    )
  }

  async getFeedForCandidate(candidate: CandidateProfile & { preferredModalities: Modality[] }, alreadySwiped: string[]) {
    const { prisma } = await import('@shared/db/prisma')

    const jobs = await prisma.job.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
        modality: { in: candidate.preferredModalities },
        id: { notIn: alreadySwiped },
      },
      include: { company: true },
    })

    const scored = await Promise.all(
      jobs.map(async (job) => {
        const score = await this.calculateMatchScore(
          {
            professionId: candidate.professionId,
            skills: candidate.skills,
            lat: candidate.lat,
            lng: candidate.lng,
            searchRadiusKm: candidate.searchRadiusKm,
            preferredModalities: candidate.preferredModalities,
          },
          {
            professionId: job.professionId,
            requiredSkills: job.requiredSkills,
            modality: job.modality,
            lat: job.lat,
            lng: job.lng,
          },
        )
        return { ...job, matchScore: Math.round(score * 100) }
      }),
    )

    return scored
      .filter((j) => j.matchScore >= MIN_SCORE * 100)
      .sort((a, b) => b.matchScore - a.matchScore)
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
}
```

- [ ] **Step 3: Rodar testes unitários**

```bash
npm run test:unit -- recommendation.service
```
Expected: PASS (3 testes)

- [ ] **Step 4: Adicionar endpoint de feed em `swipes.routes.ts`**

Adicionar dentro de `swipesRoutes`:

```typescript
  const recommendationService = new RecommendationService(new RecommendationRepository())

  app.get(
    '/feed',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    async (request) => {
      const userId = (request.user as { sub: string }).sub
      const { prisma } = await import('@shared/db/prisma')

      const candidate = await prisma.candidateProfile.findUnique({ where: { userId } })
      if (!candidate) throw new AppError('Profile not found', 404)

      const swipedJobs = await prisma.swipe.findMany({
        where: { candidateId: candidate.id },
        select: { jobId: true },
      })
      const alreadySwiped = swipedJobs.map((s) => s.jobId)

      return recommendationService.getFeedForCandidate(candidate, alreadySwiped)
    },
  )
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/recommendation/ tests/unit/recommendation.service.test.ts
git commit -m "feat: recommendation engine with match scoring and scored feed endpoint"
```

---

## Task 13: Credits Module

**Files:**
- Create: `src/modules/credits/credits.repository.ts`
- Create: `src/modules/credits/credits.service.ts`
- Create: `tests/unit/credits.service.test.ts`

- [ ] **Step 1: Escrever testes unitários (failing)**

```typescript
// tests/unit/credits.service.test.ts
import { CreditsService } from '../../src/modules/credits/credits.service'
import { AppError } from '../../src/shared/errors/AppError'

jest.mock('../../src/modules/credits/credits.repository')
import { CreditsRepository } from '../../src/modules/credits/credits.repository'

const mockRepo = CreditsRepository as jest.MockedClass<typeof CreditsRepository>

describe('CreditsService', () => {
  let service: CreditsService

  beforeEach(() => {
    mockRepo.mockClear()
    service = new CreditsService(new mockRepo())
  })

  it('should throw if company has insufficient credits', async () => {
    mockRepo.prototype.getBalance.mockResolvedValue(0)

    await expect(service.spend('company-1', 1, 'credit_chat')).rejects.toThrow(
      new AppError('Insufficient credits', 402),
    )
  })

  it('should deduct credits and record transaction', async () => {
    mockRepo.prototype.getBalance.mockResolvedValue(5)
    mockRepo.prototype.deductAndRecord.mockResolvedValue(undefined)

    await service.spend('company-1', 1, 'credit_chat')
    expect(mockRepo.prototype.deductAndRecord).toHaveBeenCalledWith('company-1', 1, 'credit_chat')
  })
})
```

```bash
npm run test:unit -- credits.service
```
Expected: FAIL

- [ ] **Step 2: Criar `src/modules/credits/credits.repository.ts`**

```typescript
import { prisma } from '@shared/db/prisma'

export class CreditsRepository {
  async getBalance(companyId: string): Promise<number> {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { credits: true } })
    return company?.credits ?? 0
  }

  async deductAndRecord(companyId: string, amount: number, reason: string): Promise<void> {
    await prisma.$transaction([
      prisma.company.update({
        where: { id: companyId },
        data: { credits: { decrement: amount } },
      }),
      prisma.creditTransaction.create({
        data: { companyId, amount: -amount, reason },
      }),
    ])
  }
}
```

- [ ] **Step 3: Criar `src/modules/credits/credits.service.ts`**

```typescript
import { AppError } from '@shared/errors/AppError'
import { CreditsRepository } from './credits.repository'

export class CreditsService {
  constructor(private readonly repo: CreditsRepository) {}

  async spend(companyId: string, amount: number, reason: string): Promise<void> {
    const balance = await this.repo.getBalance(companyId)
    if (balance < amount) throw new AppError('Insufficient credits', 402)
    await this.repo.deductAndRecord(companyId, amount, reason)
  }
}
```

- [ ] **Step 4: Rodar testes**

```bash
npm run test:unit -- credits.service
```
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/credits/ tests/unit/credits.service.test.ts
git commit -m "feat: credits module with balance check and atomic deduction"
```

---

## Task 14: Chat Module — HTTP Layer

**Files:**
- Create: `src/modules/chat/chat.repository.ts`
- Create: `src/modules/chat/chat.service.ts`
- Create: `src/modules/chat/chat.routes.ts`
- Create: `tests/unit/chat.service.test.ts`
- Create: `tests/integration/chat.test.ts`

- [ ] **Step 1: Escrever testes unitários (failing)**

```typescript
// tests/unit/chat.service.test.ts
import { ChatService } from '../../src/modules/chat/chat.service'
import { AppError } from '../../src/shared/errors/AppError'

jest.mock('../../src/modules/chat/chat.repository')
jest.mock('../../src/modules/credits/credits.service')
jest.mock('../../src/shared/db/prisma', () => ({
  prisma: {
    recruiterProfile: { findUnique: jest.fn() },
    candidateProfile: { findUnique: jest.fn() },
    chat: { findFirst: jest.fn(), create: jest.fn() },
    job: { findUnique: jest.fn() },
  },
}))

import { prisma } from '../../src/shared/db/prisma'
import { ChatRepository } from '../../src/modules/chat/chat.repository'
import { CreditsService } from '../../src/modules/credits/credits.service'

describe('ChatService.initiateCreditChat', () => {
  let service: ChatService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ChatService(
      new (ChatRepository as any)(),
      new (CreditsService as any)(),
    )
  })

  it('should throw if chat already exists', async () => {
    ;(prisma.recruiterProfile.findUnique as jest.Mock).mockResolvedValue({ companyId: 'co-1' })
    ;(prisma.chat.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-chat' })

    await expect(
      service.initiateCreditChat('recruiter-user', 'candidate-profile-id', 'job-id'),
    ).rejects.toThrow(new AppError('Chat already exists', 409))
  })
})
```

```bash
npm run test:unit -- chat.service
```
Expected: FAIL

- [ ] **Step 2: Criar `src/modules/chat/chat.repository.ts`**

```typescript
import { prisma } from '@shared/db/prisma'

export class ChatRepository {
  findExistingChat(candidateId: string, jobId: string) {
    return prisma.chat.findFirst({ where: { candidateId, jobId, isActive: true } })
  }

  createCreditChat(candidateId: string, jobId: string, companyId: string) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    return prisma.chat.create({
      data: { candidateId, jobId, companyId, initiatedBy: 'CREDIT', expiresAt },
    })
  }

  getChatsForCandidate(candidateId: string) {
    return prisma.chat.findMany({
      where: { candidateId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { job: { include: { company: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    })
  }

  getChatsForCompany(companyId: string) {
    return prisma.chat.findMany({
      where: { companyId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { candidate: true, job: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    })
  }

  getMessages(chatId: string) {
    return prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    })
  }

  deactivateExpiredCreditChats() {
    return prisma.chat.updateMany({
      where: { initiatedBy: 'CREDIT', isActive: true, expiresAt: { lte: new Date() } },
      data: { isActive: false },
    })
  }
}
```

- [ ] **Step 3: Criar `src/modules/chat/chat.service.ts`**

```typescript
import { prisma } from '@shared/db/prisma'
import { AppError } from '@shared/errors/AppError'
import { ChatRepository } from './chat.repository'
import { CreditsService } from '@modules/credits/credits.service'

export class ChatService {
  constructor(
    private readonly repo: ChatRepository,
    private readonly creditsService: CreditsService,
  ) {}

  async initiateCreditChat(recruiterUserId: string, candidateProfileId: string, jobId: string) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: recruiterUserId } })
    if (!recruiter) throw new AppError('Recruiter not found', 404)

    const existing = await this.repo.findExistingChat(candidateProfileId, jobId)
    if (existing) throw new AppError('Chat already exists', 409)

    await this.creditsService.spend(recruiter.companyId, 1, 'credit_chat')
    return this.repo.createCreditChat(candidateProfileId, jobId, recruiter.companyId)
  }

  async getMyChats(userId: string, role: 'CANDIDATE' | 'RECRUITER') {
    if (role === 'CANDIDATE') {
      const candidate = await prisma.candidateProfile.findUnique({ where: { userId } })
      if (!candidate) throw new AppError('Profile not found', 404)
      return this.repo.getChatsForCandidate(candidate.id)
    }

    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId } })
    if (!recruiter) throw new AppError('Profile not found', 404)
    return this.repo.getChatsForCompany(recruiter.companyId)
  }

  async getMessages(userId: string, chatId: string) {
    // Verifica que o usuário tem acesso ao chat
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { candidate: true, company: { include: { recruiters: true } } },
    })
    if (!chat) throw new AppError('Chat not found', 404)

    const isCandidateOwner = chat.candidate.userId === userId
    const isRecruiterOwner = chat.company.recruiters.some((r) => r.userId === userId)
    if (!isCandidateOwner && !isRecruiterOwner) throw new AppError('Forbidden', 403)

    return this.repo.getMessages(chatId)
  }
}
```

- [ ] **Step 4: Rodar testes unitários**

```bash
npm run test:unit -- chat.service
```
Expected: PASS (1 teste)

- [ ] **Step 5: Criar `src/modules/chat/chat.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '@shared/hooks/authenticate'
import { requireRole } from '@shared/hooks/requireRole'
import { ChatService } from './chat.service'
import { ChatRepository } from './chat.repository'
import { CreditsService } from '@modules/credits/credits.service'
import { CreditsRepository } from '@modules/credits/credits.repository'

const service = new ChatService(
  new ChatRepository(),
  new CreditsService(new CreditsRepository()),
)

const initiateChatSchema = z.object({
  candidateProfileId: z.string().uuid(),
  jobId: z.string().uuid(),
})

export async function chatRoutes(app: FastifyInstance) {
  app.post(
    '/chats/credit',
    { preHandler: [authenticate, requireRole('RECRUITER')] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub
      const { candidateProfileId, jobId } = initiateChatSchema.parse(request.body)
      const chat = await service.initiateCreditChat(userId, candidateProfileId, jobId)
      return reply.status(201).send(chat)
    },
  )

  app.get(
    '/chats',
    { preHandler: [authenticate] },
    async (request) => {
      const { sub: userId, role } = request.user as { sub: string; role: 'CANDIDATE' | 'RECRUITER' }
      return service.getMyChats(userId, role)
    },
  )

  app.get(
    '/chats/:chatId/messages',
    { preHandler: [authenticate] },
    async (request) => {
      const userId = (request.user as { sub: string }).sub
      const { chatId } = request.params as { chatId: string }
      return service.getMessages(userId, chatId)
    },
  )
}
```

- [ ] **Step 6: Registrar em `src/app.ts`**

```typescript
import { chatRoutes } from './modules/chat/chat.routes'
await app.register(chatRoutes)
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/chat/ src/modules/credits/
git commit -m "feat: chat module with credit-based initiation and message history"
```

---

## Task 15: Chat WebSocket (Tempo Real)

**Files:**
- Create: `src/shared/plugins/websocket.ts`
- Create: `src/modules/chat/chat.gateway.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Criar `src/shared/plugins/websocket.ts`**

```typescript
import fp from 'fastify-plugin'
import fastifyWebsocket from '@fastify/websocket'
import { FastifyInstance } from 'fastify'

export default fp(async function websocketPlugin(app: FastifyInstance) {
  app.register(fastifyWebsocket)
})
```

- [ ] **Step 2: Criar `src/modules/chat/chat.gateway.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { WebSocket } from 'ws'
import { prisma } from '@shared/db/prisma'

// Mapa de chatId → conjunto de conexões ativas
const rooms = new Map<string, Set<WebSocket>>()

export async function chatGateway(app: FastifyInstance) {
  app.get(
    '/ws/chat/:chatId',
    { websocket: true },
    async (socket, request) => {
      const { chatId } = request.params as { chatId: string }

      // Verifica JWT via query param (WS não suporta headers customizados facilmente)
      const token = (request.query as { token?: string }).token
      if (!token) {
        socket.close(1008, 'Unauthorized')
        return
      }

      let userId: string
      try {
        const payload = app.jwt.verify<{ sub: string }>(token)
        userId = payload.sub
      } catch {
        socket.close(1008, 'Invalid token')
        return
      }

      // Verifica acesso ao chat
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { candidate: true, company: { include: { recruiters: true } } },
      })

      if (!chat?.isActive) {
        socket.close(1008, 'Chat not found or inactive')
        return
      }

      const hasAccess =
        chat.candidate.userId === userId ||
        chat.company.recruiters.some((r) => r.userId === userId)

      if (!hasAccess) {
        socket.close(1008, 'Forbidden')
        return
      }

      // Adicionar ao room
      if (!rooms.has(chatId)) rooms.set(chatId, new Set())
      rooms.get(chatId)!.add(socket)

      socket.on('message', async (raw) => {
        try {
          const { content } = JSON.parse(raw.toString()) as { content: string }
          if (!content?.trim()) return

          const message = await prisma.message.create({
            data: { chatId, senderId: userId, content: content.trim() },
          })

          // Broadcast para todos no room
          const payload = JSON.stringify(message)
          rooms.get(chatId)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload)
            }
          })
        } catch {
          socket.send(JSON.stringify({ error: 'Failed to send message' }))
        }
      })

      socket.on('close', () => {
        rooms.get(chatId)?.delete(socket)
        if (rooms.get(chatId)?.size === 0) rooms.delete(chatId)
      })
    },
  )
}
```

- [ ] **Step 3: Registrar em `src/app.ts`**

```typescript
import websocketPlugin from './shared/plugins/websocket'
import { chatGateway } from './modules/chat/chat.gateway'

// Após outros plugins:
await app.register(websocketPlugin)
await app.register(chatGateway)
```

- [ ] **Step 4: Adicionar scheduler de expiração de chats ao `server.ts`**

```typescript
import { ChatRepository } from './modules/chat/chat.repository'
import cron from 'node-cron'

// Junto com o job scheduler:
const chatRepo = new ChatRepository()
cron.schedule('0 * * * *', async () => {
  const result = await chatRepo.deactivateExpiredCreditChats()
  console.log(`[Scheduler] Deactivated ${result.count} expired credit chats`)
})
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/plugins/websocket.ts src/modules/chat/chat.gateway.ts src/server.ts
git commit -m "feat: WebSocket real-time chat with room management and JWT auth"
```

---

## Task 16: Final App Registration e Smoke Test

**Files:**
- Modify: `src/app.ts` (consolidar todos os registros)

- [ ] **Step 1: `src/app.ts` final consolidado**

```typescript
import 'dotenv/config'
import Fastify, { FastifyInstance } from 'fastify'
import { errorHandler } from './shared/errors/errorHandler'
import jwtPlugin from './shared/plugins/jwt'
import googleOAuth from './shared/plugins/oauth'
import websocketPlugin from './shared/plugins/websocket'
import { authRoutes } from './modules/auth/auth.routes'
import { candidatesRoutes } from './modules/candidates/candidates.routes'
import { companiesRoutes } from './modules/companies/companies.routes'
import { jobsRoutes } from './modules/jobs/jobs.routes'
import { swipesRoutes } from './modules/swipes/swipes.routes'
import { chatRoutes } from './modules/chat/chat.routes'
import { chatGateway } from './modules/chat/chat.gateway'
import { adminRoutes } from './modules/admin/admin.routes'

export interface BuildAppOptions {
  testing?: boolean
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: !opts.testing })

  app.setErrorHandler(errorHandler)

  await app.register(jwtPlugin)
  if (!opts.testing) await app.register(googleOAuth)
  await app.register(websocketPlugin)

  await app.register(authRoutes)
  await app.register(candidatesRoutes)
  await app.register(companiesRoutes)
  await app.register(jobsRoutes)
  await app.register(swipesRoutes)
  await app.register(chatRoutes)
  await app.register(chatGateway)
  await app.register(adminRoutes)

  return app
}
```

- [ ] **Step 2: Rodar toda a suíte de testes**

```bash
npm test
```
Expected: Todos os testes PASS. Se algum falhar, investigar antes de prosseguir.

- [ ] **Step 3: Smoke test manual**

```bash
npx ts-node src/server.ts
# Em outro terminal:
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123","role":"CANDIDATE"}'
```
Expected: `{"accessToken":"...","refreshToken":"...","user":{...}}`

- [ ] **Step 4: Commit final**

```bash
git add src/app.ts
git commit -m "feat: complete backend API with all modules integrated"
```

---

## Decisões em Aberto (para implementação)

| Item | Decisão pendente |
|---|---|
| Gateway de pagamento (créditos) | Stripe ou Pagar.me — definir antes de implementar compra de créditos |
| Rate limiting | Adicionar `@fastify/rate-limit` antes de ir para produção |
| Logging estruturado | Pino (já incluso no Fastify) — configurar transporte para produção |
| Deploy | Railway, Render ou VPS própria — definir antes do primeiro deploy |

---

## Resumo das rotas implementadas

| Método | Rota | Role | Descrição |
|---|---|---|---|
| POST | /auth/register | — | Cadastro email/senha |
| POST | /auth/login | — | Login |
| POST | /auth/refresh | — | Refresh token |
| GET | /auth/google | — | Inicia OAuth Google |
| GET | /auth/google/callback | — | Callback OAuth |
| POST | /candidates/profile | CANDIDATE | Criar perfil |
| GET | /candidates/profile | CANDIDATE | Ver perfil |
| PATCH | /candidates/profile | CANDIDATE | Atualizar perfil |
| GET | /feed | CANDIDATE | Feed de vagas com match score |
| POST | /swipes | CANDIDATE | Like ou dislike em vaga |
| POST | /companies | RECRUITER | Criar empresa |
| GET | /companies/:id | * | Ver empresa |
| POST | /jobs | RECRUITER | Publicar vaga |
| GET | /jobs/mine | RECRUITER | Minhas vagas |
| DELETE | /jobs/:id | RECRUITER | Remover vaga |
| GET | /jobs/:jobId/candidates | RECRUITER | Candidatos que deram like |
| POST | /chats/credit | RECRUITER | Iniciar chat por crédito |
| GET | /chats | * | Listar chats |
| GET | /chats/:chatId/messages | * | Histórico de mensagens |
| WS | /ws/chat/:chatId | * | Chat em tempo real |
| GET | /admin/professions | ADMIN | Listar profissões |
| POST | /admin/professions | ADMIN | Criar profissão |
| POST | /admin/professions/relations | ADMIN | Criar relação entre profissões |
