---
phase: 14
reviewers: [opencode]
reviewed_at: 2026-05-17T00:00:00Z
plans_reviewed:
  - 14-01-PLAN.md
  - 14-02-PLAN.md
  - 14-03-PLAN.md
---

# Cross-AI Plan Review — Phase 14: Graph Recommendation

## OpenCode Review

## Cross-AI Plan Review: Phase 14 — Graph Recommendation

### Summary

The three-wave TDD plan is well-structured, and the actual codebase implementation closely matches the plans — but with one **critical discrepancy** in the Cypher query. Plans 01 and 02 are sound; Plan 03's proposed Cypher contains a duplicate-row bug that the actual implementation correctly avoids. Overall the phase design achieves its goals (GRAPH-01/02/03) but has a few performance and edge-case blind spots.

### Strengths

- **Clean TDD progression.** Red → rename → implement is the right ordering. Plan 01 correctly targets compile errors (RED state), Plan 02 fixes them in isolation, Plan 03 makes tests green.
- **Separate schema sessions.** Creating unique constraints in a different session from data MERGE is correct for Neo4j 5 (schema DDL cannot share a transaction with data writes). The plan and codebase both get this right.
- **Parameterized Cypher.** Using `$requiredSkillIds`/`$candidateSkillIds` prevents Cypher injection — no string interpolation anywhere.
- **Depth-bound audit.** `grep -rn "RELATED_TO\*[^1]"` in the must_haves enforces the architectural invariant that only `*1..2` is used. Good belt-and-suspenders.
- **Idempotent seed.** All MERGE statements mean `seedTaxonomy` can be run repeatedly without duplicating nodes/edges.

### Concerns

1. **HIGH — Plan 03 Cypher proposal has missing aggregation, duplicate rows.**
   The proposed Cypher in Plan 03 Task 1:
   ```cypher
   OPTIONAL MATCH path = ...*1..2...
   WITH reqId,
     CASE
       WHEN reqId IN $candidateSkillIds THEN 0
       WHEN path IS NOT NULL THEN toInteger(length(path))
       ELSE null
     END AS hops
   ```
   If candidate skills `['sql', 'nodejs']` can both reach a required skill `'postgresql'` at 1-hop and 2-hop respectively, this produces **two rows** for `reqId=postgresql` with `hops=1` and `hops=2`. The TypeScript reducer would count both weights, incorrectly inflating the score. The **codebase's actual implementation correctly uses** `min(toInteger(length(path)))` with a grouped `WITH`. The plan text needs updating to match.

2. **MEDIUM — Neo4j session-per-call in a hot loop creates N sessions for N candidates.**
   In both use cases (`getFeed`, `getRanking`), `computeFitScore` is called per candidate inside a `Promise.all`. Each call opens and closes a Neo4j session. For ranking with 100 candidates × 1 job = 100 session create/close cycles. For feed with 20 jobs × 1 candidate = 20 cycles. This adds measurable latency. Consider batching all required skill sets into a single Cypher query, or using a session pool / reuse. The plan doesn't acknowledge this.

3. **MEDIUM — Mock driver doesn't verify Cypher query shape.**
   `makeMockDriver` in Plan 01 creates a mock `session.run()` that returns hardcoded adjacency regardless of what Cypher string or parameters are passed. This means unit tests can't detect if the Cypher query becomes malformed or if wrong parameters are sent. The integration tests (which use real Neo4j) catch this to some extent, but the gap is worth noting. Consider adding a Jest assertion that `session.run` was called with the expected Cypher string and parameter keys.

4. **LOW — `devops` ID collision (Profession vs Skill).**
   The seed creates both a `Profession {id: 'devops'}` and a `Skill {id: 'devops'}`. While they have different labels so Neo4j doesn't conflate them, this is confusing for developers and could cause maintenance issues if a future query does `MATCH (n {id: 'devops'})` without a label constraint. Consider renaming one (e.g., skill `'devops-practices'`).

5. **LOW — `searchRadiusKm: 50` hard-coded in location fallback.**
   The fallback in `computeFitScore` uses `searchRadiusKm > 0 ? searchRadiusKm : 50`, but the integration test factories also default to 50. If a candidate profile is created without `searchRadiusKm` set, Prisma might default it to 0 (depending on the schema), triggering the fallback. Not a Phase 14 issue per se, but the phase touches this code path.

