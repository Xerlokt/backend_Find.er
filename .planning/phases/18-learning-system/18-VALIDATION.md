---
phase: 18
slug: learning-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest tests/unit/record-swipe.use-case.test.ts tests/unit/get-feed.use-case.test.ts tests/unit/recommendation.service.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit/record-swipe.use-case.test.ts tests/unit/get-feed.use-case.test.ts tests/unit/recommendation.service.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 0 | LEARN-01 | — | N/A | unit | `npx jest tests/unit/record-swipe.use-case.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 0 | LEARN-02 | — | N/A | unit | `npx jest tests/unit/get-feed.use-case.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 0 | LEARN-03 | — | N/A | unit | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 1 | LEARN-01 | — | Weights computed server-side; client never submits weights directly | unit | `npx jest tests/unit/record-swipe.use-case.test.ts -t "EMA" --no-coverage` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 1 | LEARN-01+03 | — | N/A | unit | `npx jest tests/unit/recommendation.service.test.ts -t "personal weights" --no-coverage` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | LEARN-01+02+03 | — | N/A | integration | `npx jest tests/integration/weights.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 18-03-02 | 03 | 2 | LEARN-02 | — | N/A | integration | `npx jest tests/integration/weights.test.ts -t "cold-start" --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/record-swipe.use-case.test.ts` — add `makeWeightsRepo()` factory + 4 new EMA test cases (LEARN-01); update 5 existing `new RecordSwipeUseCase(...)` calls to 4-arg constructor
- [ ] `tests/unit/get-feed.use-case.test.ts` — add `makeWeightsRepo()` factory + 3 new cold-start/personal-weights test cases (LEARN-02); update 4 existing `new GetFeedUseCase(...)` calls to 4-arg constructor
- [ ] `tests/unit/recommendation.service.test.ts` — add 2 new test cases for `computeFitScore` with personal weights (LEARN-03); update mock to accept optional 3rd arg
- [ ] `tests/integration/weights.test.ts` — new file, 3 integration test cases covering LEARN-01+02+03 end-to-end
- [ ] `tests/helpers/setup.ts` — add `await prisma.candidateWeights.deleteMany()` before `discResult.deleteMany()` in `afterEach`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feed ordering visually differs after 5 LIKEs on jobs with distinct profiles | LEARN-02/03 | Requires human judgment on ranking quality | Create candidate + 5 jobs with very different skill/profession/location profiles; LIKE 5 jobs strongly aligned to one profile; verify feed shifts that profile type upward |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
