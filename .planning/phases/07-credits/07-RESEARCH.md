# Phase 7: Credits - Research

**Researched:** 2026-05-02
**Domain:** Credit unlock flow — atomic transactions, Prisma schema migration, module architecture, ranking integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `Unlock` Prisma model — fields: `id`, `companyId`, `candidateId`, `jobId`, `unlockedAt`, `creditsCost` (Int). Constraint: `@@unique([companyId, candidateId, jobId])`.
- **D-02:** Unlock is scoped per-job: unlocking candidate X on job A does NOT reveal candidate X on job B.
- **D-03:** Double-unlock returns **409 `ALREADY_UNLOCKED`**. Credits are NOT charged again.
- **D-04:** `POST /jobs/:jobId/candidates/:candidateId/unlock` — RECRUITER only. Ownership check: recruiter must be `job.recruiterId`.
- **D-05:** On success, returns full revealed candidate profile (name, avatarUrl, bio, skills, profession, modalities, salaryExpectation, distanceKm).
- **D-06:** Candidate targeted must have swiped `DISLIKE`. Attempting to unlock a LIKE candidate is an error (422 or 400 — Claude's discretion).
- **D-07:** `UNLOCK_COST_BY_PLAN = { FREE: 2, PRO: 1 }` in `src/modules/credits/credits.constants.ts`.
- **D-08:** `Company.plan` field already in schema (String, default `"FREE"`). No plan migration needed.
- **D-09:** Unknown plan value → fall back to `FREE` cost.
- **D-10:** Full unlock flow runs in a single `prisma.$transaction`: verify ownership → verify DISLIKE swipe → check credits >= cost → decrement credits → create Unlock record → create CreditTransaction.
- **D-11:** Insufficient credits → **402 `INSUFFICIENT_CREDITS`**.
- **D-12:** `CreditTransaction` model already handles audit log. `reason: 'candidate_unlock'` added for unlock debits.
- **D-13:** Audit log read endpoint → admin-only `GET /admin/companies/:id/transactions` (Claude's discretion for v1).
- **D-14:** `AdminService.adjustCredits` refactored to delegate to `CreditService`. Existing route URL and behavior preserved.

### Claude's Discretion

- Exact module directory: `src/modules/credits/` (recommended)
- Method names on CreditRepository and CreditService
- Error code for "candidate did not DISLIKE this job" case (422 or 400)
- Audit log read endpoint — admin-only vs. recruiter-readable for v1
- Whether `CreditTransaction` should gain optional `candidateId` + `jobId` fields for richer unlock audit records

### Deferred Ideas (OUT OF SCOPE)

- Credit purchase with payment (Stripe, etc.) — v2
- Monthly credit renewal by plan — v2
- Job posting limits by plan — separate phase
- Recruiter-readable audit log (`GET /credits/transactions`) — backlog v1.5
- `CreditTransaction` with `candidateId` + `jobId` — Claude's discretion; not required by CREDIT-03
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CREDIT-01 | Company can use credits to unlock a candidate profile that gave DISLIKE | D-04/D-10 unlock endpoint + atomic transaction |
| CREDIT-02 | Each unlock deducts credits from company balance | D-10 step 4: `credits: { decrement: cost }` inside $transaction |
| CREDIT-03 | Credit transactions are recorded (audit log) | D-12: existing CreditTransaction model, reason='candidate_unlock' |
| CREDIT-04 | Admin can add credits to a company | D-14: refactor AdminService to delegate to CreditService; route preserved |
| SEC-03 | Credit and swipe operations run in atomic transactions — prevents race conditions | D-10: single prisma.$transaction covering all 6 steps |
| ARCH-01 | Each module follows Clean Architecture — routes → service → repository | New credits module: credits.routes → credits.service → credits.repository |
| ARCH-04 | Modules must not import directly from other modules — communicate via interfaces | SwipeService update: must not import CreditRepository; query Unlock table via its own SwipeRepository method |
</phase_requirements>

---

## Summary

Phase 7 delivers the credit unlock flow that is the commercial heart of the platform: recruiters spend company credits to reveal the full profiles of DISLIKE candidates in the job ranking. The phase has three parts: (1) build the `credits` module from scratch, (2) refactor `AdminService.adjustCredits` to delegate to the new `CreditService`, and (3) update `SwipeService.getRanking` to reveal unlocked DISLIKE candidates.

The schema already provides most of what is needed: `Company.credits`, `Company.plan`, and `CreditTransaction` exist. The only schema addition required is the new `Unlock` model with a composite unique constraint. `CompanyService.adjustCredits` (in `company.service.ts`) is the reference implementation for the atomic pattern — the new `CreditService.unlockCandidate` follows the same `prisma.$transaction` structure but is more complex: it must verify job ownership, swipe direction, and credit sufficiency before writing any state.

The ranking update (`SwipeService.getRanking`) is the most architecturally sensitive change: it must consult the Unlock table without violating ARCH-04 (module isolation). The correct approach is to add a `findUnlocksByJobAndCompany` method to `SwipeRepository` (which is permitted to query any Prisma model directly) and pass the unlock set into the mapping logic to override `profile: null` for unlocked DISLIKE candidates. `SwipeService` never imports from `src/modules/credits/`.

**Primary recommendation:** Build `CreditService.unlockCandidate` as a pure function of a `CreditRepository` interface (mirroring how `SwipeService` takes `IRecommendationService`). This makes unit-testing trivial — mock the repository, assert the transaction steps are called in order.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Unlock candidate profile | API / Backend | — | Business logic + credit deduction; all server-side |
| Atomic credit deduction | Database / Storage | API / Backend | Enforced by Prisma $transaction on PostgreSQL |
| Audit log (CreditTransaction) | Database / Storage | API / Backend | Write in same transaction as credit deduction |
| Double-unlock prevention | Database / Storage | API / Backend | @@unique constraint on Unlock model is the primary guard; service catches P2002 as secondary |
| Reveal unlocked DISLIKE in ranking | API / Backend | Database / Storage | SwipeRepository queries Unlock table; SwipeService applies reveal logic |
| Admin credit grant | API / Backend | Database / Storage | CreditService.adjustCredits delegates write to CreditRepository |
| Route protection (RECRUITER role) | API / Backend | — | requireRole preHandler, same as Phase 5 ranking route |

---

## Standard Stack

### Core (all already installed)
[VERIFIED: package.json in repo]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | ^7.7.0 | ORM + $transaction API | Project standard; atomic writes via interactive transactions |
| `fastify` | ^5.8.5 | HTTP framework | Project standard |
| `zod` | ^4.3.6 | Input validation on all endpoints | SEC-02; project standard |
| `@fastify/jwt` | ^10.0.0 | JWT decode in `authenticate` preHandler | Project standard |

### No New Packages Required

Phase 7 requires zero new npm dependencies. All primitives (`prisma.$transaction`, `Prisma.PrismaClientKnownRequestError`, `AppError`, `authenticate`, `requireRole`) are already in the repo.

---

## Architecture Patterns

### System Architecture Diagram

```
POST /jobs/:jobId/candidates/:candidateId/unlock
        │
        ▼
[credits.routes.ts]
  authenticate + requireRole('RECRUITER')
  Zod param validation
        │
        ▼
[CreditService.unlockCandidate(userId, jobId, candidateId)]
        │
        ├─ CreditRepository.findRecruiterByUserId()  → RecruiterProfile
        ├─ CreditRepository.findJobById()            → Job (ownership check)
        ├─ CreditRepository.findSwipe()              → Swipe (DISLIKE check)
        ├─ CreditRepository.findExistingUnlock()     → Unlock? (409 guard)
        │
        └─ prisma.$transaction([
               tx.company.findUnique()          → credits >= cost? (402 guard)
               tx.company.update({decrement})   → new balance
               tx.unlock.create()               → Unlock record
               tx.creditTransaction.create()    → audit log
           ])
                │
                ▼
        Return: { unlock, candidate full profile, distanceKm }
                │
                ▼
[credits.routes.ts] → 201 { candidateId, profile, creditsCost, unlockedAt }


GET /jobs/:jobId/ranking  (existing — MODIFIED)
        │
        ▼
[swipe.routes.ts] → SwipeService.getRanking(userId, jobId)
        │
        ├─ SwipeRepository.findRecruiterProfileByUserId()
        ├─ SwipeRepository.findJobById()
        ├─ SwipeRepository.findSwipesByJobId()
        ├─ SwipeRepository.findUnlocksByJobAndCompany(jobId, companyId)  ← NEW
        │
        └─ map swipes:
               LIKE               → full profile (unchanged)
               DISLIKE + unlocked → full profile (NEW: override null)
               DISLIKE + locked   → profile: null (unchanged)


PATCH /admin/companies/:id/credits  (existing — REFACTORED)
        │
        ▼
[admin.routes.ts] → AdminService.adjustCredits()
        │  (delegates to)
        ▼
[CreditService.adjustCredits(companyId, amount, reason='admin_grant')]
        │
        └─ prisma.$transaction([
               tx.company.update({increment})
               tx.creditTransaction.create()
           ])
```

### Recommended Module Structure

```
src/modules/credits/
├── credits.routes.ts        # POST /jobs/:jobId/candidates/:candidateId/unlock
├── credits.service.ts       # CreditService — unlockCandidate, adjustCredits
├── credits.repository.ts    # CreditRepository — all DB reads/writes for credits domain
└── credits.constants.ts     # UNLOCK_COST_BY_PLAN

src/shared/interfaces/
└── (no new interface needed — CreditService is injected directly in routes)

prisma/migrations/
└── YYYYMMDDHHMMSS_add_unlock_model/
    └── migration.sql
```

### Pattern 1: Atomic Unlock Transaction

**What:** All 4 writes (credit deduct + Unlock record + CreditTransaction + reads) happen atomically in a single `prisma.$transaction`.
**When to use:** Any operation that modifies credits must use this pattern.

```typescript
// Source: [VERIFIED: CompanyService.adjustCredits in company.service.ts — existing pattern adapted]
// VERIFIED: Prisma interactive transactions documented at prisma.io/docs/orm/prisma-client/queries/transactions
async unlockCandidate(userId: string, jobId: string, candidateId: string) {
  // --- Pre-transaction reads (cheap checks before acquiring locks) ---
  const recruiter = await this.repo.findRecruiterByUserId(userId)
  if (!recruiter) throw new AppError('Forbidden', 403, 'FORBIDDEN')

  const job = await this.repo.findJobById(jobId)
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
  if (job.recruiterId !== recruiter.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')

  const swipe = await this.repo.findSwipe(candidateId, jobId)
  if (!swipe) throw new AppError('Candidate did not swipe on this job', 422, 'CANDIDATE_NOT_FOUND')
  if (swipe.direction !== 'DISLIKE') throw new AppError('Candidate is already visible', 422, 'CANDIDATE_ALREADY_VISIBLE')

  const existing = await this.repo.findUnlock(recruiter.companyId, candidateId, jobId)
  if (existing) throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')

  // --- Atomic transaction ---
  const cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: recruiter.companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    if (company.credits < cost) throw new AppError('Insufficient credits', 402, 'INSUFFICIENT_CREDITS')

    await tx.company.update({
      where: { id: recruiter.companyId },
      data: { credits: { decrement: cost } },
    })
    const unlock = await tx.unlock.create({
      data: { companyId: recruiter.companyId, candidateId, jobId, creditsCost: cost },
    })
    await tx.creditTransaction.create({
      data: { companyId: recruiter.companyId, amount: -cost, reason: 'candidate_unlock' },
    })
    return unlock
  })
}
```

### Pattern 2: Ranking Reveal for Unlocked Candidates

**What:** `SwipeRepository` gains a `findUnlocksByJobAndCompany` method so `SwipeService` can check unlock status without crossing module boundaries.
**When to use:** Any time the ranking needs to know the unlock state for a specific company+job combination.

```typescript
// In SwipeRepository (swipe.repository.ts) — ARCH-04 compliant: no import from credits module
async findUnlocksByJobAndCompany(jobId: string, companyId: string): Promise<Set<string>> {
  const unlocks = await prisma.unlock.findMany({
    where: { jobId, companyId },
    select: { candidateId: true },
  })
  return new Set(unlocks.map(u => u.candidateId))
}

// In SwipeService.getRanking — updated mapping:
const unlockedCandidateIds = await this.repo.findUnlocksByJobAndCompany(jobId, recruiterProfile.companyId)

// In the map callback:
profile:
  swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
    ? { /* full profile */ }
    : null,
```

**ARCH-04 compliance:** `SwipeRepository` queries `prisma.unlock` directly — this is allowed because repositories are the DB-access layer and may query any table. `SwipeService` never imports from `src/modules/credits/`.

### Pattern 3: Admin Delegation to CreditService

**What:** `AdminService.adjustCredits` is refactored to call `CreditService.adjustCredits` instead of containing its own $transaction.
**When to use:** Any admin operation on credits.

```typescript
// admin.service.ts — after refactor
import { CreditService } from '../credits/credits.service'

export class AdminService {
  constructor(private readonly creditService: CreditService) {}

  async adjustCredits(companyId: string, amount: number) {
    return this.creditService.adjustCredits(companyId, amount, 'admin_grant')
  }
}
```

**Note:** `AdminService` imports `CreditService` — this is a module-to-module import. Per ARCH-04, modules must not import directly from each other. The correct ARCH-04-compliant approach is to inject `CreditService` as a dependency at the route level in `admin.routes.ts`, not to have `AdminService` construct or import it directly. `AdminService` should accept `CreditService` as a constructor parameter typed via an interface `ICreditService`. This keeps AdminService testable without constructing CreditService.

### Anti-Patterns to Avoid

- **Trusting candidateId from request params without verifying the Swipe record:** Always load the Swipe by (candidateId, jobId) from DB before proceeding — never assume the candidate actually swiped on that job.
- **Putting the balance check outside the transaction:** Reading `company.credits` before starting the transaction creates a TOCTOU race condition. The `findUnique` for credit check must be INSIDE the `$transaction` callback.
- **Skipping the double-unlock check before the transaction:** The `@@unique` constraint handles the race at the DB level via P2002, but the service should also check `findUnlock()` first to return the proper 409 error code rather than letting P2002 bubble up generically.
- **SwipeService importing CreditService or CreditRepository:** Violates ARCH-04. Use `SwipeRepository.findUnlocksByJobAndCompany` instead.
- **Importing `CompanyRepository` inside CreditRepository:** Each repository is self-contained. `CreditRepository` queries `prisma.company` directly via `prisma.$transaction` — it does not delegate to `CompanyRepository`.

---

## Current State Analysis

### What Already Exists (no changes needed)

[VERIFIED: prisma/schema.prisma]

| Asset | Location | State |
|-------|----------|-------|
| `Company.credits` (Int) | schema.prisma | Exists, default 0 |
| `Company.plan` (String) | schema.prisma | Exists, default "FREE" |
| `CreditTransaction` model | schema.prisma | Exists with `companyId`, `amount`, `reason`, `createdAt` |
| `ChatInitiator.CREDIT` enum value | schema.prisma | Exists — Phase 8 hook is pre-wired |
| `CompanyService.adjustCredits` | company.service.ts | Atomic pattern reference — copy and adapt |
| `AdminService.adjustCredits` | admin.service.ts | Exists — needs refactoring to delegate |
| `PATCH /admin/companies/:id/credits` | admin.routes.ts | Exists — URL preserved, no behavior change |
| `authenticate` + `requireRole` preHandlers | shared/hooks/ | Exists — reuse as-is |
| `AppError` | shared/errors/ | Exists — `new AppError(msg, code, errorCode)` |
| `createSwipe` factory | tests/helpers/factories.ts | Exists — accepts `direction` override |
| `createCompany` factory | tests/helpers/factories.ts | Exists — accepts `plan` and `credits` overrides |

### Key Observation: CompanyService vs AdminService Divergence

[VERIFIED: company.service.ts + admin.service.ts]

`CompanyService.adjustCredits` has a balance check (`credits + delta < 0`). `AdminService.adjustCredits` does NOT — admin grants are always positive (Zod schema enforces `z.number().int().positive()`). After refactoring, `CreditService.adjustCredits` should accept a `requirePositiveBalance` flag, OR the admin route simply calls `CreditService.adjustCredits` without balance check since admin grants never go negative. The cleanest approach: `CreditService` exposes two separate methods — `grantCredits(companyId, amount, reason)` (no balance check, admin-only) and `unlockCandidate(...)` (balance check, atomic). This avoids a flag parameter.

### What Needs to Be Built

| Item | File(s) | Status |
|------|---------|--------|
| `Unlock` Prisma model + migration | `prisma/schema.prisma` + migration | Missing |
| `credits.constants.ts` | `src/modules/credits/credits.constants.ts` | Missing |
| `CreditRepository` | `src/modules/credits/credits.repository.ts` | Missing |
| `CreditService` | `src/modules/credits/credits.service.ts` | Missing |
| `creditsRoutes` (unlock endpoint) | `src/modules/credits/credits.routes.ts` | Missing |
| Register `creditsRoutes` in app.ts | `src/app.ts` | Missing |
| Refactor `AdminService` | `src/modules/admin/admin.service.ts` | Needs delegation |
| Update `admin.routes.ts` | `src/modules/admin/admin.routes.ts` | Inject CreditService |
| `SwipeRepository.findUnlocksByJobAndCompany` | `src/modules/swipe/swipe.repository.ts` | Missing |
| `SwipeService.getRanking` — unlock reveal | `src/modules/swipe/swipe.service.ts` | Needs update |
| `createUnlock` test factory | `tests/helpers/factories.ts` | Missing |
| Cleanup in `tests/helpers/setup.ts` | `tests/helpers/setup.ts` | Add `prisma.unlock.deleteMany()` |
| Unit tests for CreditService | `tests/unit/credit.service.test.ts` | Missing |
| Integration tests for unlock flow | `tests/integration/credits.test.ts` | Missing |
| Integration tests for updated ranking | `tests/integration/swipe.test.ts` | Needs new cases |
| Integration tests for admin refactor | `tests/integration/admin.test.ts` | Existing tests must still pass |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Double-unlock prevention at DB level | Custom lock table / application-level mutex | `@@unique([companyId, candidateId, jobId])` on Unlock model | Unique constraint is atomic at DB level; handles concurrent requests |
| Race condition on concurrent credit deductions | Optimistic locking, version columns | `prisma.$transaction` interactive transactions (PostgreSQL serializable) | Transaction with credit re-read inside guarantees consistency |
| Error mapping for Prisma constraint violations | Custom error message parsing | `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'` | Already established pattern in `swipe.service.ts` |
| Input validation | Custom parsing logic | `zod` with `.uuid()` on all ID params | Already project standard |

**Key insight:** The entire concurrency story for Phase 7 is handled by two things: the `@@unique` constraint (prevents double-writes at DB level) and `prisma.$transaction` with a re-read of the credit balance inside the callback (prevents race on balance deduction). No application-level locking is needed.

---

## Runtime State Inventory

> Phase 7 is a greenfield module addition, not a rename/refactor. However, the `setup.ts` teardown list must be updated.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `CreditTransaction` records — only `admin_grant` reason exists today | Code edit: add `reason: 'candidate_unlock'` for unlock debits |
| Live service config | None — no external service config references credits | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env vars required | None |
| Build artifacts | `prisma.unlock` table does not exist yet | New migration required before any test run |

---

## Integration Concerns

### 1. Route Registration in app.ts

The unlock route lives at `POST /jobs/:jobId/candidates/:candidateId/unlock`. It should be registered under the `/jobs` prefix to match this URL structure, following the same pattern as `swipeJobRoutes`:

```typescript
// In src/app.ts — add:
import { creditsJobRoutes } from './modules/credits/credits.routes'
await app.register(creditsJobRoutes, { prefix: '/jobs' })
```

This means `credits.routes.ts` exports a function `creditsJobRoutes(app)` that registers `/:jobId/candidates/:candidateId/unlock`.

**Important ordering concern:** The existing `jobRoutes` registers `/:id` as a parameterized route. Fastify handles nested parameterized paths correctly since the paths are structurally distinct (`:id` vs `:jobId/candidates/:candidateId/unlock`), but registration order should put static segments before deeply parameterized ones. Register `creditsJobRoutes` AFTER `swipeJobRoutes` to be safe.

### 2. Ranking Endpoint: companyId Access

`SwipeService.getRanking` currently has access to `recruiterProfile.companyId` (the `RecruiterProfile` model has `companyId`). [VERIFIED: prisma/schema.prisma line 86-89] The `findRecruiterProfileByUserId` call in `SwipeRepository` already returns the full profile including `companyId`. The `findUnlocksByJobAndCompany(jobId, companyId)` call can be made immediately after fetching the recruiter profile — no schema change needed.

### 3. Phase 8 Chat Hook Context

`CreditService.unlockCandidate` should return enough context for Phase 8 to create a Chat automatically. The unlock service return shape should include `{ companyId, candidateId, jobId, unlockedAt, creditsCost }`. Phase 7 does NOT create the Chat — it only returns this context. Phase 8 will hook into the unlock endpoint response or call a separate method. The unlock route handler in `credits.routes.ts` can be written to log or attach this context for future use without implementing chat creation.

### 4. tests/helpers/setup.ts Teardown Order

The `afterEach` in `setup.ts` must be updated to delete `Unlock` records before `Job` and `Company` deletions (FK dependencies). [VERIFIED: setup.ts lines 17-29]

The `Unlock` model references `Company`, `CandidateProfile`, and `Job` via foreign keys. Insert it in the teardown before those parents:

```typescript
await prisma.unlock.deleteMany()         // before job, company, candidateProfile
await prisma.creditTransaction.deleteMany()
await prisma.job.deleteMany()
// ... rest unchanged
```

---

## Common Pitfalls

### Pitfall 1: Credit Check Outside the Transaction (TOCTOU Race)

**What goes wrong:** Reading `company.credits` before opening `prisma.$transaction`, checking if credits are sufficient, then doing the deduction inside a separate transaction. Two concurrent requests both pass the pre-transaction check, both enter their own transactions, both deduct — balance goes negative.

**Why it happens:** The pre-transaction read and the write are not atomic.

**How to avoid:** The `company.findUnique()` for the balance check MUST be the first operation INSIDE the `prisma.$transaction` callback. See Pattern 1 above.

**Warning signs:** Balance check in service method body before `prisma.$transaction(async (tx) => {`.

### Pitfall 2: Not Catching P2002 for Double-Unlock Race

**What goes wrong:** Two concurrent unlock requests both pass the `findUnlock()` pre-check, both enter the transaction, one creates the Unlock record, the other hits a unique constraint violation (P2002) and returns a 500 instead of 409.

**Why it happens:** The `findUnlock()` pre-check + `tx.unlock.create()` are not atomic as a unit.

**How to avoid:** Catch `Prisma.PrismaClientKnownRequestError` with `err.code === 'P2002'` around the entire `$transaction` call and convert to `AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')`. The pre-check handles the common case; the P2002 catch handles the race case.

**Warning signs:** `tx.unlock.create()` not wrapped in a try-catch for P2002.

### Pitfall 3: Module Isolation Violation in getRanking Update

**What goes wrong:** `SwipeService.getRanking` imports `CreditRepository` or `prisma.unlock` directly to check unlock status.

**Why it happens:** Easiest way to add the unlock check is to add a direct import.

**How to avoid:** Add `findUnlocksByJobAndCompany` to `SwipeRepository`. `SwipeService` calls `this.repo.findUnlocksByJobAndCompany(...)` — it stays decoupled from the credits module. ARCH-04 is maintained.

### Pitfall 4: Forgetting to Update Existing Ranking Unit Tests

**What goes wrong:** `SwipeService.getRanking` signature changes (adds unlock Set parameter or repo call), breaking existing unit tests in `swipe.service.test.ts`.

**Why it happens:** The existing `makeRepo()` mock does not include `findUnlocksByJobAndCompany`.

**How to avoid:** Update `makeRepo()` in `swipe.service.test.ts` to add `findUnlocksByJobAndCompany: jest.fn()` defaulting to `Promise.resolve(new Set())`. All existing tests remain valid — empty unlock set means no behavior change for LIKE/DISLIKE tests.

### Pitfall 5: DISLIKE Candidate Attempting to Unlock a LIKE Candidate

**What goes wrong:** Service returns an obscure error or processes the unlock for a LIKE candidate, spending credits on someone already visible.

**Why it happens:** No check on `swipe.direction` before proceeding to the transaction.

**How to avoid:** After fetching the Swipe record, assert `swipe.direction === 'DISLIKE'`. If `LIKE`, throw `AppError('Candidate is already visible', 422, 'CANDIDATE_ALREADY_VISIBLE')` — no credits charged.

### Pitfall 6: Returning Full Profile Without distanceKm in Unlock Response

**What goes wrong:** D-05 requires `distanceKm` in the unlock response, but the service builds the profile from the Swipe/CandidateProfile without computing distance.

**Why it happens:** `haversineKm` is currently private inside `swipe.service.ts`.

**How to avoid:** Move `haversineKm` to a shared utility (`src/shared/utils/haversine.ts`) or duplicate it in `credits.service.ts` (simpler for v1). The unlock response must compute `distanceKm` from candidate and job coordinates.

---

## Code Examples

### New Prisma Schema Addition

```prisma
// Source: [VERIFIED: existing Swipe @@unique pattern in prisma/schema.prisma]
model Unlock {
  id          String           @id @default(uuid())
  companyId   String
  company     Company          @relation(fields: [companyId], references: [id])
  candidateId String
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id])
  jobId       String
  job         Job              @relation(fields: [jobId], references: [id])
  unlockedAt  DateTime         @default(now())
  creditsCost Int

  @@unique([companyId, candidateId, jobId])
}
```

Back-references must also be added to the related models:
```prisma
// On Company: unlocks  Unlock[]
// On CandidateProfile: unlocks  Unlock[]
// On Job: unlocks  Unlock[]
```

### Credits Constants

```typescript
// src/modules/credits/credits.constants.ts
export const UNLOCK_COST_BY_PLAN: Record<string, number> = {
  FREE: 2,
  PRO: 1,
}
```

### CreditRepository Interface for ARCH-04

```typescript
// src/modules/credits/credits.repository.ts
import { prisma } from '../../shared/db/prisma'
import { Prisma } from '@prisma/client'

export class CreditRepository {
  async findRecruiterByUserId(userId: string) {
    return prisma.recruiterProfile.findUnique({
      where: { userId },
      include: { company: { select: { id: true, plan: true, credits: true } } },
    })
  }

  async findJobById(id: string) {
    return prisma.job.findUnique({ where: { id } })
  }

  async findSwipe(candidateId: string, jobId: string) {
    return prisma.swipe.findUnique({ where: { candidateId_jobId: { candidateId, jobId } } })
  }

  async findUnlock(companyId: string, candidateId: string, jobId: string) {
    return prisma.unlock.findUnique({
      where: { companyId_candidateId_jobId: { companyId, candidateId, jobId } },
    })
  }

  async findCandidateProfileById(id: string) {
    return prisma.candidateProfile.findUnique({
      where: { id },
      include: { user: { select: { avatarUrl: true } } },
    })
  }

  async executeUnlock(
    companyId: string,
    candidateId: string,
    jobId: string,
    creditsCost: number,
  ) {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new Error('Company not found')  // wrapped by service into AppError
      if (company.credits < creditsCost) throw new Error('INSUFFICIENT_CREDITS')

      await tx.company.update({
        where: { id: companyId },
        data: { credits: { decrement: creditsCost } },
      })
      const unlock = await tx.unlock.create({
        data: { companyId, candidateId, jobId, creditsCost },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount: -creditsCost, reason: 'candidate_unlock' },
      })
      return unlock
    })
  }
}
```

### Test Factory Addition

```typescript
// Append to tests/helpers/factories.ts
export async function createUnlock(
  companyId: string,
  candidateId: string,
  jobId: string,
  overrides: Partial<{ creditsCost: number }> = {}
) {
  return prisma.unlock.create({
    data: {
      companyId,
      candidateId,
      jobId,
      creditsCost: overrides.creditsCost ?? 2,
    },
  })
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 + Supertest 7 |
| Config file | `jest.config.js` (root) |
| Quick run command | `npm test -- --testPathPattern=credits` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CREDIT-01 | POST /jobs/:jobId/candidates/:candidateId/unlock returns 201 + full profile | Integration | `npm run test:integration -- --testPathPattern=credits` | Wave 0 |
| CREDIT-01 | 403 when non-recruiter attempts unlock | Integration | same | Wave 0 |
| CREDIT-01 | 403 when recruiter doesn't own the job | Integration | same | Wave 0 |
| CREDIT-01 | 422 when candidate swiped LIKE (already visible) | Integration | same | Wave 0 |
| CREDIT-01 | 404 when candidate has no swipe on this job | Integration | same | Wave 0 |
| CREDIT-02 | Company.credits decremented after unlock | Integration | same | Wave 0 |
| CREDIT-02 | CreditService.unlockCandidate deducts correct cost per plan (FREE=2, PRO=1) | Unit | `npm run test:unit -- --testPathPattern=credit.service` | Wave 0 |
| CREDIT-03 | CreditTransaction record created with amount=-cost, reason='candidate_unlock' | Integration | same | Wave 0 |
| CREDIT-04 | PATCH /admin/companies/:id/credits still works after refactor (regression) | Integration | `npm run test:integration -- --testPathPattern=admin` | Exists |
| SEC-03 | Concurrent unlock requests do not produce negative balance or double-unlock | Integration | same | Wave 0 |
| SEC-03 | 409 ALREADY_UNLOCKED on second unlock attempt | Integration | same | Wave 0 |
| SEC-03 | 402 INSUFFICIENT_CREDITS when balance < cost | Integration | same | Wave 0 |
| ARCH-04 | SwipeService.getRanking reveals unlocked DISLIKE candidate (profile not null) | Integration | `npm run test:integration -- --testPathPattern=swipe` | Exists — needs new case |
| ARCH-04 | SwipeService.getRanking still censors un-unlocked DISLIKE candidate | Integration | same | Exists — regression |

### Sampling Rate

- **Per task commit:** `npm run test:unit -- --testPathPattern=credit.service`
- **Per wave merge:** `npm test -- --testPathPattern="credits|swipe|admin"`
- **Phase gate:** Full `npm test` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/credit.service.test.ts` — covers CREDIT-01, CREDIT-02, SEC-03 unit-level
- [ ] `tests/integration/credits.test.ts` — covers CREDIT-01 through CREDIT-03, SEC-03 integration
- [ ] `tests/helpers/factories.ts` — append `createUnlock` factory
- [ ] `tests/helpers/setup.ts` — add `await prisma.unlock.deleteMany()` before job/company cleanup
- [ ] `prisma/schema.prisma` — add `Unlock` model + back-references + run migration

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authenticate` preHandler (JWT decode) |
| V3 Session Management | no | JWT stateless; session handled in Phase 2 |
| V4 Access Control | yes | `requireRole('RECRUITER')` + job ownership check in service |
| V5 Input Validation | yes | Zod — `z.string().uuid()` on all ID params |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — recruiter unlocks a candidate on a job they don't own | Tampering | Service loads job by `jobId`, checks `job.recruiterId === recruiter.id` |
| IDOR — recruiter passes a fabricated `candidateId` not linked to a swipe | Tampering | Service verifies `swipe = findSwipe(candidateId, jobId)` — fabricated IDs return 404/422 |
| Race condition — two concurrent unlock requests both pass balance check | Tampering | Balance check is inside `$transaction`; PostgreSQL serializes conflicting writes |
| Race condition — two concurrent unlock requests both pass double-unlock check | Spoofing | `@@unique` constraint + P2002 catch converts to 409 |
| Negative credit balance | Tampering | `company.credits < cost` check inside $transaction before deducting |
| Admin impersonation on credit grant | Elevation of Privilege | `requireRole('ADMIN')` on `PATCH /admin/companies/:id/credits` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `haversineKm` should be extracted to a shared utility so CreditService can compute `distanceKm` for the unlock response | Integration Concerns §6 | Low — if not extracted, duplicate the 10-line function inside credits.service.ts |
| A2 | `CreditService` should expose two separate methods (`grantCredits` / `unlockCandidate`) rather than a single `adjustCredits` with a flag | Current State Analysis | Low — a flag works too; two methods is cleaner |
| A3 | The unlock route is registered under `/jobs` prefix (i.e., app.ts registers with `prefix: '/jobs'`) | Integration Concerns §1 | Low — only affects the prefix choice; behavior is the same |

---

## Open Questions (RESOLVED)

1. **Should `CreditTransaction` record `candidateId` and `jobId` for unlock debits?**
   - What we know: CREDIT-03 only requires "transactions are recorded". The existing schema has no `candidateId`/`jobId` on `CreditTransaction`.
   - What's unclear: Whether adding these optional fields is worth a schema migration.
   - RESOLVED: Omit for v1 (the `Unlock` record already provides that trace). Add as backlog item per CONTEXT.md deferred section. Plans do NOT add these fields.

2. **What HTTP status code for "candidate swiped LIKE, already visible"?**
   - What we know: D-06 defers to Claude's discretion between 422 and 400.
   - RESOLVED: Use **422 Unprocessable Entity** with code `CANDIDATE_ALREADY_VISIBLE`. 422 semantically means "valid request, but the operation cannot be performed in current state". Implemented in 07-01 and 07-02 plans.

3. **Should `GET /admin/companies/:id/transactions` be implemented in Phase 7?**
   - What we know: D-13 designates this as Claude's discretion for v1.
   - RESOLVED: Implement in Phase 7 plan `07-03` as `prisma.creditTransaction.findMany({ where: { companyId: id } })` alongside the admin refactor. Rounds out CREDIT-03 audit log usefulness at low cost.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 7 requires no new external dependencies. All tools (Node.js 20, Prisma, PostgreSQL, Jest) are confirmed present from Phases 1-6.

---

## Sources

### Primary (HIGH confidence)

- `[VERIFIED: prisma/schema.prisma]` — Company, CreditTransaction, Chat, Swipe, Job, RecruiterProfile models confirmed
- `[VERIFIED: src/modules/company/company.service.ts]` — atomic $transaction pattern confirmed
- `[VERIFIED: src/modules/admin/admin.service.ts]` — current adjustCredits without balance check confirmed
- `[VERIFIED: src/modules/swipe/swipe.service.ts]` — getRanking ownership check and DISLIKE censoring pattern confirmed
- `[VERIFIED: src/modules/swipe/swipe.repository.ts]` — findRecruiterProfileByUserId returns companyId via relation confirmed
- `[VERIFIED: tests/helpers/factories.ts]` — createSwipe, createCompany (with plan/credits) confirmed; createUnlock missing confirmed
- `[VERIFIED: tests/helpers/setup.ts]` — teardown order and missing unlock.deleteMany confirmed
- `[VERIFIED: src/app.ts]` — plugin registration pattern confirmed; swipeJobRoutes prefix '/jobs' confirmed
- `[VERIFIED: package.json]` — Jest 30, Supertest 7, Prisma 7, Zod 4, Fastify 5 confirmed

### Secondary (MEDIUM confidence)

- `[ASSUMED]` — Prisma interactive transactions with `$transaction(async (tx) => {})` pattern is correct for PostgreSQL concurrency control (established pattern in codebase, not re-verified against Prisma 7 docs)

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — verified from package.json and codebase
- Architecture: HIGH — verified from existing module structure and established patterns
- Pitfalls: HIGH — derived from direct code inspection of existing transaction patterns and ARCH-04 constraints
- Test strategy: HIGH — existing test structure is clear and consistent

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable stack — Prisma, Fastify, Jest versions pinned in package.json)
