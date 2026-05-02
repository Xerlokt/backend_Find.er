---
phase: 5
slug: swipe
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x + ts-jest + Supertest 7.x |
| **Config file** | jest.config.js |
| **Quick run command** | `npm run test:unit -- --testPathPattern=swipe.service` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds (unit), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --testPathPattern=swipe.service`
- **After every plan wave:** Run `npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds (unit), ~60 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SWIPE-01 | T-IDOR-candidate | candidateId resolved from JWT userId, never from body | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SWIPE-01 | T-inactive-job | SwipeService throws 404 when job.isActive=false | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | SWIPE-02 | T-duplicate | Duplicate swipe throws AppError 409 DUPLICATE_SWIPE | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | SEC-03 | T-race | Swipe create wrapped in $transaction | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | SWIPE-01 | T-IDOR-candidate | POST /swipes creates swipe record for authenticated candidate | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | SWIPE-02 | T-duplicate | POST /swipes returns 409 with code DUPLICATE_SWIPE on second swipe | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | SEC-05 | T-rate-limit | POST /swipes rate-limit config: max 30, timeWindow 1 minute | manual | N/A — rate limit not easily tested via Supertest in CI | N/A | ⬜ pending |
| 05-03-01 | 03 | 2 | SWIPE-03 | T-censorship | GET /jobs/:jobId/ranking: LIKE candidate has full profile in response | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | SWIPE-04 | T-censorship | GET /jobs/:jobId/ranking: DISLIKE candidate has profile: null | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 2 | SWIPE-03 | T-location-leak | Ranking response never contains lat or lng fields for any candidate | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ W0 | ⬜ pending |
| 05-03-04 | 03 | 2 | SWIPE-03 | T-ownership | GET /jobs/:jobId/ranking returns 403 when recruiter is not job owner | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/swipe.service.test.ts` — unit stubs for SWIPE-01, SWIPE-02, SEC-03 (mocked SwipeRepository)
- [ ] `tests/integration/swipe.test.ts` — integration stubs for SWIPE-01, SWIPE-02, SWIPE-03, SWIPE-04
- [ ] `tests/helpers/factories.ts` — add `createSwipe` factory (needed by integration tests)

*Existing infrastructure (Jest, Supertest, setup.ts afterEach cleanup) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| POST /swipes rejects >30 req/min | SEC-05 | Rate limiting not easily reproduced in Supertest without mock timers; plugin-level config | Verify `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` is set in route options by code review |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
