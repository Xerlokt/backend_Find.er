---
phase: 12-swipe-credits-recommendation-chat-migration
plan: "03"
subsystem: api
tags: [swipe, recommendation, neo4j, prisma, clean-architecture, fastify]

requires:
  - phase: 12-01
    provides: IChatPort (createOrGetChat) — used by RecordSwipeUseCase on LIKE direction
  - phase: 12-02
    provides: IRecommendationRepository (computeFitScore) — used by GetFeedUseCase and GetRankingUseCase

provides:
  - SwipeRepository adapter implementing ISwipeRepository (7 methods) with P2002 catch and avatarUrl flattening
  - RecordSwipeUseCase with candidate/job validation + IChatPort injection (zero @prisma/client)
  - GetFeedUseCase with cursor pagination + FitScoreInput { id } explicit construction (Pitfall 3)
  - GetRankingUseCase with recruiter ownership guard + DISLIKE censoring + haversineKm + fitScore sort
  - SwipeController with 3 handlers (recordSwipe, getFeed, getRanking) + DomainError catch
  - infrastructure swipe.routes.ts with DUAL EXPORT (swipeRoutes + swipeJobRoutes); /feed before /:jobId/ranking; rate limit max:30

affects:
  - 12-04 (app.ts wiring — imports swipeRoutes + swipeJobRoutes from infrastructure layer)
  - 13 (cleanup — old src/modules/swipe/ files deleted after app.ts swap verified)

tech-stack:
  added: []
  patterns:
    - "SwipeRepository.$transaction with P2002 catch: duplicate guard at adapter boundary, not use case"
    - "findSwipesByJobId avatarUrl flatten: candidate.user.avatarUrl → candidate.avatarUrl in SwipeWithCandidateInfo"
    - "FitScoreInput { id } required: use cases use 'satisfies FitScoreInput' to enforce id field presence (Pitfall 3)"
    - "Dual-export route file: swipeRoutes (POST /swipes) + swipeJobRoutes (GET /jobs/feed + GET /jobs/:jobId/ranking)"
    - "Static-before-parameterized: /feed registered before /:jobId/ranking in Fastify (Pitfall 1)"

key-files:
  created:
    - src/adapters/repositories/swipe.repository.ts
    - src/application/use-cases/swipe/record-swipe.use-case.ts
    - src/application/use-cases/swipe/get-feed.use-case.ts
    - src/application/use-cases/swipe/get-ranking.use-case.ts
    - src/adapters/controllers/swipe.controller.ts
    - src/infrastructure/http/routes/swipe.routes.ts
  modified: []

key-decisions:
  - "12-03: P2002 duplicate swipe caught inside prisma.$transaction in SwipeRepository — never bubbles to use case layer (clean separation; use case stays @prisma/client-free)"
  - "12-03: avatarUrl flattened from row.candidate.user.avatarUrl into SwipeWithCandidateInfo.candidate.avatarUrl at repository boundary — use cases never see nested Prisma structure"
  - "12-03: FitScoreInput requires id field (added in 12-02) — use cases use 'satisfies FitScoreInput' to enforce at compile time (Pitfall 3)"
  - "12-03: swipe.routes.ts DUAL EXPORT pattern — swipeRoutes (POST /swipes under /swipes prefix) + swipeJobRoutes (GET routes under /jobs prefix); same pattern as modules/swipe/swipe.routes.ts"
  - "12-03: /feed registered BEFORE /:jobId/ranking in swipeJobRoutes — Fastify static-before-parameterized rule (Pitfall 1); 'feed' would match as UUID param if /:jobId registered first"
  - "12-03: GetRankingUseCase DISLIKE censoring — profile: null unless direction === 'LIKE' || unlockedCandidateIds.has(candidateId); T-12-03-03 information disclosure mitigation"

patterns-established:
  - "SwipeRepository pattern: all 7 ISwipeRepository methods implemented inline with private toDomain helpers; no cross-module repository imports (ARCH-04)"
  - "Use case zero-Prisma pattern: RecordSwipeUseCase uses SwipeDirection domain type and 'MATCH' ChatInitiator string literal — zero @prisma/client imports (ARCH-07)"

requirements-completed: [ARCH-07, TEST-01]

duration: 3min
completed: 2026-05-09
---

