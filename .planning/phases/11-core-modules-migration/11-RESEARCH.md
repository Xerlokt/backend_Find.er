# Phase 11: Core Modules Migration - Research

**Researched:** 2026-05-08
**Domain:** Clean Architecture migration — candidate, company, recruiter, job, and admin modules
**Confidence:** HIGH (all findings derived from reading actual source files)

---

## Summary

Phase 11 applies the same migration pattern established in Phase 10 to five modules: candidate, company, recruiter, job, and admin. The pattern is fully proven: use-case classes inject domain interfaces only; repository implementations map Prisma rows to domain entities via `toDomain()`; controllers do Zod parse + use-case instantiation + DomainError catch; route files are thin Fastify plugins with zero business logic.

The key structural difference from Phase 10 is the admin module. Admin has no dedicated repository of its own — it calls `prisma` directly (listUsers, getUserById, getTransactions) and depends on an `ICreditService` interface that is concrete at wiring time. The admin use cases must continue calling `prisma` via an injected adapter, or the queries must move to the user repository. The safest path is: create an `AdminUseCase` that accepts `IUserRepository` (for user queries) and `ICompanyRepository`/credit interfaces (for credit and transaction queries), reusing existing interfaces without adding ad-hoc Prisma calls to use cases.

The scheduler (`job.scheduler.ts` / `runExpiryCheck`) depends on `JobRepository` from `src/modules/job/`. After Phase 11, `JobRepository` in the adapters layer replaces this — the `scheduler.plugin.ts` (already in `src/infrastructure/http/plugins/`) must have its import updated from `'../../../modules/job/job.repository'` to `'../../../adapters/repositories/job.repository'` and its `runExpiryCheck` import updated similarly.

The `RankingItem` interface is currently exported from `src/modules/job/job.routes.ts` and consumed by the swipe module. This export must be moved to a location that does not belong to the old modules directory — the safest location is a shared domain type or a type co-located with the new job routes file in infrastructure. Since Phase 12 migrates swipe, the simplest Phase 11 approach is to re-export `RankingItem` from the new `src/infrastructure/http/routes/job.routes.ts` so Phase 12 can find it there, and update `app.ts` to swap the job import.

All 134 integration tests must remain green after each module is migrated. The test suite calls `buildApp()` from `src/app.ts` — the seam is always a single import swap per module in `app.ts`.

**Primary recommendation:** Migrate modules one at a time in the order: candidate → company → recruiter → job → admin. Each migration follows the identical 3-file pattern: repository implementation (adapters/repositories/) + use case(s) (application/use-cases/MODULE/) + controller (adapters/controllers/) + route file (infrastructure/http/routes/) + app.ts import swap.

---

## Project Constraints (from CLAUDE.md)

- **Architecture:** routes → service → repository; no skipping layers. Phase 11 maps to: routes → controller → use-case → repository.
- **SOLID SRP:** one class per responsibility — each use case is its own file/class.
- **Module isolation:** modules do not import from other modules. `src/adapters/` imports only `application/` and `domain/`.
- **Security:** all queries via Prisma ORM — no raw SQL string interpolation.
- **Zod validation:** inputs validated with Zod in all endpoints — validation stays in controller or route file.
- **Atomic transactions:** `company.adjustCredits` and credit operations use `prisma.$transaction` — this must be preserved inside the CompanyRepository adapter implementation.
- **TDD:** integration tests run against real Docker DB — no mocks for DB interaction.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-03 | Repository implementations are tested against real Docker DB — no mocks for DB interaction | Integration tests via `buildApp()` + Supertest exercise the new repository impls end-to-end through real Prisma queries. No new test files needed — existing tests in `tests/integration/candidate.test.ts`, `company.test.ts`, `recruiter.test.ts`, `job.test.ts`, `admin.test.ts` cover all five modules. The migration must not break any of the 134 existing tests. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Candidate profile upsert/get | Application (use-cases/candidate/) | — | Business rules (NOT_FOUND guard) live in use case |
| Company CRUD + credit adjustment | Application (use-cases/company/) | — | Credit atomic guard lives in CompanyRepository via $transaction |
| Recruiter profile upsert/get | Application (use-cases/recruiter/) | — | Company existence check is a use-case concern |
| Job CRUD + recruiter ownership | Application (use-cases/job/) | — | Ownership guard (job.recruiterId !== profile.id) is business logic |
| Job expiry scheduler | Infrastructure (http/plugins/scheduler.plugin.ts) | Application (use-cases/job/) | Scheduler plugin calls use case or repository — but runExpiryCheck() is infrastructure-facing; job.scheduler.ts moves to infrastructure/scheduler/ |
| Admin user queries | Application (use-cases/admin/) | — | No business logic but SELECT-only user/transaction queries go in use case; IUserRepository provides the data |
| Admin credit delegation | Application (use-cases/admin/) | Adapters (repositories/company.repository.ts) | AdminUseCase delegates to ICreditService / ICompanyRepository; no Prisma in use case |
| HTTP input validation (Zod) | Adapters (controllers/) | — | All Zod schema parsing moves from route handlers to controller methods |
| Route registration | Infrastructure (http/routes/) | — | Zero logic; only endpoint registration + preHandlers + ctrl.method.bind(ctrl) |
| DB access (CandidateProfile, Company, RecruiterProfile, Job) | Adapters (repositories/) | — | Implements domain interfaces; maps Prisma rows to domain entities via toDomain() |

---

## Standard Stack

### Core (all already installed — no new packages needed)
[VERIFIED: reading package.json and src/ files]

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| fastify | ^5.8.5 | HTTP framework | already installed |
| @prisma/client | ^7.7.0 | DB ORM | already installed — used only in adapters/repositories/ |
| zod | ^4.3.2 | Input validation | already installed — used only in adapters/controllers/ |

### No New Installs
Phase 11 is purely a code migration. All required libraries are already installed.

---

## Architecture Patterns

### System Architecture Diagram — Module Request Flow (New Wiring)

