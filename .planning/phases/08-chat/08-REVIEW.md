---
phase: 08-chat
reviewed: 2026-05-03T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/shared/interfaces/chat.interface.ts
  - src/modules/chat/chat.repository.ts
  - src/modules/chat/chat.service.ts
  - src/modules/chat/chat.routes.ts
  - src/app.ts
  - src/modules/swipe/swipe.service.ts
  - src/modules/swipe/swipe.routes.ts
  - src/modules/credits/credits.service.ts
  - src/modules/credits/credits.routes.ts
  - prisma/schema.prisma
  - tests/unit/chat.service.test.ts
  - tests/integration/chat.test.ts
  - tests/helpers/factories.ts
  - tests/unit/swipe.service.test.ts
  - tests/unit/credit.service.test.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase implements the full chat domain: a `ChatRepository`, `ChatService`, `IChatService` boundary interface, WebSocket + REST routes, and wires the chat service into swipe and credits modules at the composition root. The architecture is clean — the module boundary interface (ARCH-04) is correctly used and no module imports another module's internals directly.

Two critical issues were found: an unchecked null-dereference in `ChatService.verifyParticipant` that will crash if the chat's `candidate` or `job.recruiter` relation is absent (which Prisma returns as `null` for missing related records), and a content-length bypass in the WebSocket handler where the `content` field length is validated by Zod before JSON parsing, but the raw `rawData` buffer itself is never size-capped, opening a memory DoS vector.

Five warnings cover: the in-memory WebSocket connection store being incompatible with multi-process deployments with no documentation of the limitation; a TOCTOU race condition in the credits unlock flow that creates a chat even when `executeUnlock` fails; a missing role guard on the WebSocket route that allows ADMIN-role users to join chats; the `listChats` method performing unchecked property access on `chat.candidate` and `chat.job.company` that will throw if relations are missing; and the integration test suite being mostly stubs with no real WS assertions, leaving the critical recruiter-first rule untested at the integration level.

---

## Critical Issues

### CR-01: Null dereference crash in `ChatService.verifyParticipant`

**File:** `src/modules/chat/chat.service.ts:56-58`

**Issue:** `verifyParticipant` dereferences `chat.candidate.userId` and `chat.job.recruiter.userId` without null guards. The `findChatWithParticipants` query uses `include` with nested selects, but Prisma returns `null` for a relation if the foreign key points to a deleted or missing row (e.g., a cascaded delete left a dangling chat). When that happens, `chat.candidate.userId` throws `TypeError: Cannot read properties of null (reading 'userId')`, which bubbles up as an unhandled 500.

Contrast this with `sendMessage` (lines 34–35) which correctly uses optional chaining and null coalescing (`chat.candidate?.userId ?? null`) before accessing the same nested fields — `verifyParticipant` was written without that guard.

**Fix:**
```typescript
async verifyParticipant(chatId: string, userId: string): Promise<boolean> {
  const chat = await this.repo.findChatWithParticipants(chatId)
  if (!chat) return false
  const candidateUserId = chat.candidate?.userId ?? null
  const recruiterUserId = chat.job?.recruiter?.userId ?? null
  if (!candidateUserId || !recruiterUserId) return false
  return userId === candidateUserId || userId === recruiterUserId
}
```

---

### CR-02: Unbounded WebSocket message buffer — memory DoS

**File:** `src/modules/chat/chat.routes.ts:95`

**Issue:** The pending-message buffer (`const pending: Buffer[] = []`) collects raw `Buffer` objects from the WebSocket `message` event with no size cap. A malicious client can send many large frames during the async participant-check window, filling the buffer without limit. The `content` field is capped at 5 000 chars by `IncomingMessageSchema`, but that check only runs inside `handleMessage` — after the frame is already stored in memory. The `rawData` itself has no cap, so a client can send a single frame of arbitrary size (up to whatever the underlying `ws` library allows, typically 100 MB by default) or many frames during the async await window.

**Fix:** Add a total byte cap on the pending buffer and drop the connection if it is exceeded:

```typescript
const pending: Buffer[] = []
let pendingBytes = 0
const MAX_PENDING_BYTES = 64 * 1024 // 64 KB ceiling during auth window

socket.on('message', (data) => {
  const buf = data as Buffer
  pendingBytes += buf.byteLength
  if (pendingBytes > MAX_PENDING_BYTES) {
    socket.close(1009, 'Message too large')
    return
  }
  pending.push(buf)
})
```

Also configure the `ws` server's `maxPayload` at plugin registration level to enforce a per-frame limit globally.

---

## Warnings

### WR-01: TOCTOU — chat created even when `executeUnlock` fails

