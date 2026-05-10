---
phase: 13-cleanup-unit-test-layer
plan: 01
subsystem: cross-boundary import surgery
tags: [import-surgery, clean-architecture, wave-a, migration]
dependency_graph:
  requires: []
  provides:
    - src/application/utils/haversine.ts
    - src/adapters/services/chat.service.ts
    - src/adapters/services/credit.service.ts
    - src/adapters/services/recommendation.repository.ts
    - src/infrastructure/http/plugins/require-role.hook.ts
    - src/infrastructure/http/plugins/error-handler.ts
    - src/infrastructure/http/errors/app.error.ts
    - src/infrastructure/http/routes/health.routes.ts
  affects:
    - src/adapters/services/neo4j.adapter.ts
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/adapters/controllers/credits.controller.ts
    - src/infrastructure/http/plugins/authenticate.hook.ts
    - src/infrastructure/http/routes/chat.routes.ts
    - src/app.ts
    - src/infrastructure/http/routes/*.routes.ts (7 files)
    - tests/helpers/*.ts (3 files)
    - tests/integration/*.test.ts (6 files)
    - tests/unit/*.test.ts (4 files)
    - jest.config.ts
tech_stack:
  added: []
  patterns:
    - adapter-implements-port (ChatService, CreditService implement application ports)
    - verbatim-move-with-import-surgery (8 files moved, imports fixed)
    - DomainError replaces AppError in infrastructure hooks
key_files:
  created:
    - src/application/utils/haversine.ts
    - src/adapters/services/chat.service.ts
    - src/adapters/services/credit.service.ts
    - src/adapters/services/recommendation.repository.ts
    - src/infrastructure/http/plugins/require-role.hook.ts
    - src/infrastructure/http/plugins/error-handler.ts
    - src/infrastructure/http/errors/app.error.ts
    - src/infrastructure/http/routes/health.routes.ts
  modified:
    - src/adapters/services/neo4j.adapter.ts
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/adapters/controllers/credits.controller.ts
    - src/infrastructure/http/plugins/authenticate.hook.ts
    - src/infrastructure/http/routes/chat.routes.ts
    - src/app.ts
    - src/infrastructure/http/routes/admin.routes.ts
    - src/infrastructure/http/routes/candidate.routes.ts
    - src/infrastructure/http/routes/company.routes.ts
    - src/infrastructure/http/routes/credits.routes.ts
    - src/infrastructure/http/routes/job.routes.ts
    - src/infrastructure/http/routes/recruiter.routes.ts
    - src/infrastructure/http/routes/swipe.routes.ts
    - tests/helpers/factories.ts
    - tests/helpers/setup.ts
    - tests/helpers/neo4j-setup.ts
    - tests/integration/admin.test.ts
    - tests/integration/chat.test.ts
    - tests/integration/credits.test.ts
    - tests/integration/job-routes.test.ts
    - tests/integration/job.test.ts
    - tests/integration/recommendation.test.ts
    - tests/integration/swipe.test.ts
    - tests/unit/appError.test.ts
    - tests/unit/errorHandler.test.ts
    - tests/unit/job.scheduler.test.ts
    - tests/unit/recommendation.service.test.ts
    - jest.config.ts
decisions:
  - "credit.service.ts path fixed: adapters/services/ to application/ requires ../../ prefix for use-cases/credits/credits.constants (plan said ../ but that resolves to adapters/use-cases/ which does not exist)"
  - "IChatRouteService.sendMessage added explicitly: IChatPort only has createOrGetChat; chat.routes.ts WS handler calls sendMessage which was not in IChatPort or IChatRouteService — added to IChatRouteService inline declaration"
  - "job.test.ts rewritten to use 4 new use cases (CreateJob/UpdateJob/DeactivateJob/ListJobsByRecruiter) + adapter JobRepository instead of old JobService from modules/"
  - "recommendation.test.ts and recommendation.service.test.ts: FitScoreInput requires id field (added Phase 12-03) — added id: 'test-candidate' and id: 'test-job' to all factory defaults"
  - "Old service unit tests (auth/candidate/chat/company/credit/job/recruiter/swipe.service.test.ts) left in place — they still compile against modules/ which still exists; replacement is Wave C (plan 03)"
metrics:
  duration: 1333s
  completed_date: "2026-05-10T14:02:00Z"
  tasks_completed: 2
  files_created: 8
  files_modified: 28
---

# Phase 13 Plan 01: Source-Layer Import Surgery Summary

Wave A complete — fixed all 6 cross-boundary import chains that kept src/modules/ and src/shared/ alive in the TypeScript dependency graph. After this plan, `npm run build` exits 0 with zero references to `modules/` or `shared/` in the new-architecture source files and test helpers.

## What Was Done

**8 new files created** (moved from old directories with import surgery):
- `src/application/utils/haversine.ts` — pure math utility, moved from shared/utils/
- `src/adapters/services/recommendation.repository.ts` — implements IRecommendationRepository (moved from modules/, interface renamed)
- `src/adapters/services/chat.service.ts` — implements IChatPort (moved from modules/chat/, AppError→DomainError)
- `src/adapters/services/credit.service.ts` — implements IChatPort injection (moved from modules/credits/, AppError→DomainError, try/catch removed)
- `src/infrastructure/http/plugins/require-role.hook.ts` — Fastify preHandler hook (moved from shared/hooks/, AppError→DomainError)
- `src/infrastructure/http/plugins/error-handler.ts` — global error handler (moved from shared/errors/, import paths updated)
- `src/infrastructure/http/errors/app.error.ts` — AppError class (verbatim copy from shared/errors/AppError.ts)
- `src/infrastructure/http/routes/health.routes.ts` — GET /health route (moved from modules/health/, prisma import updated)

**13 source files updated** (import surgery only):
- `neo4j.adapter.ts`: RecommendationRepository from ./recommendation.repository
- `get-ranking.use-case.ts`: haversineKm from ../../utils/haversine
- `credits.controller.ts`: haversineKm from ../../application/utils/haversine
- `authenticate.hook.ts`: AppError replaced with DomainError
- `chat.routes.ts`: requireRole, IChatService→IChatPort, AppError→DomainError; sendMessage added to IChatRouteService
- `app.ts`: 5 surviving imports fixed (errorHandler, healthRoutes, CreditService, ChatService, getNeo4jDriver)
- 7 infrastructure route files: requireRole from ../plugins/require-role.hook

**15 test/config files updated**:
- 3 test helpers: prisma/getNeo4jDriver/RecommendationRepository from new paths
- 6 integration tests: prisma imports updated; job.test.ts rewritten to use new use cases
- 4 unit tests: appError, errorHandler, job.scheduler, recommendation.service — all updated to new paths
- jest.config.ts: @shared/ and @modules/ moduleNameMapper aliases removed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] credit.service.ts import path — ../use-cases/ resolves to adapters/use-cases/ not application/use-cases/**
- **Found during:** Task 1 Step D / npm run build
- **Issue:** Plan said `from '../use-cases/credits/credits.constants'` but from `adapters/services/` that resolves to `adapters/use-cases/` (does not exist)
- **Fix:** Used `from '../../application/use-cases/credits/credits.constants'` (correct relative path)
- **Files modified:** `src/adapters/services/credit.service.ts`
- **Commit:** bbaddca

**2. [Rule 2 - Missing Critical Functionality] IChatRouteService missing sendMessage method**
- **Found during:** Task 1 Step M / npm run build
- **Issue:** `IChatRouteService extends IChatPort` — but IChatPort only has `createOrGetChat`. The WS handler in chat.routes.ts calls `service.sendMessage()`. TypeScript error: property 'sendMessage' does not exist on type 'IChatRouteService'
- **Fix:** Added `sendMessage` declaration explicitly to `IChatRouteService` interface
- **Files modified:** `src/infrastructure/http/routes/chat.routes.ts`
- **Commit:** bbaddca

**3. [Rule 3 - Blocking] job.test.ts uses JobService from modules/ — no adapter equivalent exists**
- **Found during:** Task 2 Step E
- **Issue:** Plan said to update import to `src/adapters/services/job.service` but no such file exists. The plan correctly anticipated this and said "rewrite test to use use cases directly"
- **Fix:** Rewrote job.test.ts to use adapter `JobRepository` + 4 use case classes (CreateJob/UpdateJob/DeactivateJob/ListJobsByRecruiter)
- **Files modified:** `tests/integration/job.test.ts`
- **Commit:** 5589845

### Known Pre-existing Issue (not caused by this plan)

`tests/unit/credit.service.test.ts` fails with a type error at Jest runtime — `CreditRepository` type mismatch in the mock. This was introduced in Phase 12 when `ICreditRepository.findCandidateProfileById` return type changed. This file is scheduled for replacement in Wave C (plan 03). The tsc build passes; only the old jest-level mock type cast fails.

## Known Stubs

None. All new files have full implementations (verbatim copies from originals with import surgery applied).

## Self-Check: PASSED

All 8 new files exist and contain expected exports. Both commits (bbaddca, 5589845) exist in git log. Zero violations in `grep -rn "from.*shared/|from.*modules/" src/adapters/ src/application/ src/infrastructure/ src/app.ts`. npm run build exits 0.
