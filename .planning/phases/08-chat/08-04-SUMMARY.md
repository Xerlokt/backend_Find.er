---
phase: 08-chat
plan: 04
subsystem: testing
tags: [websocket, fastify, prisma, jest, supertest, integration-tests]

# Dependency graph
requires:
  - phase: 08-03
    provides: chat.routes.ts WS gateway, app.ts wiring, IChatService injection into swipe/credits
  - phase: 08-02
    provides: ChatService with verifyParticipant, sendMessage (RECRUITER_MUST_INITIATE), markMessagesRead
  - phase: 08-01
    provides: Chat/Message Prisma models, factories (createChat, createMessage, createSwipe)
provides:
  - "12 real integration tests for chat module — zero stub assertions (except permitted idempotency stub)"
  - "WS injectWS tests: connect, close 1008, RECRUITER_MUST_INITIATE, message persistence, INVALID_PAYLOAD"
  - "REST tests: credit unlock returns chatId string, GET messages marks readAt in DB"
affects: [future-chat-features, ws-protocol-changes, credit-unlock-changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "app.injectWS cast to ws.WebSocket via (as unknown as WS) to resolve TypeScript DOM WebSocket type conflict"
    - "WS test pattern: injectWS → once('message') in Promise → ws.terminate() — no open handles"
    - "Persist-before-broadcast confirmation: await broadcast echo then prisma.message.count for DB assertion"
    - "Close code 1008 test: injectWS resolves (upgrade succeeds), then ws.on('close') captures code sent by handler"

key-files:
  created: []
  modified:
    - tests/integration/chat.test.ts

key-decisions:
  - "WS type cast (as unknown as WS) required — @fastify/websocket injectWS return type resolves to DOM WebSocket in test tsconfig (types: [jest, node]); explicit cast to ws.WebSocket fixes .once/.on/.terminate TS errors"
  - "DISLIKE swipe prerequisite for unlock test — credits.service.ts line 23 checks direction === DISLIKE before allowing unlock; test must call createSwipe with direction: DISLIKE before POST /unlock"
  - "Broadcast echo await confirms DB write — persist-before-broadcast design means receiving echo guarantees message was committed; setTimeout 100ms settle for Prisma transaction flush"

patterns-established:
  - "injectWS pattern: always cast to ws.WebSocket, always call ws.terminate() to prevent Jest open handles"
  - "WS message assertion pattern: wrap ws.once('message') + ws.send() in single Promise to avoid race"
  - "readAt mark-as-read test: insert message via factory, fetch via REST as other participant, query prisma.message.findUnique to assert readAt not null"

requirements-completed: [CHAT-01, CHAT-02, CHAT-03]

# Metrics
duration: 10min
completed: 2026-05-04
---

# Phase 08 Plan 04: Chat Gap Closure Summary

**Real integration tests replacing 7 stubs: WS connect/reject/recruiter-first/persistence/invalid-payload + credit unlock chatId + readAt mark-as-read — all 12 tests GREEN**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-04T00:22:18Z
- **Completed:** 2026-05-04T00:32:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Replaced credit unlock stub: POST /jobs/:jobId/candidates/:candidateId/unlock now asserts 201 + typeof chatId === 'string' with real HTTP request
- Replaced all 5 WS stubs: connect (broadcast round-trip), close 1008 (non-participant), RECRUITER_MUST_INITIATE (candidate first), message persistence (prisma.message.count), INVALID_PAYLOAD (malformed JSON)
- Replaced readAt stub: GET /chats/:chatId/messages marks DB readAt on other-participant messages, verified via prisma.message.findUnique

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace credit unlock stub with real integration test** - `ea8c3cb` (test)
2. **Task 2: Replace all WebSocket stubs with real integration tests** - `2f38335` (test)
3. **Task 3: Replace readAt mark stub and run full suite green** - `a4446d4` (test)

## Files Created/Modified

- `tests/integration/chat.test.ts` - Replaced 7 stub tests with real assertions; added `import type { WebSocket as WS } from 'ws'`; all 12 tests pass

## Decisions Made

- WS type cast `as unknown as WS` required due to TypeScript resolving `injectWS` return as DOM `WebSocket` (no `once`/`terminate`) under `tsconfig.test.json` with `types: [jest, node]`
- `createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })` prerequisite added for unlock test — credits.service guards unlock on swipe.direction === 'DISLIKE'
- Await broadcast echo (not raw setTimeout) as primary confirmation of DB write, with 100ms settle for Prisma transaction flush
- `injectWS` upgrade resolves before handler body runs — close 1008 arrives as 'close' event after upgrade, not as rejected Promise

## Deviations from Plan

None — plan executed exactly as written. All test bodies matched the plan's provided implementations. The only fix was applying `as unknown as WS` type cast to each `injectWS` call (the plan noted the correct WS usage patterns; TypeScript ambient type conflict required the cast, which is a standard workaround for this tsconfig setup).

## Issues Encountered

- **TypeScript DOM WebSocket conflict:** `injectWS` return typed as DOM `WebSocket` (no `once`/`terminate`) under test tsconfig. Fix: `import type { WebSocket as WS } from 'ws'` + `as unknown as WS` cast on each `injectWS` call. Verified — all TS errors resolved, tests compile and pass.
- **Missing `.env` in worktree:** Worktree had no `.env`, causing `DATABASE_URL_TEST` to be undefined and `prisma migrate deploy` to fail in `setup.ts`. Fix: copied `.env` from main project dir to worktree. Tests then ran successfully.

## Known Stubs

- Line 68: `expect(true).toBe(true)` — idempotency stub for "chatId is idempotent: same LIKE on same job returns same chatId". Explicitly excluded from this gap closure per VERIFICATION.md "Info" severity. The swipe endpoint returns 409 on duplicate, so the chatId idempotency is covered structurally; a future plan can test the 409 path if needed.

## Next Phase Readiness

- All 3 chat requirements (CHAT-01, CHAT-02, CHAT-03) validated at integration level with real assertions
- Phase 08 Chat module is fully tested end-to-end — WS, REST, persistence, access control
- Project v1.0 milestone complete

---
*Phase: 08-chat*
*Completed: 2026-05-04*
