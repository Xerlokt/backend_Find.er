---
status: testing
phase: 08-chat
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md]
started: 2026-05-03T20:00:00Z
updated: 2026-05-03T20:00:00Z
---

## Current Test

number: 2
name: LIKE swipe creates chat (CHAT-02 — match trigger)
expected: |
  POST /swipes com { jobId, direction: "LIKE" } retorna 201.
  Response body contém chatId como string não-nula (UUID).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start fresh with `npm run dev`. Server boots without errors. `GET /health` returns 200 with a live response.
result: pass

### 2. LIKE swipe creates chat (CHAT-02 — match trigger)
expected: POST /swipes with `{ jobId, direction: "LIKE" }` returns 201. Response body contains `chatId` as a non-null string (UUID).
result: [pending]

### 3. Credit unlock creates chat (CHAT-02 — unlock trigger)
expected: POST /jobs/:jobId/candidates/:candidateId/unlock (recruiter with credits) returns 200. Response body contains `chatId` as a non-null string (UUID).
result: [pending]

### 4. GET /chats — list participant chats
expected: GET /chats with valid Bearer token (candidate or recruiter) returns 200 with an array. Each item has chatId, jobId, initiatedBy, isActive, createdAt, and otherParticipantName.
result: [pending]

### 5. GET /chats/:chatId/messages — paginated message history (CHAT-04)
expected: GET /chats/:chatId/messages with valid Bearer token (participant) returns 200 with `{ data: [...], nextCursor: null | string }`. Data contains message objects with id, chatId, senderId, content, createdAt, readAt.
result: [pending]

### 6. Non-participant blocked from message history
expected: GET /chats/:chatId/messages with a Bearer token for a user who is NOT in that chat returns 403.
result: [pending]

### 7. WebSocket connection — participant connects (CHAT-01)
expected: WS upgrade to GET /chats/:chatId/ws with `Authorization: Bearer <token>` (valid participant) completes successfully. Connection stays open. Sending `{ "content": "Hello" }` receives a broadcast back with the persisted message shape.
result: [pending]

### 8. Non-participant WS rejected (close 1008)
expected: WS upgrade to GET /chats/:chatId/ws with a token for a non-participant results in the server closing the connection with close code 1008 (Policy Violation).
result: [pending]

### 9. WS message persists to DB (CHAT-03)
expected: After sending a WS message successfully, query the DB (or GET /chats/:chatId/messages via REST) and confirm the message row appears with the correct content, senderId, and a createdAt timestamp.
result: [pending]

### 10. Recruiter-first rule (CHAT-02)
expected: Candidate connects via WS and sends a message before the recruiter has sent any. Candidate receives `{ "error": "RECRUITER_MUST_INITIATE" }` over the socket. Connection is NOT closed — subsequent messages can be sent once recruiter initiates.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

[none yet]
