---
phase: 12-swipe-credits-recommendation-chat-migration
plan: "04"
subsystem: infra
tags: [app-ts, composition-root, neo4j, clean-architecture, migration]

requires:
  - phase: 12-01
    provides: ChatRepository adapter, chat use cases, ChatController, infrastructure chat.routes.ts
  - phase: 12-02
    provides: Neo4jAdapter, CreditRepository adapter, credits use cases, CreditsController, infrastructure credits.routes.ts
  - phase: 12-03
    provides: SwipeRepository adapter, swipe use cases, SwipeController, dual-export infrastructure swipe.routes.ts

provides:
  - "app.ts composition root wired to infrastructure/adapter layers for all 4 migrated modules"
  - "Neo4jAdapter instantiated at composition root and injected into swipeRoutes + swipeJobRoutes"
  - "ChatService and CreditService from modules/ updated to accept domain repository interfaces"
  - "All 134 integration tests pass with zero regressions"

affects: [phase-13-cleanup, any future app.ts changes]

tech-stack:
  added: []
  patterns:
    - "Composition root pattern: Neo4jAdapter instantiated once in app.ts, injected via opts"
    - "Interface-based construction: module services now accept domain repository interfaces (IChatRepository, ICreditRepository)"

key-files:
  created: []
  modified:
    - src/app.ts
    - src/modules/chat/chat.service.ts
    - src/modules/credits/credits.service.ts
    - src/modules/credits/credits.routes.ts
    - tests/unit/chat.service.test.ts

key-decisions:
  - "ChatService constructor typed to IChatRepository (not concrete ChatRepository from modules/) — enables adapter swap without changing service"
  - "CreditService constructor typed to ICreditRepository — same adapter-agnostic pattern"
  - "modules/credits/credits.routes.ts updated to use adapter CreditRepository — required by CreditService ICreditRepository constraint"
  - "IChatRepository method names (findParticipants, findByUserId, findById) differ from old modules/chat repo names — chat.service.test.ts updated to use new interface"
  - "ChatService.sendMessage refactored to use findParticipants returning ChatParticipants flat object (not nested Prisma structure)"
  - "ChatService.listChats refactored to use findByUserId returning ChatListItem flat object with candidateName/companyName fields"

patterns-established:
  - "Module services accept domain interfaces, never concrete adapter implementations"
  - "Composition root (app.ts) is the single instantiation point for all adapters"

requirements-completed: [ARCH-07, TEST-01]

duration: 26min
completed: 2026-05-09
---

# Phase 12 Plan 04: App.ts Composition Root Swap Summary

**All 4 modules wired to Clean Architecture layers in app.ts: swipe/credits/chat routes from infrastructure/, repositories from adapters/, Neo4jAdapter injected into swipe routes — 134 integration tests green**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-05-09T18:35:00Z
- **Completed:** 2026-05-09T19:00:49Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Swapped all 4 module imports in `src/app.ts` from `modules/` to `infrastructure/http/routes/` and `adapters/repositories/`
- Instantiated `Neo4jAdapter` at composition root and injected `neo4j: neo4jAdapter` into both `swipeRoutes` and `swipeJobRoutes`
- Updated `ChatService` and `CreditService` to accept domain repository interfaces (`IChatRepository`, `ICreditRepository`) instead of concrete old modules/ repositories
- All 134 integration tests pass; zero regressions; `tsc --noEmit` exits 0; zero `@prisma/client` imports in `application/use-cases/` or `application/ports/`

## Task Commits

Each task was committed atomically:

1. **Task 1: Update app.ts import paths and add Neo4jAdapter composition** - `5509bc5` (feat)
2. **Task 2: Run full integration test suite and verify tests green** - `d1c5dab` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/app.ts` — Import paths swapped to infrastructure/adapter layers; Neo4jAdapter instantiated and injected
- `src/modules/chat/chat.service.ts` — Constructor typed to `IChatRepository`; `sendMessage` uses `findParticipants`; `listChats` uses `findByUserId` with `ChatListItem` shape
- `src/modules/credits/credits.service.ts` — Constructor typed to `ICreditRepository`
- `src/modules/credits/credits.routes.ts` — CreditRepository import updated to adapter; `avatarUrl` access flattened (no longer `user.avatarUrl`)
- `tests/unit/chat.service.test.ts` — Mock updated to `jest.Mocked<IChatRepository>`; old method names replaced with new interface names

## Decisions Made

- `ChatService` and `CreditService` from `modules/` were kept intact (not deleted) — they still serve `adminRoutes` via `ICreditGrantPort`. Only their constructor types were widened to domain interfaces.
- `IChatRepository` method names (`findParticipants`, `findByUserId`, `findById`) differ from the old `modules/chat/chat.repository` names — this is by design: the domain interface uses cleaner names and the service now uses them.
- `modules/credits/credits.routes.ts` (old, no longer imported by app.ts) was updated to use the adapter `CreditRepository` to keep TypeScript compilation clean across the whole project.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ChatService constructor typed to concrete old ChatRepository — prevents adapter swap**
- **Found during:** Task 1 (TypeScript compilation after app.ts import swap)
- **Issue:** `new ChatService(chatRepo)` in app.ts failed tsc because `adapters/repositories/chat.repository.ChatRepository` has different method names (`findById`, `findParticipants`, `findByUserId`) vs the old modules/ repo (`findChatById`, `findChatWithParticipants`, `findChatsByUserId`). `ChatService` was typed to accept the old concrete class.
- **Fix:** Updated `ChatService` constructor to accept `IChatRepository` (domain interface); refactored `sendMessage` to call `findParticipants()` (returns flat `ChatParticipants` object); refactored `listChats` to call `findByUserId()` (returns `ChatListItem[]` with flat fields).
- **Files modified:** `src/modules/chat/chat.service.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `5509bc5` (Task 1 commit)

