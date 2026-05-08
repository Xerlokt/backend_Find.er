---
phase: 11-core-modules-migration
plan: 01
subsystem: api
tags: [fastify, prisma, typescript, clean-architecture, candidate, recruiter]

# Dependency graph
requires:
  - phase: 10-infrastructure-auth-migration
    provides: UserRepository, auth use cases, infrastructure/http/routes/auth.routes.ts pattern
  - phase: 09-domain-layer-scaffold
    provides: ICandidateRepository, IRecruiterRepository, CandidateProfile, RecruiterProfile, Company domain entities
provides:
  - CandidateRepository adapter implementing ICandidateRepository (explicit toDomain + Modality cast)
  - RecruiterRepository adapter implementing IRecruiterRepository (direct Prisma call for company, no CompanyRepository import)
  - UpsertCandidateProfileUseCase, GetCandidateProfileUseCase injecting ICandidateRepository
  - UpsertRecruiterProfileUseCase, GetRecruiterProfileUseCase injecting IRecruiterRepository
  - CandidateController and RecruiterController following auth.controller.ts canonical pattern
  - candidateRoutes and recruiterRoutes in infrastructure/http/routes/ with authenticate + requireRole preHandlers
  - app.ts swapped to import from infrastructure/http/routes/ (modules/candidate and modules/recruiter no longer in app.ts)
affects: [12-swipe-credits-recommendation-chat-migration, 13-cleanup-unit-test-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repository adapter pattern: implements domain interface, uses explicit toDomain() mapping (no spread), casts Prisma enums to domain union types"
    - "Use case pattern: constructor-injected repository interface, no direct Prisma import, DomainError on not-found"
    - "Controller pattern: Zod parse at top, new UseCase(new Repository()) inline, try/catch DomainError check"
    - "Route pattern: zero logic, const ctrl = new Controller(), ctrl.method.bind(ctrl)"
    - "Module isolation: RecruiterRepository calls prisma.company directly with ARCH-04 comment — never imports CompanyRepository"

key-files:
  created:
    - src/adapters/repositories/candidate.repository.ts
    - src/adapters/repositories/recruiter.repository.ts
    - src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts
    - src/application/use-cases/candidate/get-candidate-profile.use-case.ts
    - src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts
    - src/application/use-cases/recruiter/get-recruiter-profile.use-case.ts
    - src/adapters/controllers/candidate.controller.ts
    - src/adapters/controllers/recruiter.controller.ts
    - src/infrastructure/http/routes/candidate.routes.ts
    - src/infrastructure/http/routes/recruiter.routes.ts
  modified:
    - src/app.ts

key-decisions:
  - "CandidateRepository.toDomain() maps every field explicitly — no spread — to enforce domain/adapter boundary and allow safe Modality enum cast"
  - "RecruiterRepository.findCompanyById() calls prisma.company directly with ARCH-04 comment rather than importing CompanyRepository (module isolation preserved)"
  - "Old modules/candidate and modules/recruiter files NOT deleted — additive migration pattern; cleanup deferred to Phase 13"

patterns-established:
  - "Adapter toDomain(): explicit field mapping with Prisma enum → domain union cast"
  - "Use case purity: no Prisma imports, constructor-injected interface only"
  - "Route import depth from src/infrastructure/http/routes/: authenticate from ../plugins/, requireRole from ../../../shared/hooks/"

requirements-completed: [TEST-03]

# Metrics
duration: 10min
completed: 2026-05-08
---

# Phase 11 Plan 01: Candidate and Recruiter Module Migration Summary

**Candidate and recruiter modules migrated to Clean Architecture with repository adapters, use cases, controllers, and routes — 142/142 integration tests green through new wiring**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-08T23:37:47Z
- **Completed:** 2026-05-08T23:48:04Z
- **Tasks:** 3
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments
- CandidateRepository and RecruiterRepository adapters implementing domain interfaces with explicit toDomain() mapping and Prisma enum casts
- Six use cases (upsert/get for candidate, upsert/get for recruiter) injecting repository interfaces only — zero Prisma imports in application layer
- CandidateController and RecruiterController following auth.controller.ts canonical pattern (Zod parse, inline instantiation, DomainError catch)
- candidateRoutes and recruiterRoutes in infrastructure/http/routes/ with authenticate + requireRole preHandlers, .bind(ctrl) pattern
- app.ts import swap from modules/ to infrastructure/http/routes/ — all 142 integration tests pass through new wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Create candidate repository adapter and use cases** - `cb6b9ed` (feat)
2. **Task 2: Create recruiter repository adapter and use cases** - `a8fcdcf` (feat)
3. **Task 3: Create controllers, routes, and swap app.ts imports** - `e09332f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/adapters/repositories/candidate.repository.ts` - CandidateRepository implementing ICandidateRepository, explicit toDomain() with Modality cast
- `src/adapters/repositories/recruiter.repository.ts` - RecruiterRepository implementing IRecruiterRepository, direct Prisma call for company (ARCH-04)
- `src/application/use-cases/candidate/upsert-candidate-profile.use-case.ts` - delegates to repo.upsertProfile, no DomainError needed
- `src/application/use-cases/candidate/get-candidate-profile.use-case.ts` - throws DomainError('NOT_FOUND') if profile missing
- `src/application/use-cases/recruiter/upsert-recruiter-profile.use-case.ts` - validates company exists before upsert
- `src/application/use-cases/recruiter/get-recruiter-profile.use-case.ts` - throws DomainError('NOT_FOUND') if profile missing
- `src/adapters/controllers/candidate.controller.ts` - Zod CandidateProfileSchema, upsertProfile + getProfile handlers
- `src/adapters/controllers/recruiter.controller.ts` - Zod RecruiterProfileSchema, upsertProfile + getProfile handlers
- `src/infrastructure/http/routes/candidate.routes.ts` - PUT/GET /me with authenticate + requireRole('CANDIDATE')
- `src/infrastructure/http/routes/recruiter.routes.ts` - PUT/GET /me with authenticate + requireRole('RECRUITER')
- `src/app.ts` - import swapped from modules/candidate and modules/recruiter to infrastructure/http/routes/

## Decisions Made
- CandidateRepository.toDomain() maps every field explicitly (no spread) to enforce domain/adapter boundary and allow safe Modality cast
- RecruiterRepository.findCompanyById() uses direct Prisma call with ARCH-04 module isolation comment — never imports CompanyRepository
- Old src/modules/candidate/ and src/modules/recruiter/ files are NOT deleted — additive migration; cleanup deferred to Phase 13

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Docker containers were not running at test time. Started with `docker compose up -d` before running integration tests. This is a known environment condition (not a code issue).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Candidate and recruiter modules fully migrated to Clean Architecture layers
- Pattern established for remaining module migrations (company, job, admin)
- app.ts still wires most modules from src/modules/ — Phase 11 plans 02-04 will migrate company, job, and admin
- All 142 integration tests green, zero TypeScript errors

---
*Phase: 11-core-modules-migration*
*Completed: 2026-05-08*