# Phase 12 Plan 03: Swipe Module Migration Summary

**SwipeRepository adapter (7 methods, P2002 guard, avatarUrl flatten) + 3 swipe use cases with zero @prisma/client + dual-export infrastructure swipe.routes.ts with static-before-parameterized /feed route**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-09T18:27:21Z
- **Completed:** 2026-05-09T18:30:07Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments

- SwipeRepository implementing all 7 ISwipeRepository methods: P2002 caught inside $transaction → DomainError('DUPLICATE_SWIPE', 409); avatarUrl flattened from nested user relation in findSwipesByJobId; findFeedJobs excludes already-swiped jobs via `swipes: { none: { candidateId } }`; findUnlocksByJobAndCompany returns Set<string>
- 3 swipe use cases with zero @prisma/client imports: RecordSwipeUseCase (IChatPort injection, 'LIKE'/'MATCH' domain literals), GetFeedUseCase (cursor pagination + FitScoreInput { id } satisfies pattern), GetRankingUseCase (recruiter ownership guard + DISLIKE censoring T-12-03-03 + haversineKm + fitScore DESC sort)
- Dual-export infrastructure swipe.routes.ts: swipeRoutes (POST / with rate limit max:30) + swipeJobRoutes (/feed BEFORE /:jobId/ranking per Fastify registration-order rule); SwipeController with DomainError catch in all 3 handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: SwipeRepository adapter (7 methods with P2002 catch + avatarUrl mapping)** - `1690c45` (feat)
2. **Task 2: 3 swipe use cases + SwipeController + infrastructure swipe.routes.ts (dual-export)** - `143126b` (feat)

## Files Created

- `src/adapters/repositories/swipe.repository.ts` — SwipeRepository implementing ISwipeRepository with 7 methods; P2002 → DomainError; avatarUrl flatten; toDomain helpers inline
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — Candidate/job validation + IChatPort.createOrGetChat('MATCH') on LIKE; zero @prisma/client
- `src/application/use-cases/swipe/get-feed.use-case.ts` — Cursor pagination + computeFitScore with explicit FitScoreInput { id: candidate.id } satisfies pattern
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — Recruiter ownership guard + DISLIKE censoring + haversineKm + fitScore DESC sort + rank
- `src/adapters/controllers/swipe.controller.ts` — SwipeController({ neo4j, chat }) with recordSwipe/getFeed/getRanking handlers + DomainError catch
- `src/infrastructure/http/routes/swipe.routes.ts` — DUAL EXPORT: swipeRoutes (POST / rateLimit:30) + swipeJobRoutes (/feed before /:jobId/ranking)

## Decisions Made

- P2002 duplicate swipe caught at adapter boundary (inside SwipeRepository.$transaction) — use case layer stays @prisma/client-free per ARCH-07
- avatarUrl flattened at repository boundary: `row.candidate.user.avatarUrl` → `candidate.avatarUrl` in SwipeWithCandidateInfo — use cases see clean domain shape
- FitScoreInput { id } required field enforced via `satisfies FitScoreInput` TypeScript pattern — prevents Pitfall 3 regression
- /feed registered before /:jobId/ranking in Fastify — static route wins over parameterized; Zod UUID validation would reject 'feed' if order reversed (Pitfall 1)
- GetRankingUseCase DISLIKE censoring: profile = null unless LIKE or unlocked — T-12-03-03 information disclosure mitigation
- Old src/modules/swipe/ files NOT deleted — additive migration pattern; cleanup deferred to Phase 13; app.ts import swap in Plan 12-04

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all methods fully wired to Prisma queries and domain types.

## Threat Flags

No new threat surface introduced beyond what the plan's threat_model already documents.

## Next Phase Readiness

- Swipe module fully migrated: SwipeRepository + 3 use cases + SwipeController + infrastructure routes all committed and tsc-clean
- Ready for Plan 12-04: app.ts import swap — replace `modules/swipe/swipe.routes.ts` imports with `infrastructure/http/routes/swipe.routes.ts`; integration tests after swap
- IChatPort and IRecommendationRepository injection confirmed working at route level (opts pattern established)

---
*Phase: 12-swipe-credits-recommendation-chat-migration*
*Completed: 2026-05-09*