**2. [Rule 1 - Bug] CreditService constructor typed to concrete old CreditRepository — prevents adapter swap**
- **Found during:** Task 1 (TypeScript compilation after app.ts import swap)
- **Issue:** `new CreditService(creditRepo, chatService)` failed tsc because adapter's `findCandidateProfileById` returns `CandidateProfile & { avatarUrl }` (flat) but old repo returns a nested Prisma type with `user.avatarUrl`. `CreditService` was typed to accept the old concrete class.
- **Fix:** Updated `CreditService` constructor to accept `ICreditRepository` (domain interface).
- **Files modified:** `src/modules/credits/credits.service.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `5509bc5` (Task 1 commit)

**3. [Rule 1 - Bug] modules/credits/credits.routes.ts still importing old CreditRepository after CreditService interface change**
- **Found during:** Task 1 (TypeScript compilation — tsc checks all project files)
- **Issue:** `modules/credits/credits.routes.ts` (no longer imported by app.ts, but still compiled) was creating `new CreditRepository()` from old modules/ repo and passing it to `CreditService` which now expects `ICreditRepository`. Old repo's `findCandidateProfileById` returns nested Prisma type that doesn't satisfy `ICreditRepository`. Also accessed `candidateProfile.user.avatarUrl` which doesn't exist on the new flat shape.
- **Fix:** Updated import to use `adapters/repositories/credit.repository`; changed `candidateProfile.user.avatarUrl` → `candidateProfile.avatarUrl`.
- **Files modified:** `src/modules/credits/credits.routes.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `5509bc5` (Task 1 commit)

**4. [Rule 1 - Bug] chat.service unit test mocking old ChatRepository interface (wrong method names)**
- **Found during:** Task 2 (integration test run — unit test suite included in pattern match)
- **Issue:** `tests/unit/chat.service.test.ts` mocked `jest.Mocked<ChatRepository>` with old method names (`findChatWithParticipants`, `findChatsByUserId`). After ChatService switched to `IChatRepository`, these names no longer exist — TypeScript compile error in test.
- **Fix:** Rewrote mock to `jest.Mocked<IChatRepository>`; updated all mock setups to use `findParticipants` and `findByUserId`; added `listChats` tests for the new `ChatListItem` shape; updated assertions to match flat `ChatParticipants` structure.
- **Files modified:** `tests/unit/chat.service.test.ts`
- **Verification:** All unit + integration tests pass (134 integration, unit suite clean)
- **Committed in:** `d1c5dab` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — type mismatch bugs cascading from planned interface changes)
**Impact on plan:** All fixes necessary for TypeScript correctness. The interface changes to ChatService/CreditService constructors are actually aligned with Phase 13's cleanup goals — accelerating the module decoupling. No scope creep.

## Issues Encountered

- Docker containers were stopped at test run time — started with `docker compose up -d` before running the test suite. This is an environment issue, not a code issue.

## Known Stubs

None — all routes are fully wired; no placeholder data or hardcoded responses.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. app.ts is composition-only (no new trust boundaries).

## Next Phase Readiness

- Phase 12 migration complete: all 4 modules (chat, credits, swipe, recommendation) fully wired through Clean Architecture layers
- Phase 13 (Cleanup + Unit Test Layer) can now safely delete `modules/swipe/`, `modules/credits/credits.repository.ts`, `modules/chat/chat.repository.ts`, and `modules/chat/chat.routes.ts` — they are no longer imported anywhere
- `CreditService` and `ChatService` from modules/ are still needed until Phase 13 migrates adminRoutes to use the new application-layer use cases

## Self-Check: PASSED

All files verified present. All commits verified in git log.

- FOUND: src/app.ts
- FOUND: src/modules/chat/chat.service.ts
- FOUND: src/modules/credits/credits.service.ts
- FOUND: 12-04-SUMMARY.md
- FOUND: commit 5509bc5 (Task 1)
- FOUND: commit d1c5dab (Task 2)
- FOUND: commit c8b24b5 (docs/metadata)

---
*Phase: 12-swipe-credits-recommendation-chat-migration*
*Completed: 2026-05-09*