**File:** `src/modules/credits/credits.service.ts:31-53`

**Issue:** `unlockCandidate` calls `this.repo.executeUnlock(...)` first, and if it succeeds, then calls `this.chat.createOrGetChat(...)`. However, if `executeUnlock` throws a non-`P2002`/non-`INSUFFICIENT_CREDITS` error (e.g., a network error, a Prisma timeout, or any unknown exception), the method re-throws at line 43 before reaching `createOrGetChat`, so the unlock is partially committed (the DB transaction in `executeUnlock` determines what was actually written) while no chat is opened. The inverse is also worth noting: if `createOrGetChat` throws _after_ a successful unlock, the chat is never created but the credits have been deducted. The two operations are not atomic.

The severity is Warning rather than Critical because `createOrGetChat` uses an upsert (idempotent) and the credits operation is in its own Prisma transaction, so the failure window is narrow — but the inconsistency is real and observable.

**Fix:** Wrap both operations in a single coordinated flow. Since `createOrGetChat` is idempotent, a background retry or a compensating read at the chat-list level is sufficient mitigation. Minimally, catch errors from `createOrGetChat` and log them without re-throwing so the unlock response is not lost:

```typescript
const unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)

let chatId: string | null = null
try {
  const result = await this.chat.createOrGetChat(
    candidateId,
    recruiter.companyId,
    jobId,
    ChatInitiator.CREDIT,
  )
  chatId = result.chatId
} catch (chatErr) {
  // Log and continue — unlock succeeded; chat can be re-created idempotently later
  console.error('[CreditService] Failed to open chat after unlock', chatErr)
}

return { ...unlock, chatId }
```

---

### WR-02: WebSocket route lacks role guard — ADMIN can join chats

**File:** `src/modules/chat/chat.routes.ts:86-88`

**Issue:** The `/chats/:chatId/ws` route only applies `authenticate` in `preHandler`. The comment on line 88 notes that the participant check runs in the handler body, but that check only verifies whether the user's ID matches a `candidateId` or a `recruiterUserId` in that chat. An `ADMIN`-role user whose ID happens to match neither participant will be correctly rejected, but an ADMIN user who was previously a candidate (or whose `userId` was stored as a participant) will be accepted. More practically, if an ADMIN token is used to hit this endpoint, no role error is surfaced — the participant check is the only gate.

The REST endpoints at lines 68 and 77 explicitly use `requireRole('CANDIDATE', 'RECRUITER')`. The WS endpoint should be consistent.

**Fix:**
```typescript
app.get('/:chatId/ws', {
  websocket: true,
  preHandler: [authenticate, requireRole('CANDIDATE', 'RECRUITER')],
}, async (socket: WebSocket, request) => {
```

---

### WR-03: Unchecked relation access in `ChatService.listChats`

**File:** `src/modules/chat/chat.service.ts:83-94`

**Issue:** The `listChats` method accesses `chat.candidate.userId`, `chat.job.company.name`, and `chat.candidate.name` without null guards (lines 91-93). If a chat's candidate or recruiter relation is missing (soft-deleted profile, referential integrity gap), the `.map` will throw. The Prisma query at line 57 in `chat.repository.ts` uses `include` without selecting only non-null fields, so absent relations return `null`.

Unlike `verifyParticipant` (CR-01), this is a Warning rather than Critical because `listChats` is a read path that affects only the authenticated user's own data, and cascades in the schema (`onDelete: Cascade` on `CandidateProfile`) reduce the likelihood of orphan chats.

**Fix:**
```typescript
otherParticipantName:
  chat.candidate?.userId === userId
    ? chat.job?.company?.name ?? 'Unknown Company'
    : chat.candidate?.name ?? 'Unknown Candidate',
```

---

### WR-04: `SwipeService.recordSwipe` passes `candidate.id` to `createOrGetChat` but `candidateId` in the `Chat` schema is the `CandidateProfile.id`, not the `User.id`

**File:** `src/modules/swipe/swipe.service.ts:55-61`

**Issue:** On a LIKE swipe, `recordSwipe` calls:
```typescript
await this.chat.createOrGetChat(
  candidate.id,   // CandidateProfile.id — correct
  job.companyId,
  jobId,
  ChatInitiator.MATCH,
)
```

`candidate.id` here is the `CandidateProfile.id`, which matches the `Chat.candidateId` column in the schema (which references `CandidateProfile`). This is correct.

