---
phase: 2
slug: authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.9 |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npm run test:unit -- --testPathPattern=auth.service` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (unit), ~60 seconds (full suite with Docker) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --testPathPattern=auth.service`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (unit), ~60 seconds (full with DB)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | AUTH-01, AUTH-02, SEC-04 | T-2-01 | Passwords hashed with bcrypt ≥ 12 rounds | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | AUTH-01 | T-2-01 | register creates User, returns token pair | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | AUTH-02 | T-2-02 | login throws INVALID_CREDENTIALS on bad password; timing-safe | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | AUTH-04 | T-2-03 | refresh rotates token; replay revokes family | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 1 | AUTH-05, AUTH-06 | T-2-04 | logout marks revokedAt; protected route rejects missing JWT | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ W0 | ⬜ pending |
| 2-02-04 | 02 | 1 | SEC-05 | T-2-05 | 6th login req in 1 min returns 429 with retryAfter | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | AUTH-03 | T-2-06 | loginWithGoogle upserts user via mocked verifyIdToken | unit | `npm run test:unit -- --testPathPattern=auth.service` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | AUTH-03 | T-2-06 | POST /auth/google returns token pair (jest.spyOn verifyIdToken) | integration | `npm run test:integration -- --testPathPattern=auth` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/auth.service.test.ts` — unit stubs for AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, SEC-04, SEC-06
- [ ] `tests/integration/auth.test.ts` — integration stubs for AUTH-01 through AUTH-06, SEC-05 (rate limit), SEC-06
- [ ] Update `tests/helpers/setup.ts` — add `prisma.refreshToken.deleteMany()` before `prisma.user.deleteMany()` in `afterEach`
- [ ] Update `tests/helpers/factories.ts` — add `createRefreshToken()` factory helper

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Google OAuth2 flow with live token | AUTH-03 | `GOOGLE_CLIENT_ID` is placeholder; real Google credentials not available | In production: obtain a real Google ID token from Google OAuth Playground, POST to `/auth/google` with `{ idToken, role }`, verify 201 response with JWT pair |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
