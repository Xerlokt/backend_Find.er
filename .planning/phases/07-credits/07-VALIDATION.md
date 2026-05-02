---
phase: 7
slug: credits
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + Supertest 7 |
| **Config file** | `jest.config.js` (root) |
| **Quick run command** | `npm test -- --testPathPattern=credit.service` |
| **Full suite command** | `npm test -- --testPathPattern="credits|swipe|admin"` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=credit.service`
- **After every plan wave:** Run `npm test -- --testPathPattern="credits|swipe|admin"`
- **Before `/gsd-verify-work`:** Full suite `npm test` must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | CREDIT-01, CREDIT-02, CREDIT-03 | T-07-01 | TOCTOU balance check inside $transaction | unit | `npm test -- --testPathPattern=credit.service` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SEC-03 | T-07-02 | P2002 catch → 409 ALREADY_UNLOCKED | unit | `npm test -- --testPathPattern=credit.service` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | CREDIT-04 | T-07-03 | admin grant delegates to CreditService | unit | `npm test -- --testPathPattern=credit.service` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | CREDIT-01 | T-07-04 | 403 when recruiter doesn't own job | integration | `npm test -- --testPathPattern=credits` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | CREDIT-01, CREDIT-02 | T-07-05 | 201 + full profile + credits decremented | integration | `npm test -- --testPathPattern=credits` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | SEC-03 | T-07-06 | 402 INSUFFICIENT_CREDITS when balance < cost | integration | `npm test -- --testPathPattern=credits` | ❌ W0 | ⬜ pending |
| 07-02-04 | 02 | 2 | SEC-03 | T-07-07 | 409 ALREADY_UNLOCKED on second unlock | integration | `npm test -- --testPathPattern=credits` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | CREDIT-04 | T-07-08 | PATCH /admin/companies/:id/credits regression | integration | `npm test -- --testPathPattern=admin` | ✅ exists | ⬜ pending |
| 07-03-02 | 03 | 3 | CREDIT-03 | T-07-09 | GET /admin/companies/:id/transactions returns log | integration | `npm test -- --testPathPattern=admin` | ❌ W0 | ⬜ pending |
| 07-03-03 | 03 | 3 | ARCH-04 | T-07-10 | getRanking reveals unlocked DISLIKE candidate | integration | `npm test -- --testPathPattern=swipe` | ✅ exists — new case | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/credit.service.test.ts` — stubs for CREDIT-01, CREDIT-02, CREDIT-03, CREDIT-04, SEC-03
- [ ] `tests/integration/credits.test.ts` — stubs for full unlock flow integration tests
- [ ] `tests/helpers/factories.ts` — append `createUnlock` factory
- [ ] `tests/helpers/setup.ts` — add `await prisma.unlock.deleteMany()` before job/company cleanup
- [ ] `prisma/schema.prisma` — add `Unlock` model + back-references; run migration before any test run

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent unlock requests don't produce negative balance | SEC-03 | Race condition difficult to reliably reproduce in unit/integration tests | Run two simultaneous POST requests with company balance=2, UNLOCK_COST=2; verify balance=0 (not negative) and only one Unlock record |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
