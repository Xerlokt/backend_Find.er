# Phase 11: Core Modules Migration - Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 31 (new + modified)
**Analogs found:** 31 / 31

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/adapters/repositories/candidate.repository.ts` | model | CRUD | `src/adapters/repositories/user.repository.ts` | exact |
| `src/adapters/repositories/company.repository.ts` | model | CRUD | `src/adapters/repositories/user.repository.ts` + `src/modules/company/company.repository.ts` | exact |
| `src/adapters/repositories/recruiter.repository.ts` | model | CRUD | `src/adapters/repositories/user.repository.ts` | exact |
| `src/adapters/repositories/job.repository.ts` | model | CRUD | `src/adapters/repositories/user.repository.ts` | exact |
| `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/candidate/get-candidate-profile.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/company/create-company.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/company/get-company.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/company/adjust-company-credits.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/recruiter/get-recruiter-profile.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/job/create-job.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/job/update-job.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/job/deactivate-job.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/job/list-jobs-by-recruiter.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/job/get-job-by-id.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/admin/list-users.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/admin/get-user-by-id.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/admin/adjust-admin-credits.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/application/use-cases/admin/get-transactions.use-case.ts` | service | request-response | `src/application/use-cases/auth/register.use-case.ts` | role-match |
| `src/adapters/controllers/candidate.controller.ts` | controller | request-response | `src/adapters/controllers/auth.controller.ts` | exact |
| `src/adapters/controllers/company.controller.ts` | controller | request-response | `src/adapters/controllers/auth.controller.ts` | exact |
| `src/adapters/controllers/recruiter.controller.ts` | controller | request-response | `src/adapters/controllers/auth.controller.ts` | exact |
| `src/adapters/controllers/job.controller.ts` | controller | request-response | `src/adapters/controllers/auth.controller.ts` | exact |
| `src/adapters/controllers/admin.controller.ts` | controller | request-response | `src/adapters/controllers/auth.controller.ts` | role-match (constructor injection differs) |
| `src/infrastructure/http/routes/candidate.routes.ts` | route | request-response | `src/infrastructure/http/routes/auth.routes.ts` | exact |
| `src/infrastructure/http/routes/company.routes.ts` | route | request-response | `src/infrastructure/http/routes/auth.routes.ts` | exact |
| `src/infrastructure/http/routes/recruiter.routes.ts` | route | request-response | `src/infrastructure/http/routes/auth.routes.ts` | exact |
| `src/infrastructure/http/routes/job.routes.ts` | route | request-response | `src/infrastructure/http/routes/auth.routes.ts` | exact |
| `src/infrastructure/http/routes/admin.routes.ts` | route | request-response | `src/infrastructure/http/routes/auth.routes.ts` + `src/modules/admin/admin.routes.ts` | role-match (opts pattern) |
| `src/infrastructure/scheduler/job-expiry.scheduler.ts` | utility | event-driven | `src/modules/job/job.scheduler.ts` | exact |
| `src/domain/interfaces/user.repository.interface.ts` | model | CRUD | existing file (add findMany + findByIdPublic) | modify |
| `src/domain/interfaces/company.repository.interface.ts` | model | CRUD | existing file (add getTransactions) | modify |
| `src/adapters/repositories/user.repository.ts` | model | CRUD | existing file (add findMany + findByIdPublic) | modify |
| `src/infrastructure/http/plugins/scheduler.plugin.ts` | middleware | event-driven | existing file (update imports) | modify |
| `src/app.ts` | config | — | existing file (5 import swaps) | modify |

---

## Pattern Assignments

### Primary Analog: Controller Pattern
**Source:** `src/adapters/controllers/auth.controller.ts` (lines 1-150)

This file is the canonical template for ALL five new controller files. Every controller follows the same structure:

**Imports pattern** (lines 1-16):
```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { SomeUseCase } from '../../application/use-cases/module/some.use-case'
import { ModuleRepository } from '../repositories/module.repository'
import { DomainError } from '../../application/errors/domain.error'
```

**Class with optional-injection constructor** (lines 41-54):
```typescript
export class AuthController {
  private readonly userRepo: IUserRepository

