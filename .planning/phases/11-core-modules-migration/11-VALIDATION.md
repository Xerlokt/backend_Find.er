---
phase: 11
slug: core-modules-migration
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest + Supertest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npm run test:integration -- --testPathPattern=<module>` |
| **Full suite command** | `npm run test:integration` |
| **Estimated runtime** | ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:integration -- --testPathPattern=<module>` (module = candidate|recruiter|company|job|admin)
- **After every plan wave:** Run `npm run test:integration` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green (all 134 tests)
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | TEST-03 | No Prisma in use-cases; tsc clean | Integration | `npx tsc --noEmit 2>&1 \| head -20` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | TEST-03 | No Prisma in use-cases; tsc clean | Integration | `npx tsc --noEmit 2>&1 \| head -20` | ✅ | ⬜ pending |
| 11-01-03 | 01 | 1 | TEST-03 | Candidate + recruiter routes green | Integration | `npm run test:integration -- --testPathPattern="candidate\|recruiter" 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 11-02-01 | 02 | 2 | TEST-03 | ICompanyRepository extended; tsc clean | Integration | `npx tsc --noEmit 2>&1 \| head -20` | ✅ | ⬜ pending |
| 11-02-02 | 02 | 2 | TEST-03 | Company routes green | Integration | `npm run test:integration -- --testPathPattern=company 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 3 | TEST-03 | Scheduler imports updated; tsc clean | Integration | `npx tsc --noEmit 2>&1 \| head -20` | ✅ | ⬜ pending |
| 11-03-02 | 03 | 3 | TEST-03 | Job routes green | Integration | `npm run test:integration -- --testPathPattern=job 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 11-04-01 | 04 | 4 | TEST-03 | IUserRepository extended; tsc clean | Integration | `npx tsc --noEmit 2>&1 \| head -20` | ✅ | ⬜ pending |
| 11-04-02 | 04 | 4 | TEST-03 | Admin routes green; full suite green | Integration | `npm run test:integration -- --testPathPattern=admin 2>&1 \| tail -20 && npm run test:integration 2>&1 \| tail -10` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — `tests/integration/candidate.test.ts`, `tests/integration/company.test.ts`, `tests/integration/recruiter.test.ts`, `tests/integration/job.test.ts`, and `tests/integration/admin.test.ts` already exist and exercise all five modules via `buildApp()` + real Docker DB.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — all files exist)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
