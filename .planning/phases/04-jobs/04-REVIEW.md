---
phase: 04-jobs
reviewed: 2026-04-21T20:20:02Z
reviewed_gap_closure: 2026-04-25T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - prisma/migrations/20260421195856_add_recruiter_to_job/migration.sql
  - prisma/schema.prisma
  - src/app.ts
  - src/modules/job/job.repository.ts
  - src/modules/job/job.routes.ts
  - src/modules/job/job.scheduler.ts
  - src/modules/job/job.service.ts
  - src/shared/plugins/scheduler.ts
  - tests/helpers/factories.ts
  - tests/integration/job-routes.test.ts
  - tests/integration/job.test.ts
  - tests/unit/job.scheduler.test.ts
  - tests/unit/job.service.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
findings_after_gap_closure:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-21T20:20:02Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The jobs module introduces CRUD routes for job postings with recruiter ownership enforcement, a soft-deactivation endpoint, and an expiry scheduler. The ownership guard (`job.recruiterId !== profile.id`) is correctly placed in the service layer and is covered by both unit and integration tests. The JWT-to-profile lookup pattern prevents direct IDOR on `recruiterId`.

One critical IDOR vulnerability remains: `companyId` is accepted from the request body in `POST /jobs` and passed through to the repository unchanged, bypassing the recruiter-profile lookup as the authoritative source. The remaining issues are a missing ownership guard on `GET /jobs/:id`, a missing guard on `GET /jobs/:id` against cross-company access, missing input validation on route params, and two code-quality items.

---

## Critical Issues

### CR-01: companyId accepted from request body — IDOR on company ownership

**File:** `src/modules/job/job.routes.ts:12-13` and `src/modules/job/job.service.ts:7-11`

**Issue:** `CreateJobSchema` includes `companyId: z.string().uuid()` and the parsed body value flows directly into `CreateJobData`, which is passed to `repo.create`. The service never cross-checks whether `companyId` matches the company the authenticated recruiter actually belongs to. Any authenticated `RECRUITER` can supply any valid company UUID and create a job under that company, even one they have no relationship with.

The recruiter's profile (`profile.companyId`) is already fetched from the database — it should be the only source of truth for `companyId`. Accepting it from the body is unnecessary and dangerous.

**Fix:**

In `job.routes.ts`, remove `companyId` from `CreateJobSchema`:
```typescript
const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  professionId: z.string().min(1),
  // companyId removed — derived from recruiter profile in service
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']),
  requiredSkills: z.array(z.string()).min(1),
  expiresAt: z.string().datetime(),
})
```

In `job.service.ts`, derive `companyId` from the profile:
```typescript
async createJob(userId: string, data: Omit<CreateJobData, 'companyId'>) {
  const profile = await this.repo.findRecruiterProfileByUserId(userId)
  if (!profile) throw new AppError('Recruiter profile not found', 404, 'NOT_FOUND')
  return this.repo.create(profile.id, { ...data, companyId: profile.companyId })
}
```

Update `CreateJobData` in `job.repository.ts` to keep `companyId` required (it must reach `prisma.job.create`), but the service must always supply it from the profile — never from the caller.

**Status (gap closure 04-04):** FIXED. `companyId` is removed from `CreateJobSchema` (line 14-26 of updated file). The service already has `Omit<CreateJobData, 'companyId'>` and derives `companyId` from `profile.companyId`. Integration test at lines 123-143 of `job-routes.test.ts` confirms the exploit path is blocked.

---

## Warnings

### WR-01: GET /jobs/:id lacks ownership check — any RECRUITER can read any job

**File:** `src/modules/job/job.routes.ts:60-67` and `src/modules/job/job.service.ts:32-35`

**Issue:** `getJobById` fetches the job by its ID with no check that `job.recruiterId` matches the authenticated recruiter's profile. Any authenticated recruiter can read the details (title, description, salary range, location, required skills) of a job posted by a different recruiter from a different company. At Phase 6 this endpoint will also return candidate rankings — exposing them to competing companies.

**Fix:** In `job.service.ts`, add an ownership guard (or optionally accept `null` for a public "anyone can read" policy, but document it explicitly as intentional):
```typescript
async getJobById(jobId: string, userId: string) {
  const profile = await this.repo.findRecruiterProfileByUserId(userId)
  if (!profile) throw new AppError('Recruiter profile not found', 404, 'NOT_FOUND')
  const job = await this.repo.findJobById(jobId)
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
  if (job.recruiterId !== profile.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')
  return job
}
```

Pass `request.user.id` from the route handler and add a test for the cross-recruiter 403 case.