  constructor(userRepo?: IUserRepository) {
    this.userRepo = userRepo ?? new UserRepository()
  }
  // ...
}
```

**Handler method pattern** (lines 56-74):
```typescript
async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = RegisterBodySchema.parse(request.body)
  const useCase = new RegisterUseCase(this.userRepo, ...)
  try {
    const tokens = await useCase.execute(body)
    reply.status(201).send(tokens)
  } catch (err) {
    if (err instanceof DomainError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code })
      return
    }
    throw err
  }
}
```

---

### Primary Analog: Route File Pattern
**Source:** `src/infrastructure/http/routes/auth.routes.ts` (lines 1-24)

```typescript
import { FastifyInstance } from 'fastify'
import { AuthController } from '../../../adapters/controllers/auth.controller'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new AuthController()

  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, ctrl.register.bind(ctrl))
}
```

Key rules from this file:
- Zero Zod, zero service instantiation, zero business logic
- `ctrl.method.bind(ctrl)` on every registration — never bare `ctrl.method`
- `preHandler: [authenticate, requireRole('ROLE')]` for protected routes
- Import `authenticate` from `'../plugins/authenticate.hook'`
- Import `requireRole` from `'../../../shared/hooks/requireRole'`

---

### Primary Analog: Repository Pattern
**Source:** `src/adapters/repositories/user.repository.ts` (lines 1-86)

```typescript
import { Role } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { IUserRepository } from '../../domain/interfaces/user.repository.interface'
import { User, UserRole } from '../../domain/entities/user.entity'

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: { id: string; email: string; ... }): User {
    return {
      id: row.id,
      email: row.email,
      // ... every field explicitly mapped — do NOT spread
    }
  }
}
```

Key rules:
- Import `prisma` from `'../../infrastructure/database/prisma'` (not `shared/db/prisma`)
- `implements IXxxRepository` — the Phase 9 domain interface
- `toDomain(row)` is `private`, maps every field explicitly (no spread)
- Enum casts where Prisma enum != domain union: `row.modality as Modality`

---

### Primary Analog: Use Case Pattern
**Source:** `src/application/use-cases/auth/register.use-case.ts` (lines 1-39)

```typescript
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { DomainError } from '../../errors/domain.error'

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    // inject only interfaces — never concrete classes or Prisma
  ) {}

  async execute(input: { ... }): Promise<{ ... }> {
    const existing = await this.userRepo.findByEmail(input.email)
    if (existing) {
      throw new DomainError('Email already in use', 'CONFLICT', 409)
    }
    // ...
  }
}
```

Key rules:
- Constructor injects ONLY domain interfaces (`IXxxRepository`)
- Never import `prisma` — use cases are DB-agnostic
- `DomainError(message, code, statusCode)` — argument order differs from `AppError(message, statusCode, code)`
- One class per file, one `execute()` method

---

## Pattern Assignments — Per-File Detail

### `src/adapters/repositories/candidate.repository.ts`

**Analog:** `src/adapters/repositories/user.repository.ts`
**Interface to implement:** `src/domain/interfaces/candidate.repository.interface.ts`
**Source logic from:** `src/modules/candidate/candidate.repository.ts`

**Imports pattern:**
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { ICandidateRepository } from '../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { Modality } from '../../domain/entities/job.entity'
```

**Core pattern** — upsert and findUnique with toDomain:
```typescript
export class CandidateRepository implements ICandidateRepository {
  async upsertProfile(userId: string, data: { ... }): Promise<CandidateProfile> {
    const row = await prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    const row = await prisma.candidateProfile.findUnique({ where: { userId } })
    return row ? this.toDomain(row) : null
  }

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
      preferredModalities: row.preferredModalities as Modality[],  // cast: Prisma enum → domain union
      searchRadiusKm: row.searchRadiusKm,
      salaryExpectation: row.salaryExpectation,
    }
  }
}
```

**Critical cast:** `preferredModalities: row.preferredModalities as Modality[]` — Prisma uses `Modality` enum from `@prisma/client`; domain uses `'REMOTE' | 'HYBRID' | 'IN_PERSON'` union.

---

### `src/adapters/repositories/company.repository.ts`

**Analog:** `src/adapters/repositories/user.repository.ts` + `src/modules/company/company.repository.ts`
**Interface to implement:** `src/domain/interfaces/company.repository.interface.ts` (after adding `getTransactions`)
**Source transaction logic from:** `src/modules/company/company.repository.ts` lines 13-31

**Imports pattern:**
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { ICompanyRepository } from '../../domain/interfaces/company.repository.interface'
import { Company } from '../../domain/entities/company.entity'
import { CreditTransaction } from '../../domain/entities/credit-transaction.entity'
import { DomainError } from '../../application/errors/domain.error'
```

**Core pattern** — adjustCredits with $transaction using DomainError (NOT AppError):
```typescript
export class CompanyRepository implements ICompanyRepository {
  async create(data: { name: string; logoUrl?: string; description?: string }): Promise<Company> {
    const row = await prisma.company.create({ data })
    return this.toDomain(row)
  }

  async findById(id: string): Promise<Company | null> {
    const row = await prisma.company.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant'): Promise<Company> {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
      if (company.credits + delta < 0) throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 400)
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { credits: { increment: delta } },
      })
      await tx.creditTransaction.create({ data: { companyId, amount: delta, reason } })
      return this.toDomain(updated)
    })
  }

  async getTransactions(companyId: string): Promise<CreditTransaction[]> {
    return prisma.creditTransaction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
  }

  private toDomain(row: any): Company {
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl,
      description: row.description,
      rating: row.rating,
      plan: row.plan,
      planExpiresAt: row.planExpiresAt,
      credits: row.credits,
      createdAt: row.createdAt,
    }
  }
}
```

**Critical:** `adjustCredits` source (lines 18-19 of `company.repository.ts`) throws `AppError`. In the adapter it MUST throw `DomainError` — same argument values, different class and argument order.

---

### `src/adapters/repositories/recruiter.repository.ts`

**Analog:** `src/adapters/repositories/user.repository.ts`
**Interface to implement:** `src/domain/interfaces/recruiter.repository.interface.ts`
**Source logic from:** `src/modules/recruiter/recruiter.repository.ts`

**Imports pattern:**
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { IRecruiterRepository } from '../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../domain/entities/recruiter.entity'
import { Company } from '../../domain/entities/company.entity'
```

