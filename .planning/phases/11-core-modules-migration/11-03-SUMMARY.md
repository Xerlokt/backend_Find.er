---
phase: 11-core-modules-migration
plan: 03
subsystem: api
tags: [fastify, prisma, typescript, clean-architecture, job, scheduler]

# Dependency graph
requires:
  - phase: 11-02
    provides: CompanyRepository/CompanyController adapter pattern, use case pattern, app.ts import swap pattern
  - phase: 09-domain-layer-scaffold
    provides: IJobRepository interface, Job entity, Modality type, RecruiterProfile entity
provides:
  - JobRepository adapter implementing all 6 IJobRepository methods with toDomain() and Modality cast
  - infrastructure/scheduler/job-expiry.scheduler.ts accepting IJobRepository interface (not concrete class)
  - scheduler.plugin.ts updated to import from adapters/repositories and infrastructure/scheduler
  - CreateJobUseCase, UpdateJobUseCase (FORBIDDEN ownership), DeactivateJobUseCase (FORBIDDEN ownership), ListJobsByRecruiterUseCase, GetJobByIdUseCase — no Prisma imports
  - JobController with create/listMine/getById/update/deactivate handlers (Zod validation, DomainError catch)
  - infrastructure/http/routes/job.routes.ts with /mine registered before /:id (Fastify ordering critical)
  - app.ts swapped to import from infrastructure/http/routes/job.routes (modules/job no longer in app.ts)