**Status (gap closure 04-04):** INTENTIONALLY REVISED. Per the swipe flow spec, `GET /jobs/:id` is now open to any authenticated user (CANDIDATE, RECRUITER, ADMIN). The `requireRole('RECRUITER')` guard has been removed and the "any authenticated user" policy is explicitly documented in the route comment and plan. The original concern about cross-company data exposure is acknowledged and accepted for Phase 4 job data (title, description, skills — no PII). The `rankings: []` placeholder is static and exposes no sensitive data. **DEFERRED risk:** When Phase 6 populates `rankings` with real candidate fitScore/profile data, the service MUST add role-based filtering before serving non-empty rankings to prevent CANDIDATE users from reading other candidates' scores. This deferral is tracked as WR-01-PHASE6 below.

### WR-01-PHASE6: GET /jobs/:id will expose candidate rankings to all authenticated users in Phase 6

**File:** `src/modules/job/job.routes.ts:68-75` and `src/modules/job/job.service.ts:32-36`

**Issue:** `getJobById` (service, line 32) accepts no `userId` parameter. When Phase 6 replaces `rankings: []` with real `RankingItem[]` data, it will serve candidate `candidateId`, `fitScore`, and `profile` fields to any authenticated user — including CANDIDATE users who could read the rankings of competing candidates, and RECRUITER users from other companies reading another company's candidate pipeline.

The service signature `getJobById(jobId: string)` has no identity context, making it structurally impossible to add per-caller filtering without a breaking signature change.

**Fix:** Before Phase 6 populates rankings, update the service signature to accept `userId` and add role-based or ownership-based filtering:
```typescript
async getJobById(jobId: string, requestingUserId?: string) {
  const job = await this.repo.findJobById(jobId)
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
  // Phase 6: populate rankings only if requestingUserId belongs to the owning recruiter
  return job
}
```
Route handler must pass `request.user.id` and the route should gate `rankings` population behind an ownership check.

### WR-02: Route params not validated — non-UUID :id values reach the database

**File:** `src/modules/job/job.routes.ts:63, 72, 86`

**Issue:** `request.params as { id: string }` is an unvalidated type assertion. A value like `../../etc/passwd` or an arbitrarily long string is forwarded directly to `prisma.job.findUnique({ where: { id } })`. Prisma will reject a non-UUID value with an unhandled internal error (P2023) instead of a clean 400, leaking an internal stack trace through the error handler.

**Fix:** Add a Zod param schema and parse it in each handler:
```typescript
const JobParamsSchema = z.object({ id: z.string().uuid() })

// In each handler:
const { id } = JobParamsSchema.parse(request.params)
```

**Status (gap closure 04-04):** FIXED. `JobParamsSchema` is defined at line 28 and used in all three handlers (GET /:id line 71, PATCH /:id line 81, DELETE /:id/deactivate line 94).

### WR-03: createJob integration test still sends companyId in body — test does not catch CR-01

**File:** `tests/integration/job-routes.test.ts:42-52` and `tests/integration/job.test.ts:34-48`

**Issue:** `buildValidJobBody` includes `companyId` in the request body, and `job.test.ts:34` passes `companyId` directly to `service.createJob`. Because the service currently accepts it without validation, these tests pass. However, they actively assert that `job.companyId === company.id`, which happens to be true only because the test sends the correct company's ID — the tests do not exercise the exploit path (a recruiter sending a different company's UUID). When CR-01 is fixed by removing `companyId` from the body, these tests will need to be updated.

