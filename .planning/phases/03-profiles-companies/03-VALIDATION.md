---
phase: 3
slug: profiles-companies
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest + Supertest |
| **Config file** | `jest.config.ts` (root) |
| **Quick run command** | `npm run test:unit -- --testPathPattern=<module>` |
| **Full suite command** | `npm run test` (--runInBand) |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- --testPathPattern=<module>`
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CAND-01 | IDOR | userId from JWT only | unit | `npm run test:unit -- --testPathPattern=candidate` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CAND-01 | Mass assignment | Zod strips unknown fields | integration | `npm run test:integration -- --testPathPattern=candidate` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | CAND-02 | — | N/A | integration | `npm run test:integration -- --testPathPattern=candidate` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | COMP-02 | Privilege escalation | ADMIN only creates company | unit | `npm run test:unit -- --testPathPattern=company` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | COMP-02 | Privilege escalation | 403 for non-ADMIN | integration | `npm run test:integration -- --testPathPattern=company` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | COMP-03 | Credits tampering | Zod validates positive int | integration | `npm run test:integration -- --testPathPattern=admin` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | COMP-01 | IDOR | userId from JWT | unit | `npm run test:unit -- --testPathPattern=recruiter` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | COMP-01 | — | 404 on invalid companyId | integration | `npm run test:integration -- --testPathPattern=recruiter` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 3 | ADMIN-01 | Info disclosure | passwordHash excluded | integration | `npm run test:integration -- --testPathPattern=admin` | ❌ W0 | ⬜ pending |
| 03-03-04 | 03 | 3 | ADMIN-02 | — | N/A | integration | `npm run test:integration -- --testPathPattern=admin` | ❌ W0 | ⬜ pending |
| 03-03-05 | 03 | 3 | ADMIN-03 | Privilege escalation | 403 for non-ADMIN | integration | `npm run test:integration -- --testPathPattern=admin` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/candidate.service.test.ts` — stubs for CAND-01, CAND-02 unit behavior
- [ ] `tests/unit/company.service.test.ts` — stubs for COMP-02, COMP-03 unit behavior
- [ ] `tests/unit/recruiter.service.test.ts` — stubs for COMP-01 unit behavior
- [ ] `tests/integration/candidate.test.ts` — covers CAND-01, CAND-02 end-to-end
- [ ] `tests/integration/company.test.ts` — covers COMP-02, COMP-03 end-to-end
- [ ] `tests/integration/recruiter.test.ts` — covers COMP-01 end-to-end
- [ ] `tests/integration/admin.test.ts` — covers ADMIN-01, ADMIN-02, ADMIN-03 end-to-end

*No new framework install needed — Jest + Supertest + ts-jest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Atomic credit increment under concurrent requests | COMP-03, SEC-03 | Requires concurrent HTTP load | Run 10 parallel PATCH /admin/companies/:id/credits requests and verify final balance = initial + (10 × amount) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