However, in `ChatService.sendMessage` (line 38), the participant check compares `senderId` (which is the `User.id` from the JWT) against `chat.candidate?.userId` (also a `User.id`). The two ID namespaces are consistent with each other. The warning is that the naming is confusing — both `candidateId` parameters look like profile IDs but the chat participant check uses user IDs — and this mismatch in naming convention is a latent source of bugs.

Specifically in `credits.service.ts:46-51`, `candidateId` (a profile ID) is passed as the first argument to `createOrGetChat`. If the `candidateId` argument ever gets confused with a user ID at a call site (e.g., a future refactor passes `request.user.id` instead of `candidate.id`), the chat would be created with the wrong participant and the participant check in `sendMessage` would silently fail.

**Fix:** Rename the parameter in `IChatService.createOrGetChat` to `candidateProfileId` and update all call sites to make the ID namespace explicit:
```typescript
export interface IChatService {
  createOrGetChat(
    candidateProfileId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }>
}
```

---

### WR-05: Integration test suite is mostly stubs — critical paths untested

**File:** `tests/integration/chat.test.ts:65-158`

**Issue:** The majority of the integration test cases are stubs (`expect(true).toBe(true)`). The following business-critical scenarios have no real assertions:
- Chat auto-created on credit unlock (line 71-78)
- Recruiter-first rule via WebSocket (line 82-87)
- WebSocket connection establishment and rejection (lines 89-99)
- Message persistence after WebSocket send (lines 101-110)
- Invalid WebSocket payload handling (lines 107-110)
- `readAt` marking on message fetch (lines 141-144)

Only 3 of the 10 `it` blocks contain real assertions. The recruiter-first rule (`RECRUITER_MUST_INITIATE`) is covered in unit tests but not at the integration level, meaning an error in the route layer (e.g., incorrect user ID extraction from the JWT vs. the participant check) would not be caught.

**Fix:** Implement real WebSocket test cases using the `ws` npm package (or `@fastify/websocket`'s test utilities) for the critical WS paths. At minimum, the recruiter-first rule and the 403 rejection for non-participants should be integration-tested before this phase is marked complete.

---

## Info

### IN-01: In-memory WebSocket connection store is not multi-process safe

**File:** `src/modules/chat/chat.routes.ts:9-11`

**Issue:** The `connections` map is a module-level singleton (comment on line 9 acknowledges this is a D-10 design decision). In a single-process Node.js deployment this is fine, but any horizontal scaling (multiple instances, PM2 cluster mode, Docker replicas) will cause a broadcast to only reach clients connected to the same process. There is no runtime guard, warning, or documentation artifact that enforces single-process deployment, so a future infrastructure change could silently break real-time messaging.

**Fix:** Add a startup warning when `cluster.isPrimary` is false, or document the constraint in a code comment with an explicit architectural decision record reference.

---

### IN-02: `as any` casts in `SwipeService.getFeed` suppress type safety

**File:** `src/modules/swipe/swipe.service.ts:88`

**Issue:** `(candidate as any).searchRadiusKm ?? 50` uses `as any` to access `searchRadiusKm`. The field is defined in the Prisma schema (`CandidateProfile.searchRadiusKm Int @default(50)`) and should be available on the typed return value from `findCandidateProfileByUserId`. The cast likely exists because the repository's return type is inferred from a partial select that excludes `searchRadiusKm`. This suppresses TypeScript's ability to catch future field renames or removals.

**Fix:** Ensure `findCandidateProfileByUserId` selects `searchRadiusKm` and remove the `as any` cast.

---

### IN-03: `haversineKm` is duplicated across modules

**File:** `src/modules/swipe/swipe.service.ts:8-24` and `src/modules/credits/credits.routes.ts:7`

**Issue:** `credits.routes.ts` imports `haversineKm` from `../../shared/utils/haversine`, but `swipe.service.ts` defines its own private `haversineKm` function at the top of the file (lines 8–24) rather than importing from the shared utility. This is code duplication; if the formula is corrected in the shared utility, the swipe module's copy will not be updated.

**Fix:** Remove the private `haversineKm` in `swipe.service.ts` and import from `../../shared/utils/haversine` as the credits module already does.

---

### IN-04: Commented-out debug/placeholder stub tests lower test confidence metrics

**File:** `tests/integration/chat.test.ts:65-158`

**Issue:** Placeholder `it` blocks that contain only `expect(true).toBe(true)` will always pass and will be counted as passing tests in CI, giving a false signal of test coverage. If a coverage gate is added later, these stubs inflate the count.

**Fix:** Mark incomplete tests with `it.todo('description')` instead of `it('...', () => expect(true).toBe(true))`. `it.todo` is shown explicitly in Jest output as pending and does not inflate the passing count.

---

_Reviewed: 2026-05-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