**Core pattern** — note `findCompanyById` calls `prisma.company` directly (module isolation: MUST NOT import `CompanyRepository`):
```typescript
export class RecruiterRepository implements IRecruiterRepository {
  async upsertProfile(userId: string, data: { companyId: string }): Promise<RecruiterProfile> {
    const row = await prisma.recruiterProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return this.toDomainProfile(row)
  }

  async findByUserId(userId: string): Promise<RecruiterProfile | null> {
    const row = await prisma.recruiterProfile.findUnique({ where: { userId } })
    return row ? this.toDomainProfile(row) : null
  }

  async findCompanyById(id: string): Promise<Company | null> {
    // Direct Prisma call — NEVER import CompanyRepository (module isolation, ARCH-04)
    const row = await prisma.company.findUnique({ where: { id } })
    return row ? this.toDomainCompany(row) : null
  }

  private toDomainProfile(row: any): RecruiterProfile {
    return { id: row.id, userId: row.userId, companyId: row.companyId }
  }

  private toDomainCompany(row: any): Company {
    return {
      id: row.id, name: row.name, logoUrl: row.logoUrl, description: row.description,
      rating: row.rating, plan: row.plan, planExpiresAt: row.planExpiresAt,
      credits: row.credits, createdAt: row.createdAt,
    }
  }
}
```

**Module isolation rule (from `src/modules/recruiter/recruiter.repository.ts` line 17):** `findCompanyById` queries `prisma.company` directly — the comment in the source code says "Direct Prisma call — NEVER import CompanyRepository (module isolation, ARCH-04)". This comment must be preserved verbatim.

---

### `src/adapters/repositories/job.repository.ts`

**Analog:** `src/adapters/repositories/user.repository.ts`
**Interface to implement:** `src/domain/interfaces/job.repository.interface.ts`
**Source logic from:** `src/modules/job/job.repository.ts`

**Imports pattern:**
```typescript
import { prisma } from '../../infrastructure/database/prisma'
import { IJobRepository } from '../../domain/interfaces/job.repository.interface'
import { Job, Modality } from '../../domain/entities/job.entity'
import { RecruiterProfile } from '../../domain/entities/recruiter.entity'
```

**Core pattern** — note `findRecruiterProfileByUserId` calls `prisma.recruiterProfile` directly (module isolation):
```typescript
export class JobRepository implements IJobRepository {
  async create(recruiterId: string, data: { companyId: string; title: string; ... }): Promise<Job> {
    const row = await prisma.job.create({ data: { ...data, recruiterId } })
    return this.toDomain(row)
  }

  async findById(id: string): Promise<Job | null> {
    const row = await prisma.job.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async update(id: string, data: Partial<Omit<Job, 'id' | 'companyId' | 'recruiterId' | 'createdAt'>>): Promise<Job> {
    const row = await prisma.job.update({ where: { id }, data })
    return this.toDomain(row)
  }

  async findByRecruiterId(recruiterId: string): Promise<Job[]> {
    const rows = await prisma.job.findMany({ where: { recruiterId }, orderBy: { createdAt: 'desc' } })
    return rows.map(row => this.toDomain(row))
  }

  async findRecruiterProfileByUserId(userId: string): Promise<RecruiterProfile | null> {
    // Direct Prisma call — NEVER import RecruiterRepository (module isolation, ARCH-04)
    const row = await prisma.recruiterProfile.findUnique({ where: { userId } })
    return row ? { id: row.id, userId: row.userId, companyId: row.companyId } : null
  }

  async deactivateExpiredJobs(): Promise<number> {
    const result = await prisma.job.updateMany({
      where: { isActive: true, expiresAt: { lt: new Date() } },
      data: { isActive: false },
    })
    return result.count
  }

  private toDomain(row: any): Job {
    return {
      id: row.id,
      companyId: row.companyId,
      recruiterId: row.recruiterId,
      title: row.title,
      description: row.description,
      professionId: row.professionId,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      lat: row.lat,
      lng: row.lng,
      modality: row.modality as Modality,  // cast: Prisma enum → domain union
      requiredSkills: row.requiredSkills,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }
  }
}
```

---

### Use Cases — Candidate Module

**Analog for both:** `src/application/use-cases/auth/register.use-case.ts` (lines 1-39)

#### `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts`

```typescript
import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../../domain/entities/candidate.entity'
import { Modality } from '../../../domain/entities/job.entity'

export class UpsertCandidateProfileUseCase {
  constructor(private readonly repo: ICandidateRepository) {}

  async execute(userId: string, data: {
    name: string; bio?: string | null; lat?: number | null; lng?: number | null
    professionId: string; skills: string[]; preferredModalities: Modality[]
    salaryExpectation?: number | null; searchRadiusKm?: number
  }): Promise<CandidateProfile> {
    return this.repo.upsertProfile(userId, data)
    // No error thrown — upsert never returns null
  }
}
```

