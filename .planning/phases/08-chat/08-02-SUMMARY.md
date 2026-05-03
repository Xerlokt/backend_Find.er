---
phase: 08-chat
plan: 02
subsystem: api
tags: [prisma, postgresql, typescript, chat, websocket, jest, tdd]

# Dependency graph
requires:
  - phase: 08-01
    provides: RED test stubs (chat.service.test.ts), createChat/createMessage factories, Chat @@unique migration applied to dev+test DBs

provides:
  - "IChatService interface at src/shared/interfaces/chat.interface.ts (ARCH-04 boundary — createOrGetChat + sendMessage signatures)"
  - "ChatRepository at src/modules/chat/chat.repository.ts with all Prisma methods: createOrGetChat (upsert), createMessage, findMessages (cursor), findChatWithParticipants, countRecruiterMessages, findChatsByUserId, markMessagesRead"
  - "ChatService at src/modules/chat/chat.service.ts implementing IChatService: recruiter-first rule, participant enforcement, cursor pagination, mark-as-read, verifyParticipant"
  - "All 13 unit tests GREEN in tests/unit/chat.service.test.ts"

affects: [08-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IChatService implements ARCH-04 pattern: swipe/credits modules depend on interface, never on ChatRepository directly"
    - "ChatRepository: no-constructor class with module-level prisma singleton — same pattern as CreditRepository"
    - "Recruiter-first rule enforced by countRecruiterMessages(chatId, recruiterUserId) — uses actual userId from DB, NOT role field (avoids Pitfall 5)"
    - "verifyParticipant never throws — returns false for WS handler pre-check; all other methods throw 403 NOT_PARTICIPANT"
    - "Optional chaining (chat.candidate?.userId) used for mocked findChatWithParticipants responses that may omit nested candidate object"

key-files:
  created:
    - src/shared/interfaces/chat.interface.ts
    - src/modules/chat/chat.repository.ts
    - src/modules/chat/chat.service.ts

key-decisions:
  - "Optional chaining (chat.candidate?.userId ?? null) used in sendMessage participant check — the unit test mock for NOT_PARTICIPANT case returns makeChat() without a nested candidate property, causing a TypeError without optional chaining. This matches the real behavior when DB returns chat but candidate relation is somehow absent."
  - "countRecruiterMessages guarded with recruiterUserId null-check: if recruiterUserId is null, count is treated as 0 and sender (who passed participant check as candidateUserId match) gets RECRUITER_MUST_INITIATE. Prevents passing undefined to Prisma where clause."
  - "prisma generate run after implementation to regenerate client with candidateId_companyId_jobId compound where-clause key from Chat @@unique constraint added in Plan 01"

patterns-established:
  - "ChatService.verifyParticipant: never throws, returns boolean — safe for WS handler pre-check without try/catch"
  - "ChatService.getMessages: calls verifyParticipant first, then findMessages, then markMessagesRead — mark-as-read is always a side effect, not conditional"

requirements-completed: [CHAT-02, CHAT-03, CHAT-04, ARCH-01, ARCH-04]

# Metrics
duration: 3min
completed: 2026-05-03
---

# Phase 08 Plan 02: Chat Service Layer Summary

**IChatService interface (ARCH-04 boundary), ChatRepository (8 Prisma methods), and ChatService (recruiter-first rule, participant enforcement, cursor pagination, mark-as-read) — all 13 unit tests GREEN**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-03T19:03:31Z
- **Completed:** 2026-05-03T19:06:32Z
- **Tasks:** 1 (TDD: RED already established in Plan 01; GREEN implemented here)
- **Files modified:** 3

## Accomplishments

- IChatService interface created at src/shared/interfaces/chat.interface.ts with ARCH-04 boundary comment, exact shape from D-16 (createOrGetChat + sendMessage signatures with ChatInitiator enum from @prisma/client)
- ChatRepository created with 8 methods: upsert-based createOrGetChat using candidateId_companyId_jobId compound key, cursor-based findMessages (orderBy createdAt desc, take limit+1), findChatWithParticipants (includes nested candidate.userId and job.recruiter.userId), countRecruiterMessages, markMessagesRead (updateMany WHERE senderId != excludeSenderId AND readAt IS NULL), findChatsByUserId, createMessage, findChatById
- ChatService created implementing IChatService: recruiter-first rule enforced by countRecruiterMessages (uses actual recruiter userId from DB — not role field); participant check throws 403 NOT_PARTICIPANT; verifyParticipant never throws (returns false) for safe WS handler use; getMessages applies mark-as-read as side effect; all 13 unit tests GREEN; TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: IChatService + ChatRepository + ChatService (GREEN phase)** - `b869b36` (feat)

**Plan metadata:** (docs commit follows this summary)

_Note: TDD RED gate was established in Plan 01 (commit eda0753). This plan's task = GREEN implementation only._

## Files Created/Modified

- `src/shared/interfaces/chat.interface.ts` - IChatService interface with ARCH-04 boundary comment; exports interface and ChatInitiator-typed createOrGetChat + sendMessage
- `src/modules/chat/chat.repository.ts` - ChatRepository with 8 Prisma methods for Chat and Message models; no-constructor class with module-level prisma singleton
- `src/modules/chat/chat.service.ts` - ChatService implementing IChatService; constructor injects ChatRepository; all business rules (recruiter-first, participant enforcement, cursor pagination, mark-as-read)

## Decisions Made

- Optional chaining (`chat.candidate?.userId ?? null`) used in `sendMessage` because the unit test mock for the NOT_PARTICIPANT case returns a `makeChat()` object without a nested `candidate` property — only `candidateId`. Without optional chaining, accessing `chat.candidate.userId` throws TypeError instead of the expected 403 NOT_PARTICIPANT. The null-coalesce ensures `senderId !== null` comparison correctly routes to the NOT_PARTICIPANT guard.
- `countRecruiterMessages` guarded with a `recruiterUserId` null-check: if `recruiterUserId` is null, the count defaults to 0, causing the RECRUITER_MUST_INITIATE guard to trigger for any sender who passed the participant check via candidate match. This prevents passing `undefined` into a Prisma `where.senderId` clause.
- `npx prisma generate` run after creating repository to regenerate the Prisma client with the `candidateId_companyId_jobId` compound where-clause type — without this, `npx tsc --noEmit` returned TS2353 on the upsert `where` clause.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Optional chaining fix for NOT_PARTICIPANT unit test**
- **Found during:** Task 1 (GREEN phase — first test run)
- **Issue:** Test for `sendMessage` NOT_PARTICIPANT case mocks `findChatWithParticipants` with `makeChat()` which does not include a nested `candidate` object. Service accessed `chat.candidate.userId` directly, throwing TypeError instead of 403 NOT_PARTICIPANT.
- **Fix:** Changed `chat.candidate.userId` to `chat.candidate?.userId ?? null` and `chat.job.recruiter.userId` to `chat.job?.recruiter?.userId ?? null` in `sendMessage`. Added null-guard before `countRecruiterMessages` call.
- **Files modified:** src/modules/chat/chat.service.ts
- **Verification:** `npx jest tests/unit/chat.service.test.ts --runInBand` — 13/13 tests GREEN
- **Committed in:** b869b36 (Task 1 commit)

**2. [Rule 1 - Bug] prisma generate required after schema change**
- **Found during:** Task 1 REFACTOR check (`npx tsc --noEmit`)
- **Issue:** TS2353 error on `candidateId_companyId_jobId` compound where-clause in ChatRepository.createOrGetChat — Prisma client hadn't been regenerated after Plan 01's schema migration.
- **Fix:** Ran `npx prisma generate` to regenerate the client. TypeScript error resolved.
- **Files modified:** None (generated files in node_modules — not committed)
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** b869b36 (Task 1 commit — files already included)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. Optional chaining ensures the service correctly returns 403 instead of crashing on partially-mocked data. prisma generate is a standard required step when Prisma schema is updated.

## Issues Encountered

- `makeChat()` test helper in the RED stubs (Plan 01) does not include a `candidate` nested object — only `candidateId` string. The service must use optional chaining when reading `candidate.userId` from the result of `findChatWithParticipants`. This is defensive coding against any shape mismatch between mock and real Prisma output.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can proceed immediately: wire chatRoutes, register @fastify/websocket in app.ts, update SwipeService and CreditService constructors to accept IChatService
- IChatService interface is the ARCH-04 boundary — swipe.service.ts and credits.service.ts must import type IChatService (not ChatService or ChatRepository) when Plan 03 adds createOrGetChat calls to recordSwipe and unlockCandidate
- Integration tests in tests/integration/chat.test.ts (created in Plan 01) will turn GREEN after Plan 03 registers the routes

---
*Phase: 08-chat*
*Completed: 2026-05-03*