**Fix:** After fixing CR-01, update `buildValidJobBody` to omit `companyId`, and add a test that confirms a recruiter cannot override `companyId` by injecting a foreign company UUID in the body (expect the injected value to be ignored and the job to be created under the recruiter's actual company).

**Status (gap closure 04-04):** FIXED. `buildValidJobBody` (line 42-51) no longer includes `companyId`. The IDOR exploit test at lines 123-143 confirms a foreign `companyId` injected in the body is ignored and the job is created under the recruiter's actual company.

---

## Info

### IN-01: `eslint-disable-next-line` comment without explanation in scheduler plugin

**File:** `src/shared/plugins/scheduler.ts:11`

**Issue:** `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppresses a type warning on the `task` variable returned by `cron.schedule`. The comment above it references a reason (`node-cron v4: schedule returns a ScheduledTask`) but the `any` cast is not actually present on the line that follows — `cron.schedule` is assigned to `const task` and TypeScript should be able to infer the type. If the type is inferred correctly, the eslint-disable comment is dead.

**Fix:** Remove the eslint-disable comment and the type annotation; if the compiler still complains, add an explicit `import type { ScheduledTask } from 'node-cron'` annotation instead of suppressing the lint rule.

### IN-02: `deactivateExpiredJobs` integration test uses `toBeGreaterThanOrEqual(2)` — brittle assertion

**File:** `tests/integration/job.test.ts:164`

**Issue:** `expect(count).toBeGreaterThanOrEqual(2)` passes even if the repo deactivated jobs left over from previous test runs, masking isolation failures. The test creates exactly 2 expired jobs and expects exactly 2 to be deactivated.

**Fix:** Use `toBe(2)` and ensure test isolation (each test should run against a clean or transaction-wrapped DB state). If full isolation is not in scope, at minimum assert the exact count using the IDs created in the test:
```typescript
expect(count).toBeGreaterThanOrEqual(2) // keep this if shared DB
// AND verify the specific jobs are deactivated (already done via findUnique checks below)
```
The `findUnique` assertions below the count check are correct and sufficient as a safety net, but the count assertion should be tightened.

---

## Gap Closure 04-04 Review

**Reviewed:** 2026-04-25T00:00:00Z
**Files:** `src/modules/job/job.routes.ts`, `tests/integration/job-routes.test.ts`
**Scope:** Removal of `requireRole('RECRUITER')` from GET /jobs/:id, addition of `RankingItem` export, and two new integration tests.

### Findings Status After Gap Closure

| Original Finding | Status |
|------------------|--------|
| CR-01: companyId IDOR | Fixed — removed from schema, exploit test added |
| WR-01: GET /:id ownership | Intentionally revised — policy changed to "any authenticated user"; new risk WR-01-PHASE6 raised |
| WR-02: route params not validated | Fixed — JobParamsSchema applied in all handlers |
| WR-03: test sends companyId | Fixed — buildValidJobBody updated, exploit path tested |
| IN-01: eslint-disable in scheduler | Open — not in scope of gap closure |
| IN-02: brittle count assertion | Open — not in scope of gap closure |

### New Issues Introduced by Gap Closure

#### GC-WR-01: RankingItem interface declared in routes file — wrong layer for a shared type contract

**File:** `src/modules/job/job.routes.ts:8-12`

**Issue:** `RankingItem` is declared and exported from a routes file. Under the project's Clean Architecture rule ("routes → service → repository, no layer skipping, modules do not import directly from other modules"), Phase 6 consumers (likely a swipe or ranking module) will need to `import { RankingItem } from '../job/job.routes'`. Importing a type from another module's routes file violates module isolation and creates a coupling where a downstream module depends on the transport layer of an unrelated module.

**Fix:** Move the interface to a dedicated types file or the repository/service boundary:
```
src/modules/job/job.types.ts
```
```typescript
export interface RankingItem {
  candidateId: string
  fitScore: number
  profile: Record<string, unknown> | null
}
```
Re-export from `job.routes.ts` if needed for backward compatibility:
```typescript
export type { RankingItem } from './job.types'
```
This keeps the contract at the correct layer and avoids forcing Phase 6 to import from a routes file.

**Severity:** Warning

#### GC-IN-01: GET /jobs/:id candidate test does not assert rankings is empty

**File:** `tests/integration/job-routes.test.ts:291`

**Issue:** The CANDIDATE 200 test (line 268-293) asserts `Array.isArray(response.body.rankings)` but does not assert `response.body.rankings` equals `[]`. The RECRUITER 200 test at line 249 does assert `toEqual([])`. The inconsistency means the candidate test would pass even if the endpoint accidentally returned non-empty rankings (e.g., after a future partial Phase 6 implementation), masking a regression.

**Fix:** Add the value assertion to match the existing RECRUITER test:
```typescript
expect(response.body.rankings).toEqual([])
```

**Severity:** Info

#### GC-IN-02: No 401 test for GET /jobs/:id — authenticate-only guard is not regression-tested

**File:** `tests/integration/job-routes.test.ts` — missing test

**Issue:** GET /jobs/:id now uses `preHandler: [authenticate]` only, with no `requireRole` guard. The existing tests cover 200 (RECRUITER), 404, and 200 (CANDIDATE). There is no test confirming that an unauthenticated request (no Authorization header) returns 401. Without this test, removal of the `authenticate` hook would not be caught by the test suite.

Other endpoints (e.g., POST /jobs) have explicit 401 tests (line 111-121). Consistency requires GET /jobs/:id to have one as well.

**Fix:**
```typescript
it('401 quando não há Authorization header', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()

  const response = await supertest(app.server)
    .get('/jobs/00000000-0000-0000-0000-000000000000')

  expect(response.status).toBe(401)
  await app.close()
})
```

**Severity:** Info

---

_Reviewed: 2026-04-21T20:20:02Z (original)_
_Gap closure reviewed: 2026-04-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