```
HTTP Request
     |
     v
src/infrastructure/http/routes/<module>.routes.ts
     | (registers path, preHandler hooks, delegates via ctrl.method.bind(ctrl))
     v
src/adapters/controllers/<module>.controller.ts
     | (Zod parse, catch DomainError → HTTP status)
     v
src/application/use-cases/<module>/<use-case>.ts
     | (business rules; calls IXxxRepository via constructor injection)
     |
     +---> src/adapters/repositories/<module>.repository.ts (IXxxRepository)
                |
                v
          src/infrastructure/database/prisma.ts (PrismaClient)
                |
                v
          PostgreSQL
```

### Recommended Project Structure (new directories this phase creates)

```
src/
├── application/
│   └── use-cases/
│       ├── candidate/
│       │   ├── upsert-candidate-profile.use-case.ts
│       │   └── get-candidate-profile.use-case.ts
│       ├── company/
│       │   ├── create-company.use-case.ts
│       │   ├── get-company.use-case.ts
│       │   └── adjust-company-credits.use-case.ts
│       ├── recruiter/
│       │   ├── upsert-recruiter-profile.use-case.ts
│       │   └── get-recruiter-profile.use-case.ts
│       ├── job/
│       │   ├── create-job.use-case.ts
│       │   ├── update-job.use-case.ts
│       │   ├── deactivate-job.use-case.ts
│       │   ├── list-jobs-by-recruiter.use-case.ts
│       │   └── get-job-by-id.use-case.ts
│       └── admin/
│           ├── list-users.use-case.ts
│           ├── get-user-by-id.use-case.ts
│           ├── adjust-admin-credits.use-case.ts
│           └── get-transactions.use-case.ts
├── adapters/
│   ├── controllers/
│   │   ├── candidate.controller.ts      (NEW)
│   │   ├── company.controller.ts        (NEW)
│   │   ├── recruiter.controller.ts      (NEW)
│   │   ├── job.controller.ts            (NEW)
│   │   └── admin.controller.ts          (NEW)
│   └── repositories/
│       ├── candidate.repository.ts      (NEW — implements ICandidateRepository)
│       ├── company.repository.ts        (NEW — implements ICompanyRepository)
│       ├── recruiter.repository.ts      (NEW — implements IRecruiterRepository)
│       └── job.repository.ts            (NEW — implements IJobRepository)
└── infrastructure/
    └── http/
        └── routes/
            ├── candidate.routes.ts      (NEW)
            ├── company.routes.ts        (NEW)
            ├── recruiter.routes.ts      (NEW)
            ├── job.routes.ts            (NEW)
            └── admin.routes.ts          (NEW)
```

---

## Critical Design Questions — Resolved

### Q1: Admin module — no dedicated repository

**Current behavior:** `AdminService` queries `prisma.user.*` and `prisma.creditTransaction.*` directly (not via a repository class). It also depends on `ICreditService` for credit grants.

**Problem:** Admin use cases must not import Prisma directly. The user and transaction queries need a home.

**Resolution:** Admin use cases receive two injected interfaces:
- `IUserRepository` (already defined in Phase 9) — for `findMany` (listUsers) and `findById` (getUserById). The existing `IUserRepository` has `findById` but not `findMany`. **A `findMany(opts: {skip: number, take: number}): Promise<UserPublic[]>` method must be added to `IUserRepository`** (or a new `IAdminUserRepository` interface can be defined). The simplest path is to add `findMany` to `IUserRepository` in `src/domain/interfaces/user.repository.interface.ts` and implement it in the existing `UserRepository` adapter — since admin is the only consumer and `IUserRepository` is the natural owner.
- `ICompanyRepository` — for `getTransactions`. The current `ICompanyRepository` does not have a `getTransactions` method. The method needs to be added: `getTransactions(companyId: string): Promise<CreditTransaction[]>`. This requires a `CreditTransaction` domain entity (already exists at `src/domain/entities/credit-transaction.entity.ts`).

**Impact:** Two interface extensions required:
1. `src/domain/interfaces/user.repository.interface.ts` — add `findMany(opts: {skip: number; take: number}): Promise<UserPublic[]>` where `UserPublic = Omit<User, 'passwordHash' | 'googleId'>` or a dedicated type.
2. `src/domain/interfaces/company.repository.interface.ts` — add `getTransactions(companyId: string): Promise<CreditTransaction[]>`.

Both `UserRepository` and `CompanyRepository` adapter implementations must implement the new methods.

**Alternative:** Create a dedicated `IAdminRepository` interface in `src/domain/interfaces/admin.repository.interface.ts`. This avoids modifying existing interfaces but adds a new interface that overlaps domain concerns. Given the project pattern (Phase 9 noted "methods derived verbatim from existing repository files"), extending the natural interfaces is cleaner.

### Q2: Admin module — ICreditService dependency

**Current behavior:** `AdminService` receives an `ICreditService` instance (injected in `app.ts`). The `AdminService.adjustCredits` method delegates to `creditService.grantCredits`. `CreditService` and `CreditRepository` are NOT migrated in Phase 11 — they are in Phase 12.

**Resolution:** The `AdminController` / admin use case must still receive an `ICreditService`-like dependency for the credit adjustment call. The most straightforward approach:
- Define an `ICreditGrantPort` (or reuse the existing `ICreditService` interface from `admin.service.ts`) in the admin use-case context. The `AdjustAdminCreditsUseCase` receives this interface by constructor injection.
- In the new `admin.routes.ts` (infrastructure), the composition root instantiates `CreditService` (still from `src/modules/credits/credits.service.ts`) and passes it in — exactly as `app.ts` currently does.
- This avoids migrating credits in Phase 11 while keeping the admin use case clean of Prisma imports.

**Impact:** `AdjustAdminCreditsUseCase` injects an `ICreditService` interface (kept in `src/application/use-cases/admin/` as a local type, or imported from `src/modules/admin/admin.service.ts` temporarily). The simplest approach is to define `interface ICreditGrantPort { grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown> }` inline in the admin use case file and have the controller/route pass the concrete `CreditService`.

### Q3: RankingItem interface — export location

**Current behavior:** `RankingItem` is exported from `src/modules/job/job.routes.ts` and imported by `src/modules/swipe/swipe.routes.ts` (the ranking response type).

**Problem:** After Phase 11, `jobRoutes` is imported from `src/infrastructure/http/routes/job.routes.ts`. The swipe module still imports from `src/modules/swipe/swipe.routes.ts` (Phase 12 scope). If the job route import in `app.ts` is swapped to the new location, `swipe.routes.ts` would break its import of `RankingItem` from `src/modules/job/job.routes.ts`.