#### `src/application/use-cases/candidate/get-candidate-profile.use-case.ts`

```typescript
import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../../domain/entities/candidate.entity'
import { DomainError } from '../../errors/domain.error'

export class GetCandidateProfileUseCase {
  constructor(private readonly repo: ICandidateRepository) {}

  async execute(userId: string): Promise<CandidateProfile> {
    const profile = await this.repo.findByUserId(userId)
    if (!profile) throw new DomainError('Profile not found', 'NOT_FOUND', 404)
    return profile
  }
}
```

---

### Use Cases — Company Module

**Analog for all three:** `src/application/use-cases/auth/register.use-case.ts`

#### `src/application/use-cases/company/create-company.use-case.ts`
```typescript
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'

export class CreateCompanyUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(data: { name: string; logoUrl?: string; description?: string }): Promise<Company> {
    return this.repo.create(data)
  }
}
```

#### `src/application/use-cases/company/get-company.use-case.ts`
```typescript
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'
import { DomainError } from '../../errors/domain.error'

export class GetCompanyUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(id: string): Promise<Company> {
    const company = await this.repo.findById(id)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    return company
  }
}
```

#### `src/application/use-cases/company/adjust-company-credits.use-case.ts`
```typescript
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'

export class AdjustCompanyCreditsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(companyId: string, delta: number, reason?: string): Promise<Company> {
    // Transaction-safety lives inside CompanyRepository.adjustCredits
    return this.repo.adjustCredits(companyId, delta, reason)
  }
}
```

---

### Use Cases — Recruiter Module

#### `src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts`
```typescript
import { IRecruiterRepository } from '../../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../../domain/entities/recruiter.entity'
import { DomainError } from '../../errors/domain.error'

export class UpsertRecruiterProfileUseCase {
  constructor(private readonly repo: IRecruiterRepository) {}

  async execute(userId: string, data: { companyId: string }): Promise<RecruiterProfile> {
    const company = await this.repo.findCompanyById(data.companyId)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    return this.repo.upsertProfile(userId, data)
  }
}
```

#### `src/application/use-cases/recruiter/get-recruiter-profile.use-case.ts`
```typescript
import { IRecruiterRepository } from '../../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../../domain/entities/recruiter.entity'
import { DomainError } from '../../errors/domain.error'

export class GetRecruiterProfileUseCase {
  constructor(private readonly repo: IRecruiterRepository) {}

  async execute(userId: string): Promise<RecruiterProfile> {
    const profile = await this.repo.findByUserId(userId)
    if (!profile) throw new DomainError('Profile not found', 'NOT_FOUND', 404)
    return profile
  }
}
```

---

### Use Cases — Job Module

**Source logic from:** `src/modules/job/job.service.ts` (lines 1-37)

#### `src/application/use-cases/job/create-job.use-case.ts`
```typescript
import { IJobRepository } from '../../../domain/interfaces/job.repository.interface'
import { Job, Modality } from '../../../domain/entities/job.entity'
import { DomainError } from '../../errors/domain.error'

export class CreateJobUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(userId: string, data: {
    title: string; description: string; professionId: string
    salaryMin?: number; salaryMax?: number; lat?: number; lng?: number
    modality: Modality; requiredSkills: string[]; expiresAt: Date
  }): Promise<Job> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    return this.repo.create(profile.id, { ...data, companyId: profile.companyId })
  }
}
```

#### `src/application/use-cases/job/update-job.use-case.ts`
```typescript
// Source: job.service.ts lines 13-20
// Ownership check: job.recruiterId !== profile.id → FORBIDDEN
export class UpdateJobUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(userId: string, jobId: string, data: Partial<Omit<Job, 'id' | 'companyId' | 'recruiterId' | 'createdAt'>>): Promise<Job> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    const job = await this.repo.findById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (job.recruiterId !== profile.id) throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    return this.repo.update(jobId, data)
  }
}
```

#### `src/application/use-cases/job/deactivate-job.use-case.ts`
```typescript
// Source: job.service.ts line 22-24 — delegates to updateJob with { isActive: false }
// Standalone use case with its own ownership check (same logic as UpdateJobUseCase)
export class DeactivateJobUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(userId: string, jobId: string): Promise<Job> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    const job = await this.repo.findById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (job.recruiterId !== profile.id) throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    return this.repo.update(jobId, { isActive: false })
  }
}
```

#### `src/application/use-cases/job/list-jobs-by-recruiter.use-case.ts`
```typescript
export class ListJobsByRecruiterUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(userId: string): Promise<Job[]> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    return this.repo.findByRecruiterId(profile.id)
  }
}
```

#### `src/application/use-cases/job/get-job-by-id.use-case.ts`
```typescript
export class GetJobByIdUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(id: string): Promise<Job> {
    const job = await this.repo.findById(id)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    return job
  }
}
```

