---
phase: 6
slug: recommendation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.3.0 + ts-jest 29.4.9 |
| **Config file** | `jest.config.ts` (project root) |
| **Quick run command** | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` |
| **Full suite command** | `npx jest --runInBand --no-coverage` |
| **Estimated runtime** | ~30 seconds (unit), ~90 seconds (full with Neo4j) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit/recommendation.service.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --runInBand --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | REC-02 | — | Graph seed uses MERGE (idempotent), no string interpolation | unit | `npx jest tests/unit/recommendation.service.test.ts -t "seedTaxonomy" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | REC-02 | — | Profession and Skill nodes created in Neo4j | integration | `npx jest tests/integration/recommendation.test.ts -t "seed" --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | REC-02 | T-Cypher-Inject | Parameterized Cypher only — no string interpolation | unit | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | REC-01 | — | Profession match contributes 30 pts | unit | `npx jest tests/unit/recommendation.service.test.ts -t "profession" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | REC-01 | — | Skills overlap contributes 35 pts | unit | `npx jest tests/unit/recommendation.service.test.ts -t "skills" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | REC-01 | — | Location proximity contributes 20 pts | unit | `npx jest tests/unit/recommendation.service.test.ts -t "location" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-02-04 | 02 | 1 | REC-01 | — | Work mode contributes 10 pts | unit | `npx jest tests/unit/recommendation.service.test.ts -t "modality" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-02-05 | 02 | 1 | REC-01 | — | Salary range contributes 5 pts | unit | `npx jest tests/unit/recommendation.service.test.ts -t "salary" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-02-06 | 02 | 1 | REC-01 | — | Perfect match = 100, zero match = 0 | unit | `npx jest tests/unit/recommendation.service.test.ts -t "fitScore" --no-coverage` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | REC-03 | — | Ranking sorted fitScore DESC | integration | `npx jest tests/integration/swipe.test.ts -t "ranking" --runInBand --no-coverage` | ✅ (update needed) | ⬜ pending |
| 06-03-02 | 03 | 2 | CAND-03 | — | Feed items include fitScore field | integration | `npx jest tests/integration/swipe.test.ts -t "feed" --runInBand --no-coverage` | ✅ (update needed) | ⬜ pending |
| 06-03-03 | 03 | 2 | REC-01 | — | fitScore !== 0 in ranking response (placeholder removed) | integration | `npx jest tests/integration/recommendation.test.ts -t "computeFitScore" --runInBand --no-coverage` | ❌ W0 | ⬜ pending |
| 06-03-04 | 03 | 2 | REC-03 | — | Existing swipe unit tests still pass after constructor change | unit | `npx jest tests/unit/swipe.service.test.ts --no-coverage` | ✅ (update needed) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/recommendation.service.test.ts` — stubs for REC-01 (all 12 factor test cases)
- [ ] `tests/integration/recommendation.test.ts` — integration stubs for REC-01, REC-02
- [ ] `tests/helpers/neo4j-setup.ts` — shared Neo4j clear+seed fixture for integration tests

*Note: `tests/unit/swipe.service.test.ts` and `tests/integration/swipe.test.ts` already exist — they need updates (not new files). The Wave 0 new files listed above must be created before Plan 06-01 implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `scripts/seed-neo4j.ts` CLI runs without error | REC-02 | CLI script, not a unit or HTTP test | Run `npx ts-node scripts/seed-neo4j.ts` and confirm "Seed complete" output; verify nodes with `MATCH (n) RETURN count(n)` in Neo4j browser |
| Neo4j browser shows seeded taxonomy | REC-02 | Visual verification of graph structure | Connect to `http://localhost:7474`, run `MATCH (n) RETURN n` to confirm profession/skill nodes and relationships visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