**Resolution:** Two acceptable approaches:
1. Keep `RankingItem` re-exported from `src/modules/job/job.routes.ts` (untouched) even after `app.ts` swaps to the new job route file. The old file stays in place until Phase 13 deletion. `swipe.routes.ts` continues to import from the old location — no change needed in Phase 11.
2. Export `RankingItem` from the new `src/infrastructure/http/routes/job.routes.ts` AND update `swipe.routes.ts` to import from the new location.

**Decision: Option 1 is correct.** Phase 11 is additive — old module files are not deleted. `src/modules/job/job.routes.ts` stays in place and `swipe.routes.ts` continues importing `RankingItem` from there. No cross-module import chain is broken. The old file is deleted in Phase 13.

### Q4: scheduler.plugin.ts — import update on job migration

**Current behavior:** `src/infrastructure/http/plugins/scheduler.plugin.ts` imports `JobRepository` and `runExpiryCheck` from `'../../../modules/job/job.repository'` and `'../../../modules/job/job.scheduler'`.

**After Phase 11:** `JobRepository` moves to `src/adapters/repositories/job.repository.ts` and `runExpiryCheck` must also be relocated. The function is currently in `src/modules/job/job.scheduler.ts` — it belongs conceptually in the infrastructure/scheduler layer (`src/infrastructure/scheduler/job-expiry.scheduler.ts` per plan-architecture.md) or can stay as a pure function accepting `IJobRepository`.

**Resolution:** When the job module is migrated:
1. Create `src/infrastructure/scheduler/job-expiry.scheduler.ts` — copy of `runExpiryCheck` but accepting `IJobRepository` instead of `JobRepository` concrete class.
2. Update `src/infrastructure/http/plugins/scheduler.plugin.ts` imports to:
   - `import { JobRepository } from '../../../adapters/repositories/job.repository'`
   - `import { runExpiryCheck } from '../../scheduler/job-expiry.scheduler'`
3. The old `src/modules/job/job.scheduler.ts` stays untouched (deleted in Phase 13).

### Q5: requireRole hook — where does it live for new routes?

**Current behavior:** All module routes import `requireRole` from `'../../shared/hooks/requireRole'`. The new route files at `src/infrastructure/http/routes/` are 3 levels deep — the relative path would be `'../../../shared/hooks/requireRole'`.

**Resolution:** New route files import `authenticate` from `'../plugins/authenticate.hook'` (already at `src/infrastructure/http/plugins/`) and `requireRole` from `'../../../shared/hooks/requireRole'` (same shared location, corrected depth). No changes to `requireRole.ts` itself — it stays in shared/ until Phase 13 cleanup.

**Path verification:**
- From `src/infrastructure/http/routes/*.routes.ts`
- `authenticate` → `'../plugins/authenticate.hook'` (1 level up to http/, then into plugins/) ✓
- `requireRole` → `'../../../shared/hooks/requireRole'` (3 levels up to src/, then shared/hooks/) ✓

### Q6: toDomain() and Prisma field mapping per module

Each repository adapter needs a private `toDomain()` method mapping Prisma row fields to domain entity fields. The domain entities are already defined in Phase 9. Below are the field audits:

**CandidateProfile entity vs Prisma `candidateProfile` model:**
- Domain entity: `id, userId, name, bio, lat, lng, professionId, skills, preferredModalities, searchRadiusKm, salaryExpectation`
- Prisma model: same fields (bio/lat/lng/salaryExpectation are nullable)
- Note: `preferredModalities` is `Modality[]` — Prisma uses `Modality` enum from `@prisma/client`; domain uses `Modality = 'REMOTE' | 'HYBRID' | 'IN_PERSON'` union type. Cast is `row.preferredModalities as Modality[]`.

**Company entity vs Prisma `company` model:**
- Domain entity: `id, name, logoUrl, description, rating, plan, planExpiresAt, credits, createdAt`
- Prisma model: same fields (logoUrl/description/planExpiresAt are nullable)
- Note: `CompanyRepository.adjustCredits` uses `prisma.$transaction` — must be preserved as-is in the adapter.

**RecruiterProfile entity vs Prisma `recruiterProfile` model:**
- Domain entity: `id, userId, companyId`
- Prisma model: same 3 fields

**Job entity vs Prisma `job` model:**
- Domain entity: `id, companyId, recruiterId, title, description, professionId, salaryMin, salaryMax, lat, lng, modality, requiredSkills, expiresAt, isActive, createdAt`
- Prisma model: same fields (salaryMin/salaryMax/lat/lng are nullable)
- Note: `modality` is `Modality` enum in Prisma; cast as domain `Modality` union.

**For admin — no dedicated entity, but UserPublic:**
- `listUsers` returns `{ id, email, role, avatarUrl, createdAt }` — sensitive fields explicitly excluded.
- `getTransactions` returns `creditTransaction` rows — domain entity `CreditTransaction` exists at `src/domain/entities/credit-transaction.entity.ts`.

### Q7: Admin use cases and Prisma direct calls

`AdminService.listUsers` and `getUserById` call `prisma.user.findMany` / `prisma.user.findUnique` directly with a `select` clause that excludes `passwordHash` and `googleId`. The IUserRepository interface currently has `findById` but not `findMany`.

**Options:**
1. Add `findMany(opts)` to `IUserRepository` — cleanest, uses existing interface.
2. Define a separate `IAdminRepository` with `listUsers` and `getTransactions`.

Option 1 is preferred. The new method signature on `IUserRepository`:
```typescript
findMany(opts: { skip: number; take: number }): Promise<UserPublic[]>
```
where `UserPublic` is defined as a type alias in `user.repository.interface.ts`:
```typescript
export type UserPublic = Omit<User, 'passwordHash' | 'googleId'>
```

The `UserRepository` adapter implements this by calling `prisma.user.findMany({ skip, take, select: {...} })` and returning the projected shape.

**For `getTransactions`:** Add `getTransactions(companyId: string): Promise<CreditTransaction[]>` to `ICompanyRepository`. Implement in `CompanyRepository` adapter.

