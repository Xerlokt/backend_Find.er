---
phase: 14
slug: graph-recommendation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-16
audited: 2026-05-17
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage --runInBand --forceExit` |
| **Estimated runtime** | ~60 seconds (integration suite hits real Neo4j + PostgreSQL) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit/recommendation.service.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green (all 182 tests)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-W0-unit | 01 | 0 | GRAPH-01 | — | N/A | unit | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` | ✅ | ✅ green |
| 14-W0-integration | 01 | 0 | GRAPH-01, GRAPH-02, GRAPH-03 | — | N/A | integration | `npx jest tests/integration/recommendation.test.ts --no-coverage` | ✅ | ✅ green |
| 14-interface | 02 | 1 | GRAPH-01 | — | N/A | typecheck | `npx tsc --noEmit` | ✅ | ✅ green |
| 14-cypher-engine | 03 | 2 | GRAPH-01 | T-14-03-01, T-14-03-02 | Depth-bounded at *0..2; parameterized Cypher (no injection) | unit + integration | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` | ✅ | ✅ green |
| 14-seed-expand | 03 | 2 | GRAPH-02, GRAPH-03 | T-14-03-03 | CREATE CONSTRAINT IF NOT EXISTS (additive, idempotent) | integration | `npx jest tests/integration/recommendation.test.ts -t "50 RELATED_TO" --no-coverage` | ✅ | ✅ green |
| 14-callers-update | 02 | 1 | GRAPH-01 | — | N/A | unit + typecheck | `npx tsc --noEmit && npx jest --no-coverage` | ✅ | ✅ green |
| 14-full-suite | — | final | GRAPH-01, GRAPH-02, GRAPH-03 | — | All 182 tests green | integration | `npx jest --no-coverage --runInBand --forceExit` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement Coverage Summary

| Requirement | Description | Test File | Test Count | Status |
|-------------|-------------|-----------|------------|--------|
| GRAPH-01 | Adjacency scoring: 0-hop=1.0, 1-hop=0.8, 2-hop=0.6 | `tests/unit/recommendation.service.test.ts` | 6 unit cases in `describe('adjacency scoring (GRAPH-01)')` | COVERED |
| GRAPH-01 | Integration: real Neo4j graph traversal | `tests/integration/recommendation.test.ts` | 2 cases in `describe('adjacency scoring — integration (GRAPH-01)')` | COVERED |
| GRAPH-02 | ≥50 RELATED_TO edges in seed taxonomy | `tests/integration/recommendation.test.ts:98-110` | `'creates at least 50 RELATED_TO edges (GRAPH-02)'` | COVERED |
| GRAPH-03 | Unique constraints: skill_id_unique, profession_id_unique | `tests/integration/recommendation.test.ts:112-123` | `'Skill.id and Profession.id unique constraints exist'` | COVERED |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Neo4j query plan uses `NodeIndexSeek` (not `NodeByLabelScan`) | GRAPH-03 | Requires Neo4j Browser or EXPLAIN Cypher | Run `EXPLAIN MATCH (s:Skill) WHERE s.id = 'postgresql' RETURN s` in Neo4j Browser; verify `NodeIndexSeek` in plan |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-05-17 — 182/182 tests green, all GRAPH-01/02/03 requirements COVERED

---

## Validation Audit 2026-05-17

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Total tasks audited | 7 |
| Requirements COVERED | 4 (GRAPH-01 ×2, GRAPH-02, GRAPH-03) |
| Requirements PARTIAL | 0 |
| Requirements MISSING | 0 |

All requirements verified against executed phase artifacts. VALIDATION.md updated from `draft` to `complete`.