affects: [11-04-admin-migration, 12-swipe-credits-recommendation-chat-migration, 13-cleanup-unit-test-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JobRepository.toDomain(): maps all fields explicitly with modality cast (Prisma enum → domain union type 'REMOTE' | 'HYBRID' | 'IN_PERSON')"
    - "findRecruiterProfileByUserId: direct Prisma call inside JobRepository — never imports RecruiterRepository (ARCH-04 module isolation)"
    - "job-expiry.scheduler.ts: accepts IJobRepository interface not concrete class — decouples infrastructure scheduler from adapter implementation"
    - "Fastify route ordering: /mine MUST be registered before /:id in job.routes.ts — string literal route takes priority over param route"
    - "Update handler expiresAt: destructure string out of body spread before conditional Date conversion to satisfy TypeScript strict typing"

key-files:
  created:
    - src/infrastructure/scheduler/job-expiry.scheduler.ts
    - src/adapters/repositories/job.repository.ts
    - src/application/use-cases/job/create-job.use-case.ts
    - src/application/use-cases/job/update-job.use-case.ts
    - src/application/use-cases/job/deactivate-job.use-case.ts
    - src/application/use-cases/job/list-jobs-by-recruiter.use-case.ts
    - src/application/use-cases/job/get-job-by-id.use-case.ts
    - src/adapters/controllers/job.controller.ts
    - src/infrastructure/http/routes/job.routes.ts
  modified:
    - src/infrastructure/http/plugins/scheduler.plugin.ts
    - src/app.ts

key-decisions:
  - "scheduler.plugin.ts now imports JobRepository from adapters/repositories and runExpiryCheck from infrastructure/scheduler — removes last modules/job/ import from infrastructure layer"
  - "job-expiry.scheduler.ts accepts IJobRepository interface — scheduler is decoupled from concrete adapter; can be tested without DB"
  - "findRecruiterProfileByUserId uses direct prisma.recruiterProfile.findUnique inside JobRepository — ARCH-04 module isolation: JobRepository must not import RecruiterRepository"
  - "Old src/modules/job/ files NOT deleted — additive migration pattern; job.routes.ts stays because swipe.routes.ts still imports RankingItem from it; cleanup in Phase 13"
  - "/mine route registered before /:id in job.routes.ts — Fastify registration-order sensitive; 'mine' treated as UUID param and fails Zod validation if /:id registered first"

patterns-established:
  - "Ownership check pattern: findRecruiterProfileByUserId → findById → compare job.recruiterId !== profile.id → DomainError FORBIDDEN 403"
  - "Scheduler interface decoupling: infrastructure scheduler function accepts domain interface, adapter injected at plugin registration"

requirements-completed: [TEST-03]

# Metrics
duration: 18min
completed: 2026-05-09
---

# Phase 11 Plan 03: Job Module Migration Summary

**Job module migrated to Clean Architecture with 5 use cases (ownership-checked update/deactivate), scheduler infrastructure decoupled to accept IJobRepository interface, and /mine route registered before /:id — all 134 integration tests green**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-09T00:00:00Z
- **Completed:** 2026-05-09T00:17:23Z
- **Tasks:** 2
- **Files modified:** 11 (9 created, 2 modified)

## Accomplishments
- JobRepository adapter implementing all 6 IJobRepository methods with explicit toDomain() and Modality cast (Prisma enum → domain union type)
- Job expiry scheduler extracted to infrastructure/scheduler/ layer accepting IJobRepository interface — scheduler.plugin.ts no longer imports from modules/job/
- 5 job use cases with zero Prisma imports in application layer; UpdateJobUseCase and DeactivateJobUseCase enforce FORBIDDEN ownership check (T-11-03-01, T-11-03-02)
- JobController with per-handler Zod validation and DomainError catch following auth.controller.ts canonical pattern
- job.routes.ts in infrastructure layer with /mine registered before /:id (Fastify route ordering critical for GET /jobs/mine not to match /:id param)
- app.ts import swapped from modules/job to infrastructure/http/routes — 134/134 integration tests pass through new wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scheduler infrastructure files and JobRepository adapter** - `aefb5af` (feat)
2. **Task 2: Create job use cases, controller, routes and swap app.ts import** - `60795ef` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/infrastructure/scheduler/job-expiry.scheduler.ts` - runExpiryCheck accepting IJobRepository interface (decoupled from concrete adapter)
- `src/infrastructure/http/plugins/scheduler.plugin.ts` - Updated imports: modules/job/ → adapters/repositories/ and infrastructure/scheduler/
- `src/adapters/repositories/job.repository.ts` - JobRepository implements all 6 IJobRepository methods; findRecruiterProfileByUserId uses direct Prisma call (ARCH-04); toDomain() with Modality cast
- `src/application/use-cases/job/create-job.use-case.ts` - Derives companyId from recruiter profile (IDOR prevention)
- `src/application/use-cases/job/update-job.use-case.ts` - FORBIDDEN ownership check: job.recruiterId !== profile.id
- `src/application/use-cases/job/deactivate-job.use-case.ts` - FORBIDDEN ownership check: job.recruiterId !== profile.id
- `src/application/use-cases/job/list-jobs-by-recruiter.use-case.ts` - Resolves recruiter profile from userId, delegates to findByRecruiterId
- `src/application/use-cases/job/get-job-by-id.use-case.ts` - Throws NOT_FOUND if job missing
- `src/adapters/controllers/job.controller.ts` - JobController: create/listMine/getById/update/deactivate with Zod + DomainError
- `src/infrastructure/http/routes/job.routes.ts` - POST/ + GET/mine + GET/:id + PATCH/:id + DELETE/:id/deactivate with preHandlers
- `src/app.ts` - Import swapped from modules/job/job.routes to infrastructure/http/routes/job.routes

## Decisions Made
- scheduler.plugin.ts imports JobRepository from adapters/repositories and runExpiryCheck from infrastructure/scheduler — removes the last modules/job/ import from the infrastructure layer
- job-expiry.scheduler.ts accepts IJobRepository interface rather than concrete class — scheduler is now decoupled and could be tested without a real DB
- findRecruiterProfileByUserId calls prisma.recruiterProfile.findUnique directly inside JobRepository (comment: "NEVER import RecruiterRepository") — ARCH-04 module isolation
- Old src/modules/job/ files are NOT deleted — additive migration pattern; modules/job/job.routes.ts stays because swipe.routes.ts still imports RankingItem from it; cleanup deferred to Phase 13
- /mine route registered before /:id in job.routes.ts — Fastify registration-order sensitive (string literal takes priority); if /:id came first, "mine" would be treated as a UUID and fail Zod validation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript TS2345 type error in update handler**
- **Found during:** Task 2 (job.controller.ts update handler)
- **Issue:** Spreading `body` (which contains `expiresAt: string | undefined`) and then spreading `{ expiresAt: new Date(...) }` results in type `string | Date | undefined` for expiresAt, which is incompatible with `Partial<Omit<Job, ...>>` expecting `Date | undefined`
- **Fix:** Destructured `expiresAt` out of body first (`const { expiresAt: expiresAtStr, ...rest } = body`), then conditionally added `{ expiresAt: new Date(expiresAtStr) }` to the rest spread
- **Files modified:** `src/adapters/controllers/job.controller.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `60795ef` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 - bug)
**Impact on plan:** TypeScript correctness fix, no scope creep, no behavior change.

## Issues Encountered

Job integration tests show FK constraint teardown failures (RecruiterProfile_companyId_fkey) when both job test files run concurrently — same pre-existing issue noted in 11-02 SUMMARY. Tests pass 134/134 when run sequentially (--runInBand with full suite). Not caused by plan 03 changes.

## User Setup Required

None - no external service configuration required.

## Known Stubs

- `rankings: [] as RankingItem[]` in `JobController.getById` — placeholder per Phase 4 decision (04-04); Phase 6 recommendation fills this via the swipe ranking route. Intentional stub, plan-compliant.

## Next Phase Readiness

- Job module fully migrated to Clean Architecture layers
- scheduler.plugin.ts no longer imports from src/modules/ (last modules/job/ import gone from infrastructure)
- app.ts still imports admin, swipe, credits, chat from src/modules/ — Phase 11 plan 04 will migrate admin
- All 134 integration tests green through new job wiring
- src/modules/job/job.routes.ts retained (swipe.routes.ts imports RankingItem from it) — Phase 13 cleanup removes it

---
*Phase: 11-core-modules-migration*
*Completed: 2026-05-09*
