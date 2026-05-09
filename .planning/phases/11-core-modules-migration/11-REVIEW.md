---
phase: 11-core-modules-migration
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - src/adapters/controllers/admin.controller.ts
  - src/adapters/controllers/candidate.controller.ts
  - src/adapters/controllers/company.controller.ts
  - src/adapters/controllers/job.controller.ts
  - src/adapters/controllers/recruiter.controller.ts
  - src/adapters/repositories/candidate.repository.ts
  - src/adapters/repositories/company.repository.ts
  - src/adapters/repositories/job.repository.ts
  - src/adapters/repositories/recruiter.repository.ts
  - src/adapters/repositories/user.repository.ts
  - src/app.ts
  - src/application/use-cases/admin/adjust-admin-credits.use-case.ts
  - src/application/use-cases/admin/get-transactions.use-case.ts
  - src/application/use-cases/admin/get-user-by-id.use-case.ts
  - src/application/use-cases/admin/list-users.use-case.ts
  - src/application/use-cases/candidate/get-candidate-profile.use-case.ts
  - src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts
  - src/application/use-cases/company/adjust-company-credits.use-case.ts
  - src/application/use-cases/company/create-company.use-case.ts
  - src/application/use-cases/company/get-company.use-case.ts
  - src/application/use-cases/job/create-job.use-case.ts
  - src/application/use-cases/job/deactivate-job.use-case.ts
  - src/application/use-cases/job/get-job-by-id.use-case.ts
  - src/application/use-cases/job/list-jobs-by-recruiter.use-case.ts
  - src/application/use-cases/job/update-job.use-case.ts
  - src/application/use-cases/recruiter/get-recruiter-profile.use-case.ts
  - src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts
  - src/domain/interfaces/company.repository.interface.ts
  - src/domain/interfaces/user.repository.interface.ts
  - src/infrastructure/http/plugins/scheduler.plugin.ts
  - src/infrastructure/http/routes/admin.routes.ts
  - src/infrastructure/http/routes/candidate.routes.ts
  - src/infrastructure/http/routes/company.routes.ts
  - src/infrastructure/http/routes/job.routes.ts
  - src/infrastructure/http/routes/recruiter.routes.ts
  - src/infrastructure/scheduler/job-expiry.scheduler.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-05-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

The migration from the legacy `src/modules/` structure to Clean Architecture layers is largely well-executed. Layer boundaries are respected: routes never skip to repositories, use-cases receive repository interfaces via constructor injection, and sensitive fields (`passwordHash`, `googleId`) are correctly excluded from public projections via `UserPublic`. IDOR protection on job mutation (update/deactivate) is present and correct — ownership is checked against `job.recruiterId === profile.id` before any write.

Three specific problems require attention before this phase is considered production-ready:

1. **Critical** — The `company.controller.ts` path-parameter `id` is cast directly without Zod validation on both `getById` and `adjustCredits`. Any non-UUID string reaches the use-case and Prisma without format validation, which can produce unexpected Prisma errors instead of clean 400 responses.

2. **Warning** — Two separate HTTP routes (`PATCH /companies/admin/:id/credits` and `PATCH /admin/companies/:id/credits`) adjust company credits via different code paths with different behaviors: one goes through the transactional `CompanyRepository.adjustCredits`, the other through the legacy `CreditService`. This dual-path creates inconsistency and potential double-spending risk.

3. **Warning** — `upsert-recruiter-profile.use-case.ts` has a TOCTOU race between the company-existence check and the upsert write. A deleted company between those two operations causes a Prisma FK constraint error that is not wrapped in a `DomainError`.

---

## Critical Issues

### CR-01: Unvalidated path parameter `id` in CompanyController

**File:** `src/adapters/controllers/company.controller.ts:36` and `:52`

**Issue:** Both `getById` and `adjustCredits` extract the `:id` path parameter with a plain TypeScript cast (`request.params as { id: string }`) instead of parsing it through a Zod schema. This means any string — including non-UUID values — is forwarded to `CompanyRepository` and directly into a Prisma `findUnique`/`update` call. Prisma will throw an internal error on a malformed UUID instead of the application returning a clean 400. Every other controller in the codebase (`admin.controller.ts`, `job.controller.ts`) correctly uses `ParamIdSchema.parse(request.params)`.

**Fix:**
```typescript
// Add at the top of company.controller.ts alongside the other schemas
const CompanyParamsSchema = z.object({ id: z.string().uuid() })

// In getById (line 36):
async getById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = CompanyParamsSchema.parse(request.params)
  // ...rest unchanged
}

// In adjustCredits (line 52):
async adjustCredits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = AdjustCreditsSchema.parse(request.body)
  const { id } = CompanyParamsSchema.parse(request.params)
  // ...rest unchanged
}
```

---

## Warnings

### WR-01: Dual credit-adjustment routes with inconsistent behavior

**File:** `src/infrastructure/http/routes/company.routes.ts:11` and `src/infrastructure/http/routes/admin.routes.ts:18`

**Issue:** There are two HTTP routes that adjust company credits:
- `PATCH /companies/admin/:id/credits` (company.routes.ts) — calls `AdjustCompanyCreditsUseCase` → `CompanyRepository.adjustCredits` (Prisma transaction, guard against negative balance, writes `CreditTransaction` record).
- `PATCH /admin/companies/:id/credits` (admin.routes.ts) — calls `AdjustAdminCreditsUseCase` → `CreditService.grantCredits` (legacy module, different implementation).

The two paths have different behavior and different atomicity guarantees. An admin could use either path with different side effects. This also means the credit system has two owners. The company route path also overlaps the `GET /companies/:id` dynamic segment depending on Fastify's matching order.