6. **LOW — Integration test `fitScore > 0` assertion is soft.**
   The ranking integration test asserts `expect(score).toBeGreaterThanOrEqual(0)`, which passes for all values including 0. This doesn't prove Neo4j is returning non-zero scores. A `toBeGreaterThan(0)` would be a stronger assertion.

### Suggestions

1. **Fix Plan 03 Cypher to use aggregation.** Replace the proposed query with the pattern already in the codebase:
   ```cypher
   WITH reqId,
        reqId IN $candidateSkillIds AS isDirect,
        min(toInteger(length(path))) AS minPathLen
   ```
   Without this, the adjacency scoring is numerically wrong for any candidate with multiple skills that can reach the same required skill at different hop depths.

2. **Add a session reuse optimization note.** For the ranking use case (N candidates × 1 job), batch all candidates into a single query:
   ```cypher
   UNWIND $candidates AS cand
   UNWIND $requiredSkillIds AS reqId
   OPTIONAL MATCH ...
   WITH cand.id AS candidateId, reqId, hops
   RETURN candidateId, COLLECT({skill: reqId, hops: hops}) AS adjacency
   ```
   This reduces session overhead from O(N) to O(1). Flag as a follow-up optimization.

3. **Add mock query-parameter verification in Plan 01.** The mock driver should at minimum assert that `session.run` was called with the expected parameter keys:
   ```typescript
   expect(mockRun).toHaveBeenCalledWith(
     expect.stringContaining('RELATED_TO'),
     expect.objectContaining({
       requiredSkillIds: expect.any(Array),
       candidateSkillIds: expect.any(Array),
     })
   )
   ```

4. **Add an integration test for multi-candidate ranking that verifies correct hop resolution.** Test scenario: 2 candidates, one with 0-hop match, one with 1-hop match — verify the 0-hop candidate ranks higher. The current tests only test single-candidate scenarios.

5. **Rename `devops` skill to avoid ID collision.** Change `{ id: 'devops', name: 'DevOps' }` to `{ id: 'devops-tooling', name: 'DevOps Tooling' }` in the seed and update any referencing assertions.

### Risk Assessment

**Overall risk: MEDIUM**

The primary risk is the Cypher aggregation bug in Plan 03 (item 1 above), which would cause incorrect fit scores in multi-skill scenarios. The codebase already has the correct fix (`min()` aggregation), but if someone implements from the plan text verbatim, they'd introduce the bug. Performance is the secondary concern — session-per-call will work at small scale but won't hold at 100+ candidates. The TDD structure, security practices (parameterized Cypher, schema isolation), and scope boundaries are all well-handled. The phase goals (GRAPH-01/02/03) are achievable with the current implementation.

---

## Consensus Summary

*(Single reviewer — no consensus analysis needed)*

### Key Findings

1. **Cypher aggregation gap in Plan 03** (HIGH) — the plan text proposes a query that can return duplicate rows per required skill when multiple candidate skills reach the same target. The actual shipped code uses `min()` aggregation and avoids this, so the bug was caught during execution — but the plan document remains inaccurate. Anyone re-executing from the plan would introduce the bug.

2. **Session-per-call performance** (MEDIUM) — `computeFitScore` opens/closes a Neo4j session per call; in `Promise.all` across N candidates, this is N round-trips. Acceptable now but will bottleneck under load.

3. **Mock doesn't assert query shape** (MEDIUM) — unit tests are behaviorally correct but don't guard against Cypher regressions since the mock ignores the query string and parameters entirely.

### Recommended Actions

- Update `14-03-PLAN.md` Cypher block to use `min()` aggregation (or note the already-shipped fix) to prevent future re-implementation from introducing the bug.
- Log `devops` Profession/Skill ID collision as a tech debt item for v3.x.
- Consider adding Cypher query-shape assertions to unit tests in a follow-up.

---

*To incorporate this feedback into a revised plan:*
```
/gsd-plan-phase 14 --reviews
```