### Q8: app.ts composition root changes

For admin, `app.ts` currently does:
```typescript
const creditRepo = new CreditRepository()
const creditService = new CreditService(creditRepo, chatService)
const adminService = new AdminService(creditService)
await app.register(adminRoutes, { prefix: '/admin', service: adminService })
```

After Phase 11, `adminRoutes` is imported from `src/infrastructure/http/routes/admin.routes.ts`. The new `admin.routes.ts` must still accept a `CreditService` (or interface) so the controller can pass it to `AdjustAdminCreditsUseCase`. The cleanest approach: the new `admin.routes.ts` instantiates `AdminController` passing the credit service as a constructor argument, and `app.ts` passes `{ prefix: '/admin', creditService }` as opts.

**Exact change in app.ts per module migration (one import swap per module):**

| Module | Old Import | New Import |
|--------|-----------|-----------|
| candidate | `./modules/candidate/candidate.routes` | `./infrastructure/http/routes/candidate.routes` |
| company | `./modules/company/company.routes` | `./infrastructure/http/routes/company.routes` |
| recruiter | `./modules/recruiter/recruiter.routes` | `./infrastructure/http/routes/recruiter.routes` |
| job | `./modules/job/job.routes` | `./infrastructure/http/routes/job.routes` |
| admin | `./modules/admin/admin.routes` + `./modules/admin/admin.service` | `./infrastructure/http/routes/admin.routes` (opts change) |

---

## File-by-File Implementation Guide

### Candidate Module

**`src/adapters/repositories/candidate.repository.ts`** — implements `ICandidateRepository`:
- `upsertProfile(userId, data)` → `prisma.candidateProfile.upsert(...)` + `toDomain()`
- `findByUserId(userId)` → `prisma.candidateProfile.findUnique(...)` + `toDomain() | null`
- Prisma import: `from '../../infrastructure/database/prisma'`
- `toDomain(row)` maps: `id, userId, name, bio, lat, lng, professionId, skills, preferredModalities as Modality[], searchRadiusKm, salaryExpectation`

**`src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts`**:
- Injects: `ICandidateRepository`
- Logic: calls `repo.upsertProfile(userId, data)` and returns result
- No error throw needed (upsert never 404s)

**`src/application/use-cases/candidate/get-candidate-profile.use-case.ts`**:
- Injects: `ICandidateRepository`
- Logic: calls `repo.findByUserId(userId)`; throws `DomainError('Profile not found', 'NOT_FOUND', 404)` if null

**`src/adapters/controllers/candidate.controller.ts`**:
- `upsertProfile(request, reply)`: Zod parse → `new UpsertCandidateProfileUseCase(new CandidateRepository())` → execute → `reply.status(200).send(result)`
- `getProfile(request, reply)`: `new GetCandidateProfileUseCase(new CandidateRepository())` → execute → `reply.status(200).send(result)`
- DomainError catch in every handler

**`src/infrastructure/http/routes/candidate.routes.ts`**:
- `PUT /me` → `[authenticate, requireRole('CANDIDATE')]` → `ctrl.upsertProfile.bind(ctrl)`
- `GET /me` → `[authenticate, requireRole('CANDIDATE')]` → `ctrl.getProfile.bind(ctrl)`

---

### Company Module

**`src/adapters/repositories/company.repository.ts`** — implements `ICompanyRepository`:
- `create(data)` → `prisma.company.create(...)` + `toDomain()`
- `findById(id)` → `prisma.company.findUnique(...)` + `toDomain() | null`
- `adjustCredits(companyId, delta, reason)` → `prisma.$transaction(...)` — **preserve full transaction logic from `src/modules/company/company.repository.ts`**; throw `DomainError` (not `AppError`) inside the transaction for NOT_FOUND and INSUFFICIENT_CREDITS cases
- `getTransactions(companyId)` → `prisma.creditTransaction.findMany({where: {companyId}, orderBy: {createdAt:'desc'}})` + map to `CreditTransaction[]`
- `toDomain(row)` maps: `id, name, logoUrl, description, rating, plan, planExpiresAt, credits, createdAt`

**CRITICAL:** `adjustCredits` currently throws `AppError` inside the transaction. This must be changed to `DomainError` in the adapter since `errorHandler.ts` now checks `DomainError` first. Using `AppError` inside the transaction still works (errorHandler handles it), but using `DomainError` is the correct pattern for adapter implementations.

**`src/application/use-cases/company/create-company.use-case.ts`**:
- Injects: `ICompanyRepository`
- Logic: calls `repo.create(data)`

**`src/application/use-cases/company/get-company.use-case.ts`**:
- Injects: `ICompanyRepository`
- Logic: `repo.findById(id)` → throws `DomainError('Company not found', 'NOT_FOUND', 404)` if null

**`src/application/use-cases/company/adjust-company-credits.use-case.ts`**:
- Injects: `ICompanyRepository`
- Logic: calls `repo.adjustCredits(companyId, delta, reason)` (transaction-safe inside repo)

**`src/adapters/controllers/company.controller.ts`**:
- `create`, `getById`, `adjustCredits` handlers
- Zod schemas: `CreateCompanySchema`, `AdjustCreditsSchema`
- HTTP status: 201 for create, 200 for others

**`src/infrastructure/http/routes/company.routes.ts`**:
- `POST /` → `[authenticate, requireRole('ADMIN')]` → `ctrl.create.bind(ctrl)`
- `GET /:id` → `[authenticate]` → `ctrl.getById.bind(ctrl)`
- `PATCH /admin/:id/credits` → `[authenticate, requireRole('ADMIN')]` → `ctrl.adjustCredits.bind(ctrl)`

---

### Recruiter Module

**`src/adapters/repositories/recruiter.repository.ts`** — implements `IRecruiterRepository`:
- `upsertProfile(userId, data)` → `prisma.recruiterProfile.upsert(...)` + `toDomain()`
- `findByUserId(userId)` → `prisma.recruiterProfile.findUnique(...)` + `toDomain() | null`
- `findCompanyById(id)` → `prisma.company.findUnique(...)` + company `toDomain() | null`
- `toDomain(row)` for RecruiterProfile: `id, userId, companyId`
- `toDomain(row)` for Company: delegates to same company mapper pattern (inline or reuse from company repo — but due to module isolation, inline the company toDomain)
- **Module isolation rule:** `recruiter.repository.ts` MUST NOT import `CompanyRepository` — it calls `prisma.company.findUnique` directly, exactly as the current `RecruiterRepository.findCompanyById` does.

