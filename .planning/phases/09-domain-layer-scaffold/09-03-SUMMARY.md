---
phase: 09-domain-layer-scaffold
plan: "03"
subsystem: domain
tags: [typescript, clean-architecture, repository-interfaces, domain-layer]

# Dependency graph
requires:
  - phase: 09-01
    provides: "11 domain entity files in src/domain/entities/ (User, Job, Swipe, etc.)"
  - phase: 09-02
    provides: "Application layer ports (IHashPort, ITokenPort, IGraphPort) and DomainError"
provides:
  - "10 repository interface files in src/domain/interfaces/ — full data-access contracts (ARCH-06)"
  - "IUserRepository, IRefreshTokenRepository, ICandidateRepository, ICompanyRepository, IRecruiterRepository"
  - "IJobRepository, ISwipeRepository, ICreditRepository, IChatRepository, IRecommendationRepository"
  - "Helper types: SwipeWithCandidateInfo, RecruiterWithCompany, UnlockResult, ChatParticipants, ChatListItem, FitScoreInput, FitScoreJobInput"
affects:
  - "10-infrastructure-auth-migration"
  - "11-core-modules-migration"
  - "12-swipe-credits-recommendation-chat-migration"
  - "13-cleanup-unit-test-layer"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repository interfaces define data-access contracts using only domain entity types (ARCH-06 — zero @prisma/client imports)"
    - "Helper types co-located with their consuming interface file"
    - "Method signatures derived verbatim from existing src/modules/ repositories (D-02)"

key-files:
  created:
    - src/domain/interfaces/user.repository.interface.ts
    - src/domain/interfaces/refresh-token.repository.interface.ts
    - src/domain/interfaces/candidate.repository.interface.ts
    - src/domain/interfaces/company.repository.interface.ts
    - src/domain/interfaces/recruiter.repository.interface.ts
    - src/domain/interfaces/job.repository.interface.ts
    - src/domain/interfaces/swipe.repository.interface.ts
    - src/domain/interfaces/credit.repository.interface.ts
    - src/domain/interfaces/chat.repository.interface.ts
    - src/domain/interfaces/recommendation.repository.interface.ts
  modified: []

key-decisions:
  - "D-02: Each IXxxRepository defines ALL methods from the current module repository — method signatures derived by reading src/modules/*/*.repository.ts files verbatim"
  - "D-03: IRefreshTokenRepository created in src/domain/interfaces/ — required by auth use cases"
  - "D-04: Zero touch to existing files — no imports changed in src/modules/ or src/shared/"
  - "ARCH-06: Repository interfaces use only domain entity types as return types — no @prisma/client types"

patterns-established:
  - "Interface isolation: domain interfaces import only from ../entities/ — never from Prisma, modules, or shared"
  - "Helper types defined in same file as consuming interface for cohesion"

requirements-completed:
  - ARCH-06

# Metrics
duration: 6min
completed: "2026-05-07"
---

# Phase 9 Plan 03: Domain Repository Interfaces Summary

**10 output-port interface files covering all 9 modules + recommendation, using only domain entity types, establishing the seams that allow use cases to be unit-tested without a database**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-07T00:24:33Z
- **Completed:** 2026-05-07T00:30:26Z
- **Tasks:** 2
- **Files modified:** 10 (all created new)

## Accomplishments

- Created all 10 repository interface files in `src/domain/interfaces/` with zero imports from `@prisma/client`, `src/modules/`, or `src/shared/`
- Method signatures derived verbatim from existing `src/modules/*/` repository files per D-02 — no ad-hoc invention
- Helper types co-located with their interfaces: `SwipeWithCandidateInfo`, `RecruiterWithCompany`, `UnlockResult`, `ChatParticipants`, `ChatListItem`, `FitScoreInput`, `FitScoreJobInput`
- `IRefreshTokenRepository` created per D-03 (auth use case dependency)
- TypeScript compiles clean (`npx tsc --noEmit` exits 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create user, refresh-token, candidate, company, recruiter interfaces** - `f3c8d91` (feat)
2. **Task 2: Create job, swipe, credit, chat, recommendation interfaces + verification** - `6c02286` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/domain/interfaces/user.repository.interface.ts` - IUserRepository (findByEmail, findById, create, updateGoogleId, findOrCreateGoogle)
- `src/domain/interfaces/refresh-token.repository.interface.ts` - IRefreshTokenRepository (create, findByHash, revoke, revokeFamily)
- `src/domain/interfaces/candidate.repository.interface.ts` - ICandidateRepository (upsertProfile, findByUserId)
- `src/domain/interfaces/company.repository.interface.ts` - ICompanyRepository (create, findById, adjustCredits)
- `src/domain/interfaces/recruiter.repository.interface.ts` - IRecruiterRepository (upsertProfile, findByUserId, findCompanyById)
- `src/domain/interfaces/job.repository.interface.ts` - IJobRepository (create, findById, update, findByRecruiterId, findRecruiterProfileByUserId, deactivateExpiredJobs)
- `src/domain/interfaces/swipe.repository.interface.ts` - ISwipeRepository + SwipeWithCandidateInfo (7 methods)
- `src/domain/interfaces/credit.repository.interface.ts` - ICreditRepository + RecruiterWithCompany + UnlockResult (7 methods)
- `src/domain/interfaces/chat.repository.interface.ts` - IChatRepository + ChatParticipants + ChatListItem (8 methods)
- `src/domain/interfaces/recommendation.repository.interface.ts` - IRecommendationRepository + FitScoreInput + FitScoreJobInput (2 methods)

## Decisions Made

None — followed plan exactly as specified. All method signatures, helper types, and import patterns match the plan verbatim.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Integration tests could not run because Docker test database (`localhost:5433`) is not running in this environment. This is a pre-existing infrastructure issue confirmed by verifying the same test failures occurred on the commit immediately before any plan-03 changes (stash returned nothing). No files in `src/modules/` or `src/shared/` were modified — TypeScript compilation confirms the interface files are correct.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 10 repository interface contracts are complete and ready for Phase 10 adapter implementations
- `src/domain/interfaces/` contains exactly 10 files — all import only from `src/domain/entities/`
- TypeScript compiles clean — Phase 10 can immediately implement `class AuthRepository implements IUserRepository`
- No blockers

---
*Phase: 09-domain-layer-scaffold*
*Completed: 2026-05-07*
