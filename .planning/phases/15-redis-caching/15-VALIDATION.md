---
phase: 15
slug: redis-caching
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest tests/unit --runInBand --no-coverage` |
| **Full suite command** | `npx jest --runInBand --no-coverage` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit --runInBand --no-coverage`
- **After every plan wave:** Run `npx jest --runInBand --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | SCALE-01 | — | Cache key `feed:{candidateId}` scoped to authenticated ID — no cross-candidate leakage | unit | `npx jest tests/unit/get-feed.use-case.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 0 | SCALE-02 | — | `invalidatePattern('ranking:*')` clears all ranking keys after profile update | unit | `npx jest tests/unit/get-ranking.use-case.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 0 | SCALE-04 | — | EXPLAIN confirms index seeks for all 4 query patterns | integration | `npx jest tests/integration/indexes.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-01-04 | 01 | 0 | SCALE-03 | — | `npm run check:deps` exits 1 if application/ imports infrastructure/ | unit | `npx jest tests/unit/check-deps.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | SCALE-01 | — | GetFeedUseCase returns cached result on second call (no Neo4j) | unit | `npx jest tests/unit/get-feed.use-case.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | SCALE-01 | — | RecordSwipeUseCase deletes `feed:{candidateId}` key after swipe | unit | `npx jest tests/unit/record-swipe.use-case.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 1 | SCALE-02 | — | UpsertCandidateProfileUseCase calls invalidatePattern after upsert | unit | `npx jest tests/unit/upsert-candidate-profile.use-case.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-02-04 | 02 | 1 | SCALE-03 | — | `npm run check:deps` exits 0 on current codebase (no violations) | script | `npm run check:deps` | ✅ | ⬜ pending |
| 15-02-05 | 02 | 1 | SCALE-04 | — | `npx prisma migrate dev` generates migration with 4 CREATE INDEX statements | unit | `npx jest tests/integration/indexes.test.ts --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 2 | SCALE-01 | T-15-03-01 | Second feed request within 60s returns identical JSON (integration e2e) | integration | `npx jest tests/integration/swipe.test.ts -t "cache" --runInBand --no-coverage` | ✅ | ⬜ pending |
| 15-03-02 | 03 | 2 | SCALE-01 | — | After swipe, next feed request re-executes Neo4j (cache miss verified) | integration | `npx jest tests/integration/swipe.test.ts -t "invalidate feed" --runInBand --no-coverage` | ✅ | ⬜ pending |
| 15-03-03 | 03 | 2 | SCALE-02 | — | After profile update, ranking response reflects new data on next request | integration | `npx jest tests/integration/swipe.test.ts -t "invalidate ranking" --runInBand --no-coverage` | ✅ | ⬜ pending |
| 15-03-04 | 03 | 2 | SCALE-04 | — | 4 @@index entries present in prisma/schema.prisma | unit | `grep -c "@@index" prisma/schema.prisma` (expect ≥ 6) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/get-feed.use-case.test.ts` — unit stubs for SCALE-01 (cache hit, cache miss, no-cursor-only caching, Redis error fallthrough)
- [ ] `tests/unit/get-ranking.use-case.test.ts` — unit stubs for SCALE-02 (cache hit, invalidatePattern after profile update)
- [ ] `tests/unit/record-swipe.use-case.test.ts` — unit stubs for SCALE-01 invalidation (del called with `feed:{candidateId}`)
- [ ] `tests/unit/upsert-candidate-profile.use-case.test.ts` — unit stubs for SCALE-02 invalidation (invalidatePattern called after upsert)
- [ ] `tests/integration/indexes.test.ts` — integration stubs for SCALE-04 (EXPLAIN queries confirm index seeks for 4 patterns)
- [ ] `npm install ioredis` and `npm install --save-dev ioredis-mock` — required before any test can import ICachePort/RedisAdapter

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redis dashboard / redis-cli confirms keys are written with correct TTL | SCALE-01, SCALE-02 | Observability, not correctness — TTL inspection requires redis-cli or docker exec | `docker exec -it redis redis-cli TTL feed:<candidateId>` — expect value between 1 and 60 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
