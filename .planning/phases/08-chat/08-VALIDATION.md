---
phase: 8
slug: chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest tests/unit/chat.service.test.ts --runInBand` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit/chat.service.test.ts --runInBand`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | CHAT-01–04 | — | @types/ws installed; unit test stubs compile | setup | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | CHAT-02 | T-08-01 | @@unique migration applied; createOrGetChat upsert idempotent | unit | `npx jest tests/unit/chat.service.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | CHAT-02 | T-08-02 | IChatService interface; ChatService.createOrGetChat; ChatRepository | unit | `npx jest tests/unit/chat.service.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | CHAT-01 | T-08-03 | WS upgrade; authenticate preHandler; participant check; in-memory broadcast | integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | CHAT-03 | T-08-04 | Message persisted to DB before broadcast; Zod validation on WS payload | integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-02-03 | 02 | 2 | CHAT-04 | T-08-05 | GET /chats/:chatId/messages cursor pagination; mark readAt on fetch | integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 3 | CHAT-02 | T-08-06 | SwipeService LIKE → chatId in response; CreditService unlock → chatId in response | integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-03-02 | 03 | 3 | CHAT-04 | — | GET /chats lists participant chats; non-participant gets 403 | integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ W0 | ⬜ pending |
| 08-03-03 | 03 | 3 | CHAT-02 | T-08-07 | Recruiter-first rule: candidate sends first → 403 RECRUITER_MUST_INITIATE | integration | `npx jest tests/integration/chat.test.ts --runInBand` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/chat.service.test.ts` — stubs for CHAT-01 through CHAT-04 (unit, no DB)
- [ ] `tests/integration/chat.test.ts` — stubs for all integration behaviors above
- [ ] `tests/helpers/factories.ts` additions: `createChat(candidateId, jobId, companyId)` and `createMessage(chatId, senderId)` factories
- [ ] `npm install --save-dev @types/ws` — required before any typed WS handler compiles

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebSocket real-time broadcast to second participant | CHAT-01 | Two concurrent WS connections hard to automate in CI | Open two clients; send from one; verify other receives |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