**`src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts`**:
- Injects: `IRecruiterRepository`
- Logic: `repo.findCompanyById(data.companyId)` → throws `DomainError('Company not found', 'NOT_FOUND', 404)` if null → `repo.upsertProfile(userId, data)`

**`src/application/use-cases/recruiter/get-recruiter-profile.use-case.ts`**:
- Injects: `IRecruiterRepository`
- Logic: `repo.findByUserId(userId)` → throws `DomainError('Profile not found', 'NOT_FOUND', 404)` if null

**`src/adapters/controllers/recruiter.controller.ts`**:
- `upsertProfile`, `getProfile` handlers
- Zod: `RecruiterProfileSchema`

**`src/infrastructure/http/routes/recruiter.routes.ts`**:
- `PUT /me` → `[authenticate, requireRole('RECRUITER')]` → `ctrl.upsertProfile.bind(ctrl)`
- `GET /me` → `[authenticate, requireRole('RECRUITER')]` → `ctrl.getProfile.bind(ctrl)`

---

### Job Module

**`src/adapters/repositories/job.repository.ts`** — implements `IJobRepository`:
- `create(recruiterId, data)` → `prisma.job.create(...)` + `toDomain()`
- `findById(id)` → `prisma.job.findUnique(...)` + `toDomain() | null`
- `update(id, data)` → `prisma.job.update(...)` + `toDomain()`
- `findByRecruiterId(recruiterId)` → `prisma.job.findMany(...)` + `toDomain()[]`
- `findRecruiterProfileByUserId(userId)` → `prisma.recruiterProfile.findUnique(...)` + RecruiterProfile toDomain | null (inline, no RecruiterRepository import)
- `deactivateExpiredJobs()` → `prisma.job.updateMany(...)` returns `result.count`
- `toDomain(row)` maps: `id, companyId, recruiterId, title, description, professionId, salaryMin, salaryMax, lat, lng, modality as Modality, requiredSkills, expiresAt, isActive, createdAt`

**`src/application/use-cases/job/create-job.use-case.ts`**:
- Injects: `IJobRepository`
- Logic: `repo.findRecruiterProfileByUserId(userId)` → NOT_FOUND if null → `repo.create(profile.id, {...data, companyId: profile.companyId})`

**`src/application/use-cases/job/update-job.use-case.ts`**:
- Injects: `IJobRepository`
- Logic: profile check → job find → FORBIDDEN if ownership mismatch → `repo.update(jobId, data)`

**`src/application/use-cases/job/deactivate-job.use-case.ts`**:
- Injects: `IJobRepository`
- Logic: delegates to `UpdateJobUseCase` internally OR directly does ownership check + `repo.update(jobId, {isActive: false})`
- Simpler as a standalone use case with its own ownership check

**`src/application/use-cases/job/list-jobs-by-recruiter.use-case.ts`**:
- Injects: `IJobRepository`
- Logic: profile check → `repo.findByRecruiterId(profile.id)`

**`src/application/use-cases/job/get-job-by-id.use-case.ts`**:
- Injects: `IJobRepository`
- Logic: `repo.findById(id)` → NOT_FOUND if null

**`src/adapters/controllers/job.controller.ts`**:
- `create`, `listMine`, `getById`, `update`, `deactivate` handlers
- Zod: `CreateJobSchema`, `UpdateJobSchema`, `JobParamsSchema`
- HTTP status: 201 for create, 200 for others
- `RankingItem` type must be defined or re-exported in job.controller.ts for the `getById` response format: `{...job, rankings: [] as RankingItem[]}`

**`src/infrastructure/http/routes/job.routes.ts`**:
- `POST /` → `[authenticate, requireRole('RECRUITER')]`
- `GET /mine` → `[authenticate, requireRole('RECRUITER')]` — MUST be registered before `GET /:id`
- `GET /:id` → `[authenticate]`
- `PATCH /:id` → `[authenticate, requireRole('RECRUITER')]`
- `DELETE /:id/deactivate` → `[authenticate, requireRole('RECRUITER')]`

**`src/infrastructure/scheduler/job-expiry.scheduler.ts`** — NEW:
- Move `runExpiryCheck` function here, typed to accept `IJobRepository`
- Update `scheduler.plugin.ts` imports to point here and to `src/adapters/repositories/job.repository.ts`

---

### Admin Module

**IUserRepository extension** — add to `src/domain/interfaces/user.repository.interface.ts`:
```typescript
export type UserPublic = Omit<User, 'passwordHash' | 'googleId'>
findMany(opts: { skip: number; take: number }): Promise<UserPublic[]>
```

**ICompanyRepository extension** — add to `src/domain/interfaces/company.repository.interface.ts`:
```typescript
getTransactions(companyId: string): Promise<CreditTransaction[]>
```
(Import `CreditTransaction` from `'../entities/credit-transaction.entity'`)

**UserRepository adapter update** — add `findMany` implementation:
```typescript
async findMany(opts: { skip: number; take: number }): Promise<UserPublic[]> {
  const rows = await prisma.user.findMany({
    skip: opts.skip, take: opts.take,
    select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return rows as UserPublic[]
}
```

**CompanyRepository adapter update** — add `getTransactions` implementation:
```typescript
async getTransactions(companyId: string): Promise<CreditTransaction[]> {
  return prisma.creditTransaction.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  })
}
```

**`src/application/use-cases/admin/list-users.use-case.ts`**:
- Injects: `IUserRepository`
- Logic: `repo.findMany({ skip: (page-1)*limit, take: limit })`

**`src/application/use-cases/admin/get-user-by-id.use-case.ts`**:
- Injects: `IUserRepository`
- Logic: `repo.findById(id)` → `DomainError('User not found', 'NOT_FOUND', 404)` if null

**`src/application/use-cases/admin/adjust-admin-credits.use-case.ts`**:
- Injects: `ICreditGrantPort` (interface defined locally: `interface ICreditGrantPort { grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown> }`)
- Logic: `creditService.grantCredits(companyId, amount, 'admin_grant')`

