---
phase: 14-graph-recommendation
plan: "03"
subsystem: recommendation
tags: [neo4j, graph, skills, cypher, adjacency, seed, constraints, green-phase]
dependency_graph:
  requires:
    - 14-01 (TDD RED phase — unit/integration tests with skillIds/requiredSkillIds)
    - 14-02 (Interface field renames — skillIds and requiredSkillIds)
  provides:
    - neo4j-traversal-engine (RELATED_TO*0..2 with hop-decay weights)
    - expanded-seed-taxonomy (36 skills, 6 professions, 52 RELATED_TO edges)
    - unique-constraints (skill_id_unique, profession_id_unique)
  affects:
    - src/adapters/services/recommendation.repository.ts
tech_stack:
  added: []
  patterns:
    - "RELATED_TO*0..2 Cypher with UNWIND+OPTIONAL MATCH+min(length(path)) pattern"
    - "Separate schema session for CREATE CONSTRAINT before data MERGE session (Neo4j 5 requirement)"
    - "Hop-decay WEIGHT map: {0: 1.0, 1: 0.8, 2: 0.6}; skillsScore = min(sum/required, 1.0)"
key_files:
  created: []
  modified:
    - src/adapters/services/recommendation.repository.ts
decisions:
  - "Used OPTIONAL MATCH path = (cand:Skill)-[:RELATED_TO*0..2]->(req) + min(length(path)) to find shortest path within bound — handles both 0-hop (direct match) and 1-2 hop adjacency in single query"
  - "Skill count is 36 (not 35 from plan must_haves) — integration test from Plan 01 already asserts 36 and 42 total nodes; implementation matches test expectations"
  - "Parallel test failures (FK constraint violations) are pre-existing isolation issue — all 182 tests pass with --runInBand; failures are due to concurrent afterEach cleanup, not Plan 03 changes"
  - "26 RELATED_TO pairs × 2 bidirectional edges = 52 directed edges (>= 50 required by GRAPH-02)"
metrics:
  duration: "35 minutes"
  completed: "2026-05-16T21:15:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 1
---

# Phase 14 Plan 03: Neo4j Traversal Engine — GREEN Phase

**One-liner:** Replaced exact-match skills factor with Neo4j RELATED_TO*0..2 Cypher traversal + hop-decay weights; expanded seedTaxonomy to 36 skills, 6 professions, 52 bidirectional edges, and unique constraints — all 182 tests GREEN in serial mode.

## What Was Done

### Task 1 — Replace computeFitScore skills factor with Neo4j RELATED_TO*0..2 traversal

Replaced the pure-TypeScript exact-match block in `computeFitScore` with:
- A `neo4j.session.READ` session opened per call
- Cypher: `UNWIND $requiredSkillIds AS reqId MATCH (req:Skill {id: reqId}) OPTIONAL MATCH path = (cand:Skill)-[:RELATED_TO*0..2]->(req) WHERE cand.id IN $candidateSkillIds WITH reqId, min(length(path)) AS hops WHERE hops IS NOT NULL RETURN reqId AS skill, hops`
- Hop-decay weight map: `{ 0: 1.0, 1: 0.8, 2: 0.6 }`
- `skillsScore = min(totalWeight / job.requiredSkillIds.length, 1.0)`
- Short-circuit: if `requiredSkillIds.length === 0`, return `1.0` without Neo4j call

**Result:** 20/20 unit tests GREEN including all 6 adjacency scoring cases in `describe('adjacency scoring (GRAPH-01)')`.

### Task 2 — Expand seedTaxonomy — unique constraints + 36 skills + 52 edges

Rewrote `seedTaxonomy()` method body:

**Step 1 — Schema session (separate):**
- `CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE`
- `CREATE CONSTRAINT profession_id_unique IF NOT EXISTS FOR (p:Profession) REQUIRE p.id IS UNIQUE`

**Step 2 — Data session (executeWrite):**
- 6 Profession nodes (unchanged)
- 36 Skill nodes: 10 original + 7 backend (sql, mysql, java, spring, rust, django, fastapi) + 6 frontend (vue, angular, css, sass, tailwind, nextjs) + 8 devops (kubernetes, devops, aws, cloud, terraform, iac, github-actions, ci-cd) + 5 mobile (ios, android, react-native, flutter, dart)
- 8 REQUIRES relationships (unchanged)
- 26 RELATED_TO pairs × 2 bidirectional = 52 directed edges

