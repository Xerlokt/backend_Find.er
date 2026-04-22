---
phase: 04-jobs
fixed_at: 2026-04-21T20:45:00Z
review_path: .planning/phases/04-jobs/04-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-04-21T20:45:00Z
**Source review:** .planning/phases/04-jobs/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 3 (CR-01, WR-02, WR-03)
- Skipped: 1 (WR-01 — intentional design, accepted)

## Fixed Issues

### CR-01: companyId accepted from request body — IDOR on company ownership

**Files modified:** `src/modules/job/job.routes.ts`, `src/modules/job/job.service.ts`
**Commit:** 309c81a
**Applied fix:** Removed `companyId: z.string().uuid()` from `CreateJobSchema` in `job.routes.ts` (with explanatory comment). Changed `JobService.createJob` signature from `data: CreateJobData` to `data: Omit<CreateJobData, 'companyId'>` and derived `companyId` from `profile.companyId` inside the method — never from the caller. `CreateJobData` in `job.repository.ts` retains `companyId` as required so the repository layer still receives it from the authoritative source.

### WR-02: Route params not validated — non-UUID :id values reach the database

**Files modified:** `src/modules/job/job.routes.ts`
**Commit:** 89ba935
**Applied fix:** Added `const JobParamsSchema = z.object({ id: z.string().uuid() })` after `CreateJobSchema`. Replaced all three `request.params as { id: string }` unvalidated type assertions with `JobParamsSchema.parse(request.params)` in GET `/:id`, PATCH `/:id`, and DELETE `/:id/deactivate` handlers. Non-UUID values now produce a clean Zod 400 instead of leaking a Prisma P2023 internal error.

### WR-03: createJob integration tests still send companyId in body

**Files modified:** `tests/integration/job-routes.test.ts`, `tests/integration/job.test.ts`
**Commit:** 1ffc4b4
**Applied fix:**
- `job-routes.test.ts`: Changed `buildValidJobBody(companyId)` to `buildValidJobBody()` (no parameter), removed `companyId` from the returned object, updated all call sites. Added exploit-path test `'201 ignora companyId injetado no body — usa company do perfil do recruiter'` that sends a foreign `companyId` in the POST body and asserts `response.body.companyId === recruiterCompany.id` and `!== foreignCompany.id`. Removed unused `const company = await createCompany()` in the 401 test.
- `job.test.ts`: Removed `companyId` field from both `service.createJob` call sites (201 and 404 tests). Removed unused `const company = await createCompany()` from the 404 test. The `expect(job.companyId).toBe(company.id)` assertion in the 201 test is retained and still valid — `company` is still in scope via the recruiter profile setup, verifying that the service correctly derives `companyId` from the profile.

## Skipped Issues

### WR-01: GET /jobs/:id lacks ownership check — any RECRUITER can read any job

**File:** `src/modules/job/job.routes.ts:60-67` and `src/modules/job/job.service.ts:32-35`
**Reason:** Accepted as intentional design per plan. `04-03-PLAN.md` explicitly states: "GET /jobs/:id is intentionally open to any authenticated user so the Phase 5 swipe flow can read job details" and the must_haves truth reads "GET /jobs/:id returns 200 with job and rankings: [] placeholder (accessible to any authenticated user)". Adding an ownership guard here would break the Phase 5 swipe flow. This finding should be re-evaluated at Phase 6 when candidate rankings are populated, at which point access control should be tightened.
**Original issue:** `getJobById` fetches the job by ID with no check that `job.recruiterId` matches the authenticated recruiter's profile.

---

_Fixed: 2026-04-21T20:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