**Fix:** Remove `PATCH /companies/admin/:id/credits` from `company.routes.ts`. All admin credit operations should go exclusively through the `/admin/` prefix. Once the Phase 12 credit module migration is complete, both should funnel through the same transactional `CompanyRepository.adjustCredits` path.

### WR-02: TOCTOU race in UpsertRecruiterProfileUseCase

**File:** `src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts:9-11`

**Issue:** The use-case checks company existence (`this.repo.findCompanyById`) and then immediately calls `this.repo.upsertProfile`. These are two separate, non-atomic Prisma calls. If the company is deleted between the check and the upsert, Prisma throws a foreign-key constraint error that is not a `DomainError`. This surfaces to the client as an unhandled 500 rather than a 404.

**Fix:**
```typescript
async execute(userId: string, data: { companyId: string }): Promise<RecruiterProfile> {
  const company = await this.repo.findCompanyById(data.companyId)
  if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
  try {
    return await this.repo.upsertProfile(userId, data)
  } catch (err: unknown) {
    // Prisma P2003 = foreign key constraint violation
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2003'
    ) {
      throw new DomainError('Company not found', 'NOT_FOUND', 404)
    }
    throw err
  }
}
```

### WR-03: Scheduler cron interval is too aggressive

**File:** `src/infrastructure/http/plugins/scheduler.plugin.ts:12`

**Issue:** The cron expression `'* * * * *'` fires every minute. For a job-expiry task that performs a bulk `updateMany` across all active jobs, this creates constant write pressure on the database. Jobs generally expire on the order of days or weeks, so per-minute checks are wasteful and can cause lock contention under load.

**Fix:** Use an hourly schedule unless the product requirement genuinely demands sub-minute expiry precision:
```typescript
// Every hour at minute 0
const task = cron.schedule('0 * * * *', async () => {
```
If more frequent checks are required for UX reasons, prefer a 5- or 15-minute interval (`'*/5 * * * *'` or `'*/15 * * * *'`).

### WR-04: getTransactions does not validate company existence

**File:** `src/adapters/controllers/admin.controller.ts:77` and `src/application/use-cases/admin/get-transactions.use-case.ts:7`

**Issue:** `GET /admin/companies/:id/transactions` delegates directly to `CompanyRepository.getTransactions` which runs `prisma.creditTransaction.findMany({ where: { companyId } })`. If the company does not exist, this returns an empty array `[]` with HTTP 200 rather than a 404. An admin querying transactions for a typo'd or deleted company silently gets an empty list, which can mask data errors.

**Fix:** Add an existence check in `GetTransactionsUseCase`:
```typescript
async execute(companyId: string): Promise<CreditTransaction[]> {
  const company = await this.repo.findById(companyId)
  if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
  return this.repo.getTransactions(companyId)
}
```
This requires `GetTransactionsUseCase` to receive a repository that also implements `findById`. `ICompanyRepository` already includes `findById`, so no interface change is needed.

---

## Info

### IN-01: `getById` response includes stub `rankings` field

**File:** `src/adapters/controllers/job.controller.ts:84`

**Issue:** `reply.status(200).send({ ...job, rankings: [] as RankingItem[] })` appends a hard-coded empty array to every job response. This exposes an unimplemented feature as a contracted API field. Clients that depend on `rankings` being present will write code against a field that is always empty; removing it later becomes a breaking change.

**Fix:** Remove `rankings` from the response until the ranking feature is implemented. Return `job` directly:
```typescript
reply.status(200).send(job)
```
When rankings are implemented, add the field at that point with a documented contract.

### IN-02: `toDomain` methods use `any` typed row parameter

**File:** `src/adapters/repositories/candidate.repository.ts:34`, `src/adapters/repositories/company.repository.ts:45`, `src/adapters/repositories/job.repository.ts:62`, `src/adapters/repositories/recruiter.repository.ts:27` and `:35`

**Issue:** All `toDomain(row: any)` methods accept untyped input. This defeats TypeScript's ability to catch field-name mismatches between the Prisma model and the domain entity during schema migrations. Prisma generates precise return types; using them costs nothing.

**Fix:** Replace `any` with the Prisma-generated type. Example for `job.repository.ts`:
```typescript
import type { Job as PrismaJob } from '@prisma/client'

private toDomain(row: PrismaJob): Job {
  // TypeScript now catches any field renames at compile time
}
```

### IN-03: Magic number `50` in CandidateProfileSchema default

**File:** `src/adapters/controllers/candidate.controller.ts:17`

**Issue:** `searchRadiusKm: z.number().int().positive().default(50)` embeds a domain constant (default search radius) directly in the HTTP validation schema. If this value changes or needs to be referenced elsewhere (e.g., in recommendation logic), it must be updated in multiple places.

**Fix:** Extract to a named constant:
```typescript
const DEFAULT_SEARCH_RADIUS_KM = 50

const CandidateProfileSchema = z.object({
  // ...
  searchRadiusKm: z.number().int().positive().default(DEFAULT_SEARCH_RADIUS_KM),
})
```

### IN-04: `listUsers` pagination response has no total count

**File:** `src/application/use-cases/admin/list-users.use-case.ts:6`

**Issue:** `execute(page, limit)` returns only the current page of users with no `total` or `hasNextPage` field. Admin UIs consuming this endpoint cannot determine if there are more pages, making proper pagination UX impossible without a separate count request.

**Fix:** Return a paginated wrapper from the use-case:
```typescript
async execute(page: number, limit: number): Promise<{ data: UserPublic[]; total: number }> {
  const [data, total] = await Promise.all([
    this.repo.findMany({ skip: (page - 1) * limit, take: limit }),
    this.repo.count(),
  ])
  return { data, total }
}
```
This requires adding a `count(): Promise<number>` method to `IUserRepository` and implementing it in `UserRepository`.

---

_Reviewed: 2026-05-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