**`src/application/use-cases/admin/get-transactions.use-case.ts`**:
- Injects: `ICompanyRepository`
- Logic: `repo.getTransactions(companyId)`

**`src/adapters/controllers/admin.controller.ts`**:
- Constructor receives `ICreditGrantPort` instance (injected from route file)
- `listUsers`, `getUserById`, `adjustCredits`, `getTransactions` handlers
- Zod: `ListUsersQuerySchema`, `ParamIdSchema`, `AdjustCreditsAdminSchema`

**`src/infrastructure/http/routes/admin.routes.ts`**:
- Opts signature: `{ creditService: ICreditGrantPort }` (same CreditService passed in from app.ts)
- `new AdminController(opts.creditService)`
- Routes: `GET /users`, `GET /users/:id`, `PATCH /companies/:id/credits`, `GET /companies/:id/transactions`
- All preHandlers: `[authenticate, requireRole('ADMIN')]`

**app.ts change for admin:**
```typescript
// OLD:
import { adminRoutes } from './modules/admin/admin.routes'
import { AdminService } from './modules/admin/admin.service'
// ...
const adminService = new AdminService(creditService)
await app.register(adminRoutes, { prefix: '/admin', service: adminService })

// NEW:
import { adminRoutes } from './infrastructure/http/routes/admin.routes'
// ...
await app.register(adminRoutes, { prefix: '/admin', creditService })
// AdminService import and instantiation removed
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic credit guard (insufficient credits) | Custom lock | `prisma.$transaction` inside CompanyRepository.adjustCredits — existing pattern from Phase 3 | SQL atomicity is guaranteed by PostgreSQL within the transaction |
| Prisma row→entity mapping | Spread `{ ...row }` | Explicit `toDomain()` private method | Avoids accidentally leaking future Prisma-only fields; makes TypeScript type-check each field |
| Permission checks in route | Inline auth logic | `authenticate` hook + `requireRole()` from `src/shared/hooks/requireRole.ts` | Separation of auth from business routing |
| Multi-module queries (e.g., admin querying users) | Import other module repositories | Call Prisma directly in the repository that owns the data OR extend the interface of the natural owner | Preserves module isolation (ARCH-04) |

---

## Common Pitfalls

### Pitfall 1: Use case imports Prisma directly
**What goes wrong:** A use case does `import { prisma } from '../../infrastructure/database/prisma'` to perform a query, violating ARCH-07 (not the target of Phase 11 — that's ARCH-07 in Phase 12 — but the same constraint applies here since use cases must depend only on interfaces).
**Why it happens:** Admin queries seem simple enough to inline.
**How to avoid:** Every DB operation must flow through an `IXxxRepository` method injected into the use case constructor.
**Warning signs:** `grep -r "import.*infrastructure/database/prisma" src/application/` returns any match.

### Pitfall 2: AppError thrown inside new adapter transaction
**What goes wrong:** `CompanyRepository.adjustCredits` throws `AppError` inside `prisma.$transaction`. After migration this is functionally acceptable (errorHandler handles AppError), but it is architecturally inconsistent — adapter implementations should throw `DomainError`.
**Why it happens:** Copy-pasting from `src/modules/company/company.repository.ts`.
**How to avoid:** Replace `throw new AppError(...)` with `throw new DomainError(...)` using the `(message, code, statusCode)` argument order.

### Pitfall 3: requireRole import path wrong depth
**What goes wrong:** New route files at `src/infrastructure/http/routes/` import `requireRole` from `'../../shared/hooks/requireRole'` (wrong depth) instead of `'../../../shared/hooks/requireRole'`.
**Why it happens:** Mentally mapping the old module path depth instead of the new infra depth.
**How to avoid:** From `src/infrastructure/http/routes/`: 3 levels up (`../../../`) to reach `src/`, then `shared/hooks/requireRole`.

### Pitfall 4: GET /jobs/mine registered after GET /jobs/:id
**What goes wrong:** Fastify matches `/jobs/mine` against the `/:id` param route and treats `"mine"` as a UUID — the UUID Zod parse throws 400.
**Why it happens:** Forgetting that Fastify route registration order matters for literal vs wildcard paths.
**How to avoid:** Register `GET /mine` BEFORE `GET /:id` in `job.routes.ts` — same order as the current `src/modules/job/job.routes.ts`.
**Warning signs:** Test `GET /jobs/mine` returns 400 with `{ error: 'Validation error' }` instead of 200.

### Pitfall 5: bind(ctrl) omitted for class method delegation
**What goes wrong:** Fastify calls the handler function with its own `this` context — `this.repo` inside the controller method is `undefined`.
**Why it happens:** Forgetting the `.bind(ctrl)` pattern established in Phase 10.
**How to avoid:** Every route registration uses `ctrl.method.bind(ctrl)` — never `ctrl.method` alone.

### Pitfall 6: toDomain() returns Prisma enum value instead of union type
**What goes wrong:** TypeScript accepts `Prisma.Modality` enum (from `@prisma/client`) when the domain type expects `'REMOTE' | 'HYBRID' | 'IN_PERSON'` string union — but at runtime they have the same values, so tests may pass while TypeScript gives errors.
**Why it happens:** `@prisma/client` generates an enum type; domain entities use a string union.
**How to avoid:** Cast explicitly: `modality: row.modality as Modality` and `preferredModalities: row.preferredModalities as Modality[]`.

### Pitfall 7: Admin use case has no way to call adjustCredits without ICreditService
**What goes wrong:** `AdjustAdminCreditsUseCase` is instantiated without a credit service reference — the controller doesn't know where to get it.
**Why it happens:** The credit service is wired at `app.ts` composition root, not instantiated inside controller handlers (unlike other use cases in Phase 10/11).
**How to avoid:** `AdminController` receives `ICreditGrantPort` via its constructor. The route file receives it via Fastify opts and passes it to `new AdminController(opts.creditService)`.

### Pitfall 8: Scheduler imports not updated after job module migration
**What goes wrong:** `scheduler.plugin.ts` still imports `JobRepository` from `'../../../modules/job/job.repository'` after the job module migrates, causing dual repository instances (one per import path — same Prisma client but different class instances, no functional issue) and leaving the old import alive until Phase 13.
**Why it happens:** The scheduler is an infrastructure concern — it's easy to forget it depends on the job module.
**How to avoid:** Update scheduler imports as part of the job module migration task. Create `src/infrastructure/scheduler/job-expiry.scheduler.ts` and update the plugin.

---

## Code Examples

### CandidateRepository (toDomain pattern)
[VERIFIED: derived from Phase 10 patterns + candidate.entity.ts + Prisma schema]

```typescript
// src/adapters/repositories/candidate.repository.ts
import { prisma } from '../../infrastructure/database/prisma'
import { ICandidateRepository } from '../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { Modality } from '../../domain/entities/job.entity'