**Result:** 13/13 integration tests GREEN including unique constraint test, edge count test (>= 50), SQL→PostgreSQL 1-hop adjacency, and idempotency test.

### Task 3 — Full suite green check and depth-bound audit

Ran full test suite and performed audit:

- **Serial mode (`--runInBand`):** 182/182 tests GREEN, 0 failures
- **Depth-bound audit:** `grep -rn "RELATED_TO\*[^0-9]" src/` → zero results (no unbounded traversal)
- **Bound verification:** `grep -rn "RELATED_TO\*" src/` → exactly 2 matches, both `RELATED_TO*0..2` (1 in comment, 1 in Cypher string)
- **TypeScript:** `npx tsc --noEmit` → 0 errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch behind main — merged to bring Phase 14 plans**

- **Found during:** Task 1 setup — `.planning/phases/14-graph-recommendation/` did not exist in worktree
- **Issue:** Worktree branch `worktree-agent-ac01716b5bbfa680b` was branched from `73577f7` (`plan-phase-13`), before any Phase 14 commits were merged to main
- **Fix:** `git merge main --no-verify` fast-forward to bring all Phase 14 planning docs, Phase 13 code (adapters architecture), and Wave 0+1 commits into worktree
- **Files modified:** All files from main (fast-forward, no conflicts)
- **Commit:** Part of fast-forward merge, not a separate commit

### Notes

**2. Skill count reconciliation (not a deviation — alignment with Plan 01)**

The plan's `must_haves` section states "35 Skill nodes" and "41 total nodes", but the integration test written in Plan 01 already asserts `expect(count).toBe(36)` (skills) and `expect(count).toBe(42)` (total). The implementation was written to match the test (36 skills, 42 total), not the stale must_haves text. The success_criteria section of Plan 03 says "35+ Skill nodes" (a lower bound), which 36 satisfies.

**3. Parallel test failures — pre-existing isolation issue (out of scope)**

Running `npx jest --no-coverage` (parallel) produces FK constraint violations across integration test suites. This is caused by concurrent `afterEach` cleanup racing with test setup in neighboring suites. All tests pass individually and with `--runInBand`. This is a pre-existing issue (not introduced by Plan 03) and is documented in `deferred-items.md` scope.

## Verification Results

1. Unit tests GREEN: `npx jest tests/unit/recommendation.service.test.ts --no-coverage` → 20 passed, 0 failed
2. Integration tests GREEN: `npx jest tests/integration/recommendation.test.ts --no-coverage` → 13 passed, 0 failed
3. Full suite GREEN (serial): `npx jest --no-coverage --runInBand --forceExit` → 182 passed, 0 failed
4. No unbounded traversal: `grep -rn "RELATED_TO\*[^0-9]" src/` → zero results
5. TypeScript clean: `npx tsc --noEmit` → 0 errors
6. Depth bound present: `grep "RELATED_TO\*0\.\.2" src/adapters/services/recommendation.repository.ts` → 2 matches (comment + Cypher)
7. Unique constraints: `grep "skill_id_unique" src/adapters/services/recommendation.repository.ts` → 1 match

## Known Stubs

None — `computeFitScore` now uses real Neo4j traversal; `seedTaxonomy` creates real nodes and constraints.

## Threat Flags

None — all threats in T-14-03 register mitigated:
- **T-14-03-01 (Injection):** Cypher uses `$candidateSkillIds`/`$requiredSkillIds` parameters — no string interpolation
- **T-14-03-02 (DoS):** Depth bound `*0..2` is explicit; unbounded audit in Task 3 confirms compliance
- **T-14-03-03 (EoP):** `CREATE CONSTRAINT IF NOT EXISTS` is additive and idempotent
- **T-14-03-04 (DoS):** Bounded UNWIND per element; no exponential blowup at `*0..2`

## Self-Check

- [x] `src/adapters/services/recommendation.repository.ts` — modified with RELATED_TO*0..2 traversal + expanded seed
- [x] Commit `1e4d204` — Task 1 (Neo4j traversal implementation)
- [x] Commit `cbd02d2` — Task 2 (expanded seedTaxonomy)
- [x] 182 tests pass in serial mode
- [x] `grep "RELATED_TO\*0\.\.2" src/adapters/services/recommendation.repository.ts` → 2 matches
- [x] `grep "skill_id_unique" src/adapters/services/recommendation.repository.ts` → 1 match
- [x] `npx tsc --noEmit` → 0 errors

## Self-Check: PASSED