---

### Use Cases — Admin Module

**Source logic from:** `src/modules/admin/admin.service.ts` (lines 1-56)
**Special:** Admin use cases inject `IUserRepository` and `ICompanyRepository` (extended in Phase 11); credit use case injects a local `ICreditGrantPort`.

#### `src/application/use-cases/admin/list-users.use-case.ts`
```typescript
// Requires IUserRepository.findMany (new method added in Phase 11)
import { IUserRepository, UserPublic } from '../../../domain/interfaces/user.repository.interface'

export class ListUsersUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(page: number, limit: number): Promise<UserPublic[]> {
    return this.repo.findMany({ skip: (page - 1) * limit, take: limit })
  }
}
```

#### `src/application/use-cases/admin/get-user-by-id.use-case.ts`
```typescript
// Requires IUserRepository.findByIdPublic (new method — returns UserPublic, no passwordHash/googleId)
import { IUserRepository, UserPublic } from '../../../domain/interfaces/user.repository.interface'
import { DomainError } from '../../errors/domain.error'

export class GetUserByIdUseCase {
  constructor(private readonly repo: IUserRepository) {}

  async execute(id: string): Promise<UserPublic> {
    const user = await this.repo.findByIdPublic(id)
    if (!user) throw new DomainError('User not found', 'NOT_FOUND', 404)
    return user
  }
}
```

#### `src/application/use-cases/admin/adjust-admin-credits.use-case.ts`
```typescript
// Local interface ICreditGrantPort — avoids importing from src/modules/credits/
interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export class AdjustAdminCreditsUseCase {
  constructor(private readonly creditService: ICreditGrantPort) {}

  async execute(companyId: string, amount: number): Promise<unknown> {
    return this.creditService.grantCredits(companyId, amount, 'admin_grant')
  }
}
```

#### `src/application/use-cases/admin/get-transactions.use-case.ts`
```typescript
// Requires ICompanyRepository.getTransactions (new method added in Phase 11)
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { CreditTransaction } from '../../../domain/entities/credit-transaction.entity'

export class GetTransactionsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(companyId: string): Promise<CreditTransaction[]> {
    return this.repo.getTransactions(companyId)
  }
}
```

---

### `src/adapters/controllers/candidate.controller.ts`

**Analog:** `src/adapters/controllers/auth.controller.ts` (lines 1-150)

**Zod schemas** (from `src/modules/candidate/candidate.routes.ts` lines 8-18 — copy verbatim):
```typescript
const CandidateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  professionId: z.string().min(1),
  skills: z.array(z.string()).min(1),
  preferredModalities: z.array(z.enum(['REMOTE', 'HYBRID', 'IN_PERSON'])).min(1),
  salaryExpectation: z.number().positive().optional(),
  searchRadiusKm: z.number().int().positive().default(50),
})
```

**Handler pattern** (copy from `auth.controller.ts` lines 56-74, adapt):
```typescript
export class CandidateController {
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

  async getProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = new GetCandidateProfileUseCase(new CandidateRepository())
    try {
      const profile = await useCase.execute(request.user.id)
      reply.status(200).send(profile)
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

---

### `src/adapters/controllers/company.controller.ts`

**Analog:** `src/adapters/controllers/auth.controller.ts`

**Zod schemas** (from `src/modules/company/company.routes.ts` lines 8-16):
```typescript
const CreateCompanySchema = z.object({
  name: z.string().min(1).max(150),
  logoUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
})

const AdjustCreditsSchema = z.object({
  amount: z.number().int().positive(),
})
```

**HTTP status codes:** `create` → 201, `getById` → 200, `adjustCredits` → 200.

**Params pattern** (from `src/modules/company/company.routes.ts` line 35):
```typescript
const { id } = request.params as { id: string }
// or use z.object({ id: z.string().uuid() }).parse(request.params)
```

---

### `src/adapters/controllers/recruiter.controller.ts`

**Analog:** `src/adapters/controllers/auth.controller.ts`

**Zod schema** (from `src/modules/recruiter/recruiter.routes.ts` line 8-10):
```typescript
const RecruiterProfileSchema = z.object({
  companyId: z.string().uuid(),
})
```

**HTTP status codes:** both `upsertProfile` and `getProfile` → 200.

---

### `src/adapters/controllers/job.controller.ts`

**Analog:** `src/adapters/controllers/auth.controller.ts`

**Zod schemas** (from `src/modules/job/job.routes.ts` lines 14-41 — copy verbatim):
```typescript
const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  professionId: z.string().min(1),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']),
  requiredSkills: z.array(z.string()).min(1),
  expiresAt: z.string().datetime(),
})

const JobParamsSchema = z.object({ id: z.string().uuid() })

const UpdateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  professionId: z.string().min(1).optional(),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']).optional(),
  requiredSkills: z.array(z.string()).min(1).optional(),
  expiresAt: z.string().datetime().optional(),
})
```

**RankingItem** — define locally in `job.controller.ts` (re-export `RankingItem` from `src/modules/job/job.routes.ts` stays untouched for `swipe.routes.ts`):
```typescript
interface RankingItem {
  candidateId: string
  fitScore: number
  profile: Record<string, unknown> | null
}
```

**getById response pattern** (from `src/modules/job/job.routes.ts` line 74):
```typescript
reply.status(200).send({ ...job, rankings: [] as RankingItem[] })
```

**expiresAt conversion** (from `job.routes.ts` lines 53-54):
```typescript
// createJob: convert ISO string to Date before passing to use case
const job = await useCase.execute(request.user.id, {
  ...body,
  expiresAt: new Date(body.expiresAt),
})
```

**HTTP status codes:** `create` → 201, all others → 200.

---

### `src/adapters/controllers/admin.controller.ts`

**Analog:** `src/adapters/controllers/auth.controller.ts` (lines 41-54 — constructor injection pattern)
**Special:** Constructor receives `ICreditGrantPort` for injection (same pattern as `AuthController` receiving optional repos).

**ICreditGrantPort** (same interface as defined in RESEARCH.md Q2):
```typescript
interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}
```

**Constructor pattern** (adapted from auth.controller.ts lines 41-54):
```typescript
export class AdminController {
  constructor(private readonly creditService: ICreditGrantPort) {}

  async listUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { page, limit } = ListUsersQuerySchema.parse(request.query)
    const useCase = new ListUsersUseCase(new UserRepository())
    try {
      const users = await useCase.execute(page, limit)
      reply.status(200).send(users)
    } catch (err) { ... }
  }
  // getUserById, adjustCredits, getTransactions follow same pattern
}
```

**Zod schemas** (from `src/modules/admin/admin.routes.ts` lines 7-16 — copy verbatim):
```typescript
const AdjustCreditsAdminSchema = z.object({
  amount: z.number().int().positive(),
})

const ListUsersQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

const ParamIdSchema = z.object({ id: z.string().uuid() })
```

---

### `src/infrastructure/http/routes/candidate.routes.ts`

**Analog:** `src/infrastructure/http/routes/auth.routes.ts` (lines 1-24)

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

**Import paths from `src/infrastructure/http/routes/`:**
- `authenticate` → `'../plugins/authenticate.hook'` (1 up to http/, into plugins/)
- `requireRole` → `'../../../shared/hooks/requireRole'` (3 up to src/, into shared/hooks/)
- Controllers → `'../../../adapters/controllers/module.controller'`

---

### `src/infrastructure/http/routes/company.routes.ts`

**Analog:** `src/infrastructure/http/routes/auth.routes.ts`
**Source routes from:** `src/modules/company/company.routes.ts` (lines 23-48)

```typescript
export async function companyRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new CompanyController()

  app.post('/', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.create.bind(ctrl))
  app.get('/:id', { preHandler: [authenticate] }, ctrl.getById.bind(ctrl))
  app.patch('/admin/:id/credits', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.adjustCredits.bind(ctrl))
}
```

---

### `src/infrastructure/http/routes/recruiter.routes.ts`

**Analog:** `src/infrastructure/http/routes/auth.routes.ts`

```typescript
export async function recruiterRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new RecruiterController()

  app.put('/me', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.upsertProfile.bind(ctrl))
  app.get('/me', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.getProfile.bind(ctrl))
}
```

---

### `src/infrastructure/http/routes/job.routes.ts`

**Analog:** `src/infrastructure/http/routes/auth.routes.ts`
**Source routes from:** `src/modules/job/job.routes.ts` (lines 43-98)

```typescript
export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new JobController()

  app.post('/', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.create.bind(ctrl))
  // CRITICAL: /mine MUST be registered before /:id (Pitfall 4)
  app.get('/mine', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.listMine.bind(ctrl))
  app.get('/:id', { preHandler: [authenticate] }, ctrl.getById.bind(ctrl))
  app.patch('/:id', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.update.bind(ctrl))
  app.delete('/:id/deactivate', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.deactivate.bind(ctrl))
}
```

**RankingItem continuity:** `src/modules/job/job.routes.ts` is NOT deleted in Phase 11. Its `RankingItem` export remains available to `swipe.routes.ts`. The new `job.routes.ts` does NOT need to re-export `RankingItem` — `swipe.routes.ts` still imports from the old location.

---

### `src/infrastructure/http/routes/admin.routes.ts`

**Analog:** `src/infrastructure/http/routes/auth.routes.ts` + `src/modules/admin/admin.routes.ts` (opts pattern, lines 18-57)

```typescript
import { FastifyInstance } from 'fastify'
import { AdminController } from '../../../adapters/controllers/admin.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export async function adminRoutes(
  app: FastifyInstance,
  opts: { creditService: ICreditGrantPort },
): Promise<void> {
  const ctrl = new AdminController(opts.creditService)

  app.get('/users', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.listUsers.bind(ctrl))
  app.get('/users/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.getUserById.bind(ctrl))
  app.patch('/companies/:id/credits', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.adjustCredits.bind(ctrl))
  app.get('/companies/:id/transactions', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.getTransactions.bind(ctrl))
}
```

---

### `src/infrastructure/scheduler/job-expiry.scheduler.ts`

**Analog:** `src/modules/job/job.scheduler.ts` (lines 1-10)

**Source (verbatim):**
```typescript
import { JobRepository } from './job.repository'

export async function runExpiryCheck(repo: JobRepository): Promise<number> {
  return repo.deactivateExpiredJobs()
}
```

**New version** — accepts `IJobRepository` interface instead of concrete class:
```typescript
import { IJobRepository } from '../../domain/interfaces/job.repository.interface'

export async function runExpiryCheck(repo: IJobRepository): Promise<number> {
  return repo.deactivateExpiredJobs()
}
```

This file lives at `src/infrastructure/scheduler/job-expiry.scheduler.ts`. The `src/infrastructure/scheduler/` directory must be created.

---

### Modified Files

#### `src/domain/interfaces/user.repository.interface.ts` (add findMany + findByIdPublic)

**Current file** (`src/domain/interfaces/user.repository.interface.ts` lines 1-14):
```typescript
import { User, UserRole } from '../entities/user.entity'

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  create(data: { email: string; passwordHash: string; role: UserRole }): Promise<User>
  updateGoogleId(id: string, googleId: string, avatarUrl?: string): Promise<User>
  findOrCreateGoogle(data: {
    googleId: string
    email: string
    avatarUrl?: string
    role: UserRole
  }): Promise<{ user: User; isNew: boolean }>
}
```

**Add before the closing brace:**
```typescript
export type UserPublic = Omit<User, 'passwordHash' | 'googleId'>