export class CandidateRepository implements ICandidateRepository {
  async upsertProfile(
    userId: string,
    data: {
      name: string; bio?: string | null; lat?: number | null; lng?: number | null
      professionId: string; skills: string[]; preferredModalities: Modality[]
      salaryExpectation?: number | null; searchRadiusKm?: number
    },
  ): Promise<CandidateProfile> {
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
      preferredModalities: row.preferredModalities as Modality[],
      searchRadiusKm: row.searchRadiusKm,
      salaryExpectation: row.salaryExpectation,
    }
  }
}
```

### CompanyRepository.adjustCredits (atomic transaction with DomainError)
[VERIFIED: derived from company.repository.ts + DomainError pattern from Phase 10]

```typescript
// inside src/adapters/repositories/company.repository.ts
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
```

### GetCandidateProfileUseCase
[VERIFIED: derived from CandidateService.getProfile + Phase 10 DomainError pattern]

```typescript
// src/application/use-cases/candidate/get-candidate-profile.use-case.ts
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

### CandidateController (handler pattern)
[VERIFIED: derived from Phase 10 AuthController pattern]

```typescript
// src/adapters/controllers/candidate.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { UpsertCandidateProfileUseCase } from '../../application/use-cases/candidate/upsert-candidate-profile.use-case'
import { GetCandidateProfileUseCase } from '../../application/use-cases/candidate/get-candidate-profile.use-case'
import { CandidateRepository } from '../repositories/candidate.repository'
import { DomainError } from '../../application/errors/domain.error'

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
  // getProfile follows same pattern
}
```

### Candidate Route File
[VERIFIED: derived from Phase 10 auth.routes.ts pattern + candidate.routes.ts structure]

