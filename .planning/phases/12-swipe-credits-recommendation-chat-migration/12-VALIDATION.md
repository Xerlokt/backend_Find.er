---
phase: 12
slug: swipe-credits-recommendation-chat-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest + Supertest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npm run test:integration -- --testPathPattern=<module>` |
| **Full suite command** | `npm run test:integration` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:integration -- --testPathPattern=<migrated-module>`
- **After every plan wave:** Run `npm run test:integration` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-xx | 01 | 1 | ARCH-07 | — | ChatRepository adapter wraps Prisma; no Prisma in use cases | Integration | `npm run test:integration -- --testPathPattern=chat` | ✅ | ⬜ pending |
| 12-02-xx | 02 | 1 | ARCH-07 | — | Neo4jAdapter wraps RecommendationRepository | Integration | `npm run test:integration -- --testPathPattern=recommendation` | ✅ | ⬜ pending |
| 12-03-xx | 03 | 2 | ARCH-07, TEST-01 | T-concurrent-unlock | CreditRepository transaction prevents double deduction | Integration | `npm run test:integration -- --testPathPattern=credits` | ✅ | ⬜ pending |
| 12-04-xx | 04 | 2 | ARCH-07, TEST-01 | T-duplicate-swipe | SwipeRepository P2002 → DomainError; no Prisma in use case | Integration | `npm run test:integration -- --testPathPattern=swipe` | ✅ | ⬜ pending |
| 12-final | all | final | TEST-01 | — | All 41 integration tests green | Integration | `npm run test:integration` | All exist | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

None — existing integration tests cover all four modules. No new test files needed. The migration is a structural refactor with preserved behavior; existing tests exercise the full stack via `buildApp()`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No Prisma import in any use-case file | ARCH-07 | Static grep check | `grep -r "import.*@prisma" src/application/use-cases/` — expects 0 matches |
| WebSocket real-time broadcast | TEST-01 | WS integration test covers sendMessage; broadcast delivery is tested in Phase 8 integration tests | Run `npm run test:integration -- --testPathPattern=chat` and verify all chat WS tests pass |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