// Admin-facing read methods — select-projected, never expose passwordHash or googleId
findMany(opts: { skip: number; take: number }): Promise<UserPublic[]>
findByIdPublic(id: string): Promise<UserPublic | null>
```

#### `src/domain/interfaces/company.repository.interface.ts` (add getTransactions)

**Current file** (`src/domain/interfaces/company.repository.interface.ts` lines 1-11):
```typescript
import { Company } from '../entities/company.entity'

export interface ICompanyRepository {
  create(data: { name: string; logoUrl?: string; description?: string }): Promise<Company>
  findById(id: string): Promise<Company | null>
  adjustCredits(companyId: string, delta: number, reason?: string): Promise<Company>
}
```

**Add import and method:**
```typescript
import { CreditTransaction } from '../entities/credit-transaction.entity'

// Add to interface body:
getTransactions(companyId: string): Promise<CreditTransaction[]>
```

#### `src/adapters/repositories/user.repository.ts` (add findMany + findByIdPublic)

**Add to existing `UserRepository` class:**
```typescript
async findMany(opts: { skip: number; take: number }): Promise<UserPublic[]> {
  const rows = await prisma.user.findMany({
    skip: opts.skip,
    take: opts.take,
    select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return rows as UserPublic[]
}

async findByIdPublic(id: string): Promise<UserPublic | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true },
  })
  return row as UserPublic | null
}
```

Also add `UserPublic` import from the interface file:
```typescript
import { IUserRepository, UserPublic } from '../../domain/interfaces/user.repository.interface'
```

#### `src/infrastructure/http/plugins/scheduler.plugin.ts` (update imports for job migration)

**Current imports** (lines 4-5):
```typescript
import { JobRepository } from '../../../modules/job/job.repository'
import { runExpiryCheck } from '../../../modules/job/job.scheduler'
```

**Replace with:**
```typescript
import { JobRepository } from '../../../adapters/repositories/job.repository'
import { runExpiryCheck } from '../../scheduler/job-expiry.scheduler'
```

All other content unchanged (lines 7-30 stay identical).

#### `src/app.ts` (5 import swaps — one per module)

**Current imports** (lines 11-18):
```typescript
import { candidateRoutes } from './modules/candidate/candidate.routes'
import { companyRoutes } from './modules/company/company.routes'
import { recruiterRoutes } from './modules/recruiter/recruiter.routes'
import { adminRoutes } from './modules/admin/admin.routes'
import { AdminService } from './modules/admin/admin.service'
// ...
import { jobRoutes } from './modules/job/job.routes'
```

**Replace with:**
```typescript
import { candidateRoutes } from './infrastructure/http/routes/candidate.routes'
import { companyRoutes } from './infrastructure/http/routes/company.routes'
import { recruiterRoutes } from './infrastructure/http/routes/recruiter.routes'
import { adminRoutes } from './infrastructure/http/routes/admin.routes'
// AdminService import REMOVED
// ...
import { jobRoutes } from './infrastructure/http/routes/job.routes'
```

**Admin wiring change** (lines 69-70 in current `app.ts`):
```typescript
// OLD:
const adminService = new AdminService(creditService)
await app.register(adminRoutes, { prefix: '/admin', service: adminService })