```typescript
// src/infrastructure/http/routes/candidate.routes.ts
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

### Admin Route File (opts pattern)
[VERIFIED: derived from current admin.routes.ts opts pattern + Phase 10 auth.routes.ts]

```typescript
// src/infrastructure/http/routes/admin.routes.ts
import { FastifyInstance } from 'fastify'
import { AdminController } from '../../../adapters/controllers/admin.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export async function adminRoutes(
  app: FastifyInstance,
  opts: { creditService: ICreditGrantPort }
): Promise<void> {
  const ctrl = new AdminController(opts.creditService)

  app.get('/users', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.listUsers.bind(ctrl))
  app.get('/users/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.getUserById.bind(ctrl))
  app.patch('/companies/:id/credits', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.adjustCredits.bind(ctrl))
  app.get('/companies/:id/transactions', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.getTransactions.bind(ctrl))
}
```

---

## Architectural Responsibility Map — Admin Module Special Case

The admin module has a unique dependency structure that differs from the other four modules:

```
src/infrastructure/http/routes/admin.routes.ts
     | (receives creditService via opts; passes to controller)
     v
src/adapters/controllers/admin.controller.ts
     | (injects IUserRepository, ICompanyRepository, ICreditGrantPort per handler)
     |
     +---> ListUsersUseCase(IUserRepository)
     +---> GetUserByIdUseCase(IUserRepository)
     +---> AdjustAdminCreditsUseCase(ICreditGrantPort) ← CreditService from src/modules/credits/ (Phase 12)
     +---> GetTransactionsUseCase(ICompanyRepository)
```

The `ICreditGrantPort` is satisfied by `CreditService` from `src/modules/credits/credits.service.ts` — this module is NOT migrated in Phase 11. The composition root in `app.ts` continues to instantiate `CreditService` from the old location and passes it as `creditService` opts. This is the same additive-migration pattern used throughout — old module files stay until Phase 13.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest + Supertest |
| Config file | `jest.config.ts` |
| Quick run (module-specific) | `npm run test:integration -- --testPathPattern=candidate` |
| Full suite | `npm run test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-03 | CandidateRepository tested against real DB | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=candidate` | Yes — `tests/integration/candidate.test.ts` |
| TEST-03 | CompanyRepository tested against real DB | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=company` | Yes — `tests/integration/company.test.ts` |
| TEST-03 | RecruiterRepository tested against real DB | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=recruiter` | Yes — `tests/integration/recruiter.test.ts` |
| TEST-03 | JobRepository tested against real DB | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=job` | Yes — `tests/integration/job.test.ts` |
| TEST-03 | Admin use cases tested against real DB | Integration (via buildApp) | `npm run test:integration -- --testPathPattern=admin` | Yes — `tests/integration/admin.test.ts` |
| SC-5 | All 134 existing tests remain green | Integration (full suite) | `npm run test:integration` | All exist |

### Sampling Rate
- **Per module commit:** `npm run test:integration -- --testPathPattern=<module>`
- **Per wave merge:** `npm run test:integration` (full 134-test suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing integration tests in `tests/integration/` cover all five modules. No new test files are needed for Phase 11. The tests exercise repository implementations end-to-end via `buildApp()` + real Docker DB (TEST-03 satisfaction by definition of the test harness).

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. Docker Compose + PostgreSQL + Neo4j are already operational from prior phases. All five modules use only Prisma (PostgreSQL) and no Neo4j calls.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authenticate` hook via `requireRole` preHandler on all protected routes |
| V3 Session Management | no | Session management is auth module concern (Phase 10) |
| V4 Access Control | yes | `requireRole('ADMIN')` / `requireRole('CANDIDATE')` / `requireRole('RECRUITER')` on all write endpoints |
| V5 Input Validation | yes | Zod in controllers — all endpoints validated |
| V6 Cryptography | no | No password hashing or token generation in these modules |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on job update/deactivate | Elevation of Privilege | Ownership check: `job.recruiterId !== profile.id` → DomainError FORBIDDEN in UpdateJobUseCase |
| Negative credit balance | Tampering | `prisma.$transaction` atomic guard in CompanyRepository.adjustCredits |
| Admin reading sensitive user fields | Information Disclosure | `select` clause in UserRepository.findMany excludes `passwordHash` and `googleId` |
| Admin querying any company transactions | Elevation of Privilege | Admin role trusted disposition — all `/admin/*` routes gated by `requireRole('ADMIN')` |
| SQL injection via any input field | Tampering | Prisma ORM parameterized queries — no raw SQL string interpolation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 134 integration tests is the correct baseline count (from Phase 10 Summary 04) | All test counts | If wrong, phase gate passes/fails at wrong threshold — verify by running `npm run test:integration` before starting |
| A2 | `IUserRepository.findMany` can safely be added as a new method without breaking existing callers | Admin Q1/Q7 | If UserRepository has other callers that would break, interface extension fails — low risk since IUserRepository is only used in new adapter code so far |
| A3 | `ICompanyRepository.getTransactions` addition does not break existing compilers | Admin Q1 | CompanyRepository adapter is newly created in Phase 11; no existing callers — low risk |
| A4 | `prisma.$transaction` inside CompanyRepository adapter is safe to use even though adapters should not contain business logic | Company Q6 | The transaction is purely an infrastructure concern (atomicity), not a business rule — accepted pattern from CLAUDE.md "Atomic transactions" requirement |

---

## Open Questions (RESOLVED)

1. **Should `adjustCredits` in CompanyRepository throw DomainError or AppError?**
   - What we know: errorHandler handles both; AppError is the current pattern in modules; DomainError is the new pattern for adapters.
   - What's unclear: The transaction-internal throw is inside an adapter — technically the adapter layer can throw DomainError.
   - Recommendation: Use DomainError to maintain consistency with Phase 10 patterns. The code path is: Prisma transaction throws → propagates out of repo → errorHandler catches DomainError.
   - **RESOLVED: Use `DomainError(message, code, statusCode)` in CompanyRepository.adjustCredits for consistency with Phase 10 adapter patterns.**

2. **Does `UserRepository.findById` return `User` or `UserPublic` for admin use?**
   - What we know: `getUserById` must not return passwordHash/googleId; the existing `findById` returns the full User entity.
   - What's unclear: Should the use case strip sensitive fields, or should `findMany`/`findById` have separate `findManyPublic` methods?
   - Recommendation: Add a separate `findManyPublic` method (or `findMany` that uses select projection) to IUserRepository. `findById` keeps returning full `User` (needed by auth). The `GetUserByIdUseCase` for admin uses a separate `findByIdPublic` method, OR the admin use case strips fields before returning. The simplest: add `findManyPublic` and `findByIdPublic` methods to IUserRepository that return `UserPublic` using Prisma's select projection. `GetUserByIdUseCase` calls `findByIdPublic`.
   - **RESOLVED: Add separate `findManyPublic` and `findByIdPublic` methods to `IUserRepository` that return `UserPublic` via Prisma `select` projection excluding `passwordHash` and `googleId`. `findById` keeps returning full `User` for auth use cases.**

---

## Sources

### Primary (HIGH confidence — all verified by reading actual source files)
- `src/modules/candidate/candidate.service.ts`, `candidate.repository.ts`, `candidate.routes.ts` — current candidate logic
- `src/modules/company/company.service.ts`, `company.repository.ts`, `company.routes.ts` — current company logic + $transaction pattern
- `src/modules/recruiter/recruiter.service.ts`, `recruiter.repository.ts`, `recruiter.routes.ts` — current recruiter logic + module isolation pattern
- `src/modules/job/job.service.ts`, `job.repository.ts`, `job.routes.ts`, `job.scheduler.ts` — current job logic + RankingItem export + scheduler dependency
- `src/modules/admin/admin.service.ts`, `admin.routes.ts` — current admin logic + ICreditService injection pattern
- `src/domain/interfaces/candidate.repository.interface.ts`, `company.repository.interface.ts`, `recruiter.repository.interface.ts`, `job.repository.interface.ts` — Phase 9 output (the contracts to implement)
- `src/domain/entities/candidate.entity.ts`, `company.entity.ts`, `recruiter.entity.ts`, `job.entity.ts` — Phase 9 output (toDomain target shapes)
- `src/adapters/controllers/auth.controller.ts` — Phase 10 controller pattern (template)
- `src/infrastructure/http/routes/auth.routes.ts` — Phase 10 route pattern (template)
- `src/adapters/repositories/user.repository.ts` — Phase 10 repository pattern (toDomain, import paths)
- `src/shared/errors/errorHandler.ts` — current error handling chain (DomainError first)
- `src/shared/errors/AppError.ts` — AppError shape
- `src/shared/hooks/requireRole.ts` — preHandler import source
- `src/infrastructure/http/plugins/authenticate.hook.ts` — Phase 10 authenticate hook (import path for routes)
- `src/app.ts` — composition root showing current wiring and opts patterns
- `tests/integration/*.test.ts` (candidate, company, recruiter, job, admin) — test expectations to preserve
- `plan-architecture.md` — canonical architecture reference, file naming conventions
- `.planning/phases/10-infrastructure-auth-migration/10-PATTERNS.md` — Phase 10 detailed pattern map
- `.planning/phases/10-infrastructure-auth-migration/10-04-SUMMARY.md` — confirmed Phase 10 completion, 134 test baseline

---

## Metadata

**Confidence breakdown:**
- Repository implementations (candidate, company, recruiter, job): HIGH — source files read directly; toDomain fields verified against domain entities
- Admin module special cases (findMany, getTransactions additions): HIGH — interfaces read; admin.service.ts current behavior traced
- Use-case design: HIGH — directly derived from existing service methods; no new logic invented
- scheduler.plugin.ts import update: HIGH — path verified from file locations
- RankingItem continuity: HIGH — import chain traced through swipe.routes.ts
- Test preservation: HIGH — tests use buildApp() + Supertest; only app.ts import changes per module

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable refactor; no external API changes expected)