// NEW:
await app.register(adminRoutes, { prefix: '/admin', creditService })
```

`CreditRepository`, `CreditService`, and `chatService` instantiation stays — `creditService` is now passed directly as opts instead of wrapped in `AdminService`.

---

## Shared Patterns

### DomainError — Throw Pattern
**Source:** `src/application/errors/domain.error.ts` (lines 1-11)
**Apply to:** All use-case files and repository adapters (inside transactions)

```typescript
// Constructor order: (message, code, statusCode) — OPPOSITE of AppError(message, statusCode, code)
throw new DomainError('Profile not found', 'NOT_FOUND', 404)
throw new DomainError('Company not found', 'NOT_FOUND', 404)
throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 400)
throw new DomainError('Forbidden', 'FORBIDDEN', 403)
throw new DomainError('Job not found', 'NOT_FOUND', 404)
throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
throw new DomainError('User not found', 'NOT_FOUND', 404)
```

### DomainError — Catch and Map Pattern
**Source:** `src/adapters/controllers/auth.controller.ts` lines 64-73
**Apply to:** Every handler method in all five controller files

```typescript
try {
  const result = await useCase.execute(...)
  reply.status(200).send(result)
} catch (err) {
  if (err instanceof DomainError) {
    reply.status(err.statusCode).send({ error: err.message, code: err.code })
    return
  }
  throw err
}
```

### Prisma → Domain Mapping (toDomain)
**Source:** `src/adapters/repositories/user.repository.ts` lines 67-85
**Apply to:** All four new repository adapter files

```typescript
// Pattern: private toDomain(row: any): DomainEntity
// Map every field explicitly — do NOT spread Prisma model
// Cast Prisma enum types to domain union types
private toDomain(row: any): SomeEntity {
  return {
    id: row.id,
    // ... every field explicitly, no { ...row }
    modality: row.modality as Modality,           // Prisma enum → domain union
    preferredModalities: row.preferredModalities as Modality[],  // same
  }
}
```

### Prisma Import Path
**Source:** `src/adapters/repositories/user.repository.ts` line 2
**Apply to:** All four new repository adapter files

```typescript
// CORRECT (new infrastructure path):
import { prisma } from '../../infrastructure/database/prisma'

// WRONG (old shared path — do not use):
// import { prisma } from '../../shared/db/prisma'
```

### Constructor Injection Pattern
**Source:** `src/application/use-cases/auth/register.use-case.ts` lines 14-21
**Apply to:** All use-case classes

```typescript
export class SomeUseCase {
  constructor(
    private readonly repo: ISomeRepository,
    // inject ONLY interfaces — never concrete classes or PrismaClient
  ) {}

  async execute(input: SomeInput): Promise<SomeOutput> { ... }
}
```

### Route bind(ctrl) Pattern
**Source:** `src/infrastructure/http/routes/auth.routes.ts` lines 7-23
**Apply to:** All five new route files

```typescript
// CORRECT: always bind
app.put('/me', { preHandler: [...] }, ctrl.upsertProfile.bind(ctrl))

// WRONG: bare method reference — 'this' is lost at runtime
// app.put('/me', { preHandler: [...] }, ctrl.upsertProfile)
```

### Module Isolation — Direct Prisma for Cross-Module Data
**Source:** `src/modules/recruiter/recruiter.repository.ts` line 16-18; `src/modules/job/job.repository.ts` lines 49-52
**Apply to:** `recruiter.repository.ts` (`findCompanyById`) and `job.repository.ts` (`findRecruiterProfileByUserId`)

```typescript
// Direct Prisma call — NEVER import CompanyRepository (module isolation, ARCH-04)
const row = await prisma.company.findUnique({ where: { id } })
```

The comment must be preserved to document the intentional cross-module Prisma query.

---

## No Analog Found

All files have close analogs. No entries required.

---

## Key Pitfalls to Avoid (Planner Reference)

| Pitfall | Source | Guard |
|---------|--------|-------|
| GET /jobs/mine registered after GET /jobs/:id | `src/modules/job/job.routes.ts` line 60 | Register `/mine` before `/:id` — Fastify is registration-order sensitive |
| `AppError` thrown inside `adjustCredits` transaction | `src/modules/company/company.repository.ts` lines 18-19 | Replace with `DomainError(message, code, statusCode)` in adapter |
| `requireRole` wrong import depth from new routes | Phase 10 | `'../../../shared/hooks/requireRole'` (3 levels up from `src/infrastructure/http/routes/`) |
| Use case imports `prisma` directly | — | `grep -r "infrastructure/database/prisma" src/application/` must return nothing |
| `bind(ctrl)` omitted on route registration | Phase 10 Pitfall 5 | Every route: `ctrl.method.bind(ctrl)` |
| Admin `findMany`/`findByIdPublic` not added to `UserRepository` | — | Both interface extension AND implementation must be added before admin tests run |
| Scheduler imports not updated when job migrates | `src/infrastructure/http/plugins/scheduler.plugin.ts` | Update both imports as part of job module migration task |

---

## Metadata

**Analog search scope:** `src/adapters/`, `src/application/use-cases/auth/`, `src/infrastructure/http/routes/`, `src/modules/` (all five modules), `src/domain/interfaces/`, `src/domain/entities/`, `src/shared/hooks/`, `src/app.ts`
**Files read:** 30
**Pattern extraction date:** 2026-05-08
