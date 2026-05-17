# Phase 14: Graph Recommendation — Research

**Researched:** 2026-05-16
**Domain:** Neo4j Cypher traversal, fit-score engine refactor, breaking interface change
**Confidence:** HIGH — all findings based on direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Cypher returns adjacency list `[{skill, hops}]`; TypeScript computes weights (0-hop = 1.0x, 1-hop = 0.8x, 2-hop = 0.6x); depth-bounded at `*1..2`.
- **D-02:** `FitScoreInput` uses `skillIds: string[]` (by ID); `FitScoreJobInput` uses `requiredSkillIds: string[]`. Breaking change from names to IDs. All callers updated in this phase.
- **D-03:** ~50 `RELATED_TO` edges across 4 domains (Backend, Frontend, DevOps, Mobile), bidirectional.
- **D-04:** Clean interface — remove `skills`/`requiredSkills` arrays entirely, no fallback accumulation.

### Claude's Discretion

- Exact Cypher structure (parameters, UNWIND vs WITH, aggregation approach)
- How Skill nodes are referenced: `s.id IN $candidateSkillIds` + `j.id IN $jobSkillIds`
- Exact count of skill nodes in seed (target is ~50 edges, not 50 nodes)
- Order of unique constraint creation vs seed execution

### Deferred Ideas (OUT OF SCOPE)

- Integration with ESCO/O*NET taxonomy
- Different weights per adjacency type ("superset" vs "complementary")
- Skill aliasing / name normalization
- Redis caching (Phase 15)
- Skill preview for recruiters (Phase 16)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 | Candidate receives recommended jobs with fit score via Neo4j `RELATED_TO*1..2` traversal (adjacent skills score with decay: 1-hop = 0.8x, 2-hop = 0.6x) | Cypher Query Design section; Test Strategy section |
| GRAPH-02 | Seed script corrected with ~50 `RELATED_TO` tech relations (SQL→PostgreSQL, React→JavaScript, Docker→DevOps, etc.) | Seed Script section; current seed has only 3 edges |
| GRAPH-03 | Neo4j indexes created on `Skill` and `Profession` nodes before any production traversal | Neo4j Constraints section |
</phase_requirements>

---

## Summary

Phase 14 upgrades the fit score engine's skill factor from pure exact-match string comparison to real Neo4j graph traversal. The current implementation in `RecommendationRepository.computeFitScore()` does zero Neo4j calls — it is entirely pure TypeScript math that compares `candidate.skills` (string names) against `job.requiredSkills` (string names) case-insensitively. Neo4j is only touched by `seedTaxonomy()`.

The phase introduces three coordinated changes:

1. **Interface surgery:** `FitScoreInput.skills: string[]` becomes `skillIds: string[]`; `FitScoreJobInput.requiredSkills: string[]` becomes `requiredSkillIds: string[]`. This is a TypeScript breaking change touching 2 use cases, 2 test files, and 2 factory helpers.

2. **Engine upgrade:** `computeFitScore()` now executes one Cypher query per call. Cypher identifies which job skills are reachable from the candidate's skills (at distance 0, 1, or 2 hops) and returns `[{skill: string, hops: number}]`. TypeScript then applies decay weights and computes the fraction.

3. **Seed expansion:** `seedTaxonomy()` grows from 10 skills + 3 `RELATED_TO` edges to 36 skills + 52 `RELATED_TO` directed edges across 4 domains, plus unique constraints on `Skill.id` and `Profession.id`.

**Key insight:** The domain entities `CandidateProfile.skills` and `Job.requiredSkills` stay as `String[]` in PostgreSQL and in the domain layer. The interface change is contained to `FitScoreInput`/`FitScoreJobInput` — the bridge structs used only by `computeFitScore`. The rest of the system (API payloads, DTOs, Prisma schema) is unaffected.

**Primary recommendation:** Implement the Cypher query, update interfaces, update callers, expand seed with constraints — in that order. Write unit tests for the weight-computation math with a mock that returns controlled `[{skill, hops}]` responses; write integration tests against real Neo4j for the full path.

---

## Current Code State

### `src/domain/interfaces/recommendation.repository.interface.ts` (VERIFIED: direct read)

```typescript
export interface FitScoreInput {
  id: string
  professionId: string
  skills: string[]          // <-- rename to skillIds (D-02)
  lat: number | null
  lng: number | null
  preferredModalities: string[]
  salaryExpectation: number | null
  searchRadiusKm: number
}

export interface FitScoreJobInput {
  id: string
  professionId: string
  requiredSkills: string[]  // <-- rename to requiredSkillIds (D-02)
  lat: number | null
  lng: number | null
  modality: string
  salaryMin: number | null
  salaryMax: number | null
}

export interface IRecommendationRepository {
  computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>
  seedTaxonomy(): Promise<void>
}
```

### `src/adapters/services/recommendation.repository.ts` — computeFitScore (VERIFIED: direct read)

Current skill factor (Factor 2, lines 25-32):
```typescript
// Factor 2: Skills overlap (35%) — case-insensitive exact match
if (job.requiredSkills.length === 0) {
  skillsScore = 1.0
} else {
  const matched = job.requiredSkills.filter((req) =>
    candidate.skills.some((cs) => cs.toLowerCase() === req.toLowerCase()),
  )
  skillsScore = matched.length / job.requiredSkills.length
}
```
Zero Neo4j calls. Comment says "RELATED_TO traversal deferred to v1.1" — this is the exact code being replaced.

### `src/adapters/services/recommendation.repository.ts` — seedTaxonomy (VERIFIED: direct read)

Current state:
- **6 Profession nodes** — backend-dev, frontend-dev, fullstack-dev, devops, data-scientist, mobile-dev
- **10 Skill nodes** — nodejs, typescript, javascript, react, postgresql, docker, python, go, kotlin, swift
- **8 REQUIRES** (Profession→Skill) relationships
- **3 RELATED_TO** edge-pairs (bidirectional) — typescript↔javascript, nodejs↔javascript, react↔javascript

**Target:** ~50 `RELATED_TO` edges (26 bidirectional pairs = 52 directed edges). Existing MERGE pattern is correct and must be preserved.

### `src/adapters/services/neo4j.adapter.ts` (VERIFIED: direct read)

Thin delegating wrapper. Does not need changes beyond receiving updated `FitScoreInput`/`FitScoreJobInput` types automatically via TypeScript.

### Domain entities (VERIFIED: direct read)

`CandidateProfile.skills: string[]` — stores skill **names** in PostgreSQL (e.g., `['Node.js', 'TypeScript']`).
`Job.requiredSkills: string[]` — stores skill **names** in PostgreSQL.

The Prisma schema columns are `String[]` for both. They are skill names, not IDs.

**Critical consequence:** After D-02, the use cases must map from `candidate.skills` (names stored in Postgres) to skill IDs before building `FitScoreInput`. The mapping strategy must be decided:
- Option A: Callers pass IDs directly — requires that candidate profiles store skill IDs, not names. This is a Prisma schema change (out of scope per D-04 notes, but implied by D-02).
- Option B: Callers map name→ID locally using a lookup table — fragile, duplicates domain logic.
- Option C: Neo4j query matches by name, not ID — contradicts D-02 literally but preserves the name-based Postgres storage.

**Resolution from CONTEXT.md D-02:** "Cypher faz match por ID: `WHERE s.id IN $skillIds`." The IDs in Neo4j Skill nodes follow a slug pattern: `{id: 'postgresql', name: 'PostgreSQL'}`, `{id: 'nodejs', name: 'Node.js'}`. For the use cases to pass skill IDs, they must receive IDs from somewhere. The factories in tests currently pass skill names as strings. **The planner must resolve this mapping gap.** Options: (1) keep `skills: string[]` in Postgres as IDs (change stored values from names to IDs — data+schema migration), or (2) Cypher matches by name (overriding D-02 literally), or (3) a lookup table in the adapter normalizes names to IDs before the Cypher call.

---

## Callers Audit

Every file that builds `FitScoreInput` or `FitScoreJobInput`, or reads `candidate.skills` / `job.requiredSkills` for scoring purposes (VERIFIED: direct codebase inspection):

### Files that directly construct FitScoreInput / FitScoreJobInput

| File | What to Change |
|------|----------------|
| `src/application/use-cases/swipe/get-feed.use-case.ts` | `skills: candidate.skills` → `skillIds: candidate.skills` (or mapped IDs); `requiredSkills: job.requiredSkills` → `requiredSkillIds: job.requiredSkills` |
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | Same — two occurrences: one for `FitScoreInput`, one for `FitScoreJobInput`; also `skills: swipe.candidate.skills` in the censored profile object (line 67 — NOT a FitScoreInput field) — that one stays unchanged |

### Test files that build FitScoreInput / FitScoreJobInput via factory helpers

| File | What to Change |
|------|----------------|
| `tests/unit/recommendation.service.test.ts` | `makeCandidate()`: `skills: ['Node.js', 'TypeScript']` → `skillIds: ['nodejs', 'typescript']`; `makeJob()`: `requiredSkills: ['Node.js', 'TypeScript']` → `requiredSkillIds: ['nodejs', 'typescript']`. All test cases using skill names as match values must be updated. |
| `tests/integration/recommendation.test.ts` | Same factory helpers; plus `makeCandidate`/`makeJob` defaults; integration test expectations about skill scoring need updating. Hardcoded `skills: ['Node.js', 'TypeScript']` in inline `candidateProfile.create` calls stay as-is (Prisma data, not scoring data). |

### Files that expose `skills` / `requiredSkills` at the API boundary (NOT affected by D-02)

| File | Status |
|------|--------|
| `src/adapters/controllers/candidate.controller.ts` | `CandidateProfileSchema`: `skills: z.array(z.string())` — this is API input/output for profile CRUD, unrelated to `FitScoreInput`. No change needed. |
| `src/adapters/controllers/job.controller.ts` | `CreateJobSchema` / `UpdateJobSchema`: `requiredSkills: z.array(z.string())` — same, CRUD-only. No change needed. |
| `src/adapters/controllers/credits.controller.ts` | `candidateProfile.skills` used for response enrichment (line 47) — display only, not scoring. No change needed. |
| `src/adapters/repositories/candidate.repository.ts` | `toDomain()` maps `row.skills` → `CandidateProfile.skills` — stays as-is. |
| `src/adapters/repositories/job.repository.ts` | `toDomain()` maps `row.requiredSkills` → `Job.requiredSkills` — stays as-is. |
| `src/adapters/repositories/swipe.repository.ts` | `toCandidateDomain()` maps `row.skills` — stays as-is. |
| `src/domain/entities/candidate.entity.ts` | `CandidateProfile.skills: string[]` — stays as-is (domain entity unchanged). |
| `src/domain/entities/job.entity.ts` | `Job.requiredSkills: string[]` — stays as-is. |
| `tests/helpers/factories.ts` | `createCandidate()`: `skills: ['Node.js', 'TypeScript']` is Prisma data for PostgreSQL — stays as-is. `createJob()`: `requiredSkills: ['Node.js', 'TypeScript']` is Prisma data — stays as-is. |

### Files that will NOT change

| File | Reason |
|------|--------|
| `src/application/ports/graph.port.ts` | `IGraphPort` interface (`syncCandidate`, `syncJob`, `calculateFitScore`, `getRecommendedJobs`) — not implemented or called anywhere in v2.0; an aspirational port stub. No change. |
| `src/infrastructure/database/neo4j.ts` | Driver singleton with `disableLosslessIntegers: true` — no change. |
| `scripts/check-deps.ts` | Layer enforcement — no change (Cypher stays in adapters/). |
| All other integration tests | Only `recommendation.test.ts` exercises `computeFitScore`/`seedTaxonomy` directly. |

### Summary: 4 files need code changes for D-02

1. `src/domain/interfaces/recommendation.repository.interface.ts` (interface definition)
2. `src/application/use-cases/swipe/get-feed.use-case.ts` (caller)
3. `src/application/use-cases/swipe/get-ranking.use-case.ts` (caller)
4. `tests/unit/recommendation.service.test.ts` (factories)
5. `tests/integration/recommendation.test.ts` (factories + new adjacency test case)

And 1 file for D-01+GRAPH-01+GRAPH-02+GRAPH-03:

6. `src/adapters/services/recommendation.repository.ts` (main implementation file)

---

## Cypher Query Design

### The Adjacency Query (D-01)

The Cypher query must: given a candidate's skill IDs and a job's required skill IDs, return for each required skill the minimum number of hops from any candidate skill to that required skill (0 = direct match, 1 = one hop, 2 = two hops), bounded at `*1..2`. [ASSUMED: exact Cypher syntax below — to be verified against neo4j-driver docs during implementation]

**Recommended Cypher (Claude's discretion — two-clause pattern honoring *1..2):**

```cypher
UNWIND $requiredSkillIds AS reqId
OPTIONAL MATCH (direct:Skill {id: reqId}) WHERE reqId IN $candidateSkillIds
OPTIONAL MATCH path = (cand:Skill)-[:RELATED_TO*1..2]->(adj:Skill {id: reqId})
  WHERE cand.id IN $candidateSkillIds
WITH reqId,
  CASE
    WHEN reqId IN $candidateSkillIds THEN 0
    WHEN path IS NOT NULL THEN toInteger(length(path))
    ELSE null
  END AS hops
WHERE hops IS NOT NULL
RETURN reqId AS skill, hops
```

Key points:
- `*1..2` captures 1-hop and 2-hop paths only (per D-01 / SC-4). 0-hop (direct match) is handled by the `CASE WHEN reqId IN $candidateSkillIds THEN 0` branch — NOT through the RELATED_TO relationship.
- This two-clause approach correctly honors the locked decision that the traversal depth is `*1..2`.
- `WHERE hops IS NOT NULL` filters out required skills with no candidate path at any depth.
- Parameters: `$candidateSkillIds: string[]`, `$requiredSkillIds: string[]`.
- Result: `[{skill: string, hops: number}]` where hops is 0, 1, or 2.

**Alternative with explicit hop counting (UNION approach):**

```cypher
UNWIND $requiredSkillIds AS reqId
CALL {
  WITH reqId
  MATCH (req:Skill {id: reqId})
  OPTIONAL MATCH (cand:Skill {id: reqId})
    WHERE cand.id IN $candidateSkillIds
  RETURN 0 AS hops, cand IS NOT NULL AS found
  UNION
  WITH reqId
  MATCH (cand:Skill)-[:RELATED_TO]->(req:Skill {id: reqId})
    WHERE cand.id IN $candidateSkillIds
  RETURN 1 AS hops, true AS found
  UNION
  WITH reqId
  MATCH (cand:Skill)-[:RELATED_TO*2]->(req:Skill {id: reqId})
    WHERE cand.id IN $candidateSkillIds
  RETURN 2 AS hops, true AS found
}
RETURN reqId AS skill, min(hops) AS hops
```

### TypeScript Weight Application (D-01)

After the Cypher call returns the adjacency list, TypeScript computes `skillsScore`:

```typescript
// Decision D-01: weight by hops
const WEIGHT: Record<number, number> = { 0: 1.0, 1: 0.8, 2: 0.6 }

const adjacency: Array<{skill: string, hops: number}> = /* Cypher result */

if (job.requiredSkillIds.length === 0) {
  skillsScore = 1.0
} else {
  const totalWeight = adjacency.reduce((sum, {hops}) => sum + (WEIGHT[hops] ?? 0), 0)
  // Max possible weight = all required skills at 0 hops = 1.0 per skill
  skillsScore = totalWeight / job.requiredSkillIds.length
  skillsScore = Math.min(skillsScore, 1.0) // clamp: adjacency can produce weight > 1 if candidate has both direct and adjacent
}
```

**Edge case:** If a candidate directly holds a required skill AND that skill is adjacent to another required skill, the adjacency list returns that skill once (for the requirement it satisfies), so no double-counting from the candidate side. Double-counting can only occur if a single required skill is reachable by multiple candidate skills — `min(hops)` handles this correctly.

**No-skills edge case:** `requiredSkillIds.length === 0` → `skillsScore = 1.0` (preserved from current logic).

### Neo4j Session Mode

The adjacency query is a read operation. Use `neo4j.session.READ` (not WRITE):

```typescript
const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
```

`disableLosslessIntegers: true` is already configured on the driver (Phase 06-01 decision) — `hops` will be a JS `number`, not `neo4j.Integer`.

---

## Neo4j Constraints

### Syntax for Neo4j 5 (VERIFIED: Neo4j 5 docs pattern [CITED: neo4j.com/docs/cypher-manual/current/constraints/])

Neo4j 5 uses this syntax for unique node property constraints:

```cypher
CREATE CONSTRAINT skill_id_unique IF NOT EXISTS
FOR (s:Skill) REQUIRE s.id IS UNIQUE
```

```cypher
CREATE CONSTRAINT profession_id_unique IF NOT EXISTS
FOR (p:Profession) REQUIRE p.id IS UNIQUE
```

**Note:** The `IF NOT EXISTS` clause makes these idempotent — safe to run on every startup.

**Old syntax (Neo4j 3.x / 4.x)** — do NOT use:
```cypher
CREATE CONSTRAINT ON (s:Skill) ASSERT s.id IS UNIQUE  -- deprecated, fails on Neo4j 5
```

### Order of Operations (GRAPH-03)

Constraints must be created **before** any `MERGE` statements in `seedTaxonomy()`. When a constraint exists on a property, `MERGE` uses an index seek instead of a label scan. Creating constraints after seeding is safe but misses the performance benefit during seeding itself.

**Recommended execution order inside `seedTaxonomy()`:**

1. `CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE`
2. `CREATE CONSTRAINT profession_id_unique IF NOT EXISTS FOR (p:Profession) REQUIRE p.id IS UNIQUE`
3. All `MERGE (p:Profession {...})` statements
4. All `MERGE (s:Skill {...})` statements
5. All `MERGE (p)-[:REQUIRES]->(s)` statements
6. All `MERGE (a)-[:RELATED_TO]->(b)` + `MERGE (b)-[:RELATED_TO]->(a)` statements

**Transaction boundary:** Constraints must be created in their own `executeWrite` call (or auto-commit) before the MERGE transaction. Neo4j does not allow schema changes and data writes in the same transaction.

```typescript
// Step 1: schema (separate transaction)
const schemaSession = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
try {
  await schemaSession.run(
    'CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE'
  )
  await schemaSession.run(
    'CREATE CONSTRAINT profession_id_unique IF NOT EXISTS FOR (p:Profession) REQUIRE p.id IS UNIQUE'
  )
} finally {
  await schemaSession.close()
}

// Step 2: data (existing executeWrite pattern)
const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
try {
  await session.executeWrite(async (tx) => { /* MERGE nodes and edges */ })
} finally {
  await session.close()
}
```

---

## Test Strategy

### Unit Tests (`tests/unit/recommendation.service.test.ts`) — VERIFIED: direct read

**Current state:** 13 test cases (profession, skills, location, modality, salary, composite). All pass a fake `Driver` (`{} as any`) because the current `computeFitScore` makes no DB calls.

**After Phase 14:** `computeFitScore` will call `this.driver.session()`. Unit tests must mock the session to return controlled adjacency results. The fake Driver pattern must be replaced.

**Unit test mock structure:**

```typescript
// Create a mock driver that returns a controlled adjacency result
function makeMockDriver(adjacency: Array<{skill: string, hops: number}>): Driver {
  const mockRun = jest.fn().mockResolvedValue({
    records: adjacency.map(({skill, hops}) => ({
      get: (key: string) => key === 'skill' ? skill : hops,
    })),
  })
  const mockSession = { run: mockRun, close: jest.fn().mockResolvedValue(undefined) }
  return { session: jest.fn().mockReturnValue(mockSession) } as unknown as Driver
}
```

**Test cases to add or rewrite:**

| Test Case | adjacency mock input | Expected skillsScore |
|-----------|---------------------|----------------------|
| Direct match (0 hop) | `[{skill: 'postgresql', hops: 0}]`, requiredSkillIds: `['postgresql']` | 1.0 (100% of 35% = 35 pts contribution) |
| 1-hop adjacency | `[{skill: 'postgresql', hops: 1}]`, requiredSkillIds: `['postgresql']` | 0.8 |
| 2-hop adjacency | `[{skill: 'postgresql', hops: 2}]`, requiredSkillIds: `['postgresql']` | 0.6 |
| No adjacency | `[]`, requiredSkillIds: `['postgresql']` | 0.0 |
| Mixed (1 direct + 1 adjacent) | `[{skill: 'postgresql', hops: 0}, {skill: 'typescript', hops: 1}]`, requiredSkillIds: `['postgresql', 'typescript']` | (1.0 + 0.8)/2 = 0.9 |
| No required skills | adjacency `[]`, requiredSkillIds `[]` | 1.0 (short-circuit) |

**Existing tests that need factory updates (D-02):**
- `makeCandidate()`: `skills: ['Node.js', 'TypeScript']` → `skillIds: ['nodejs', 'typescript']`
- `makeJob()`: `requiredSkills: ['Node.js', 'TypeScript']` → `requiredSkillIds: ['nodejs', 'typescript']`
- All composite test cases that asserted `score === 100` must be verified post-change (the 100-score test now requires the adjacency mock to return 0-hop matches for all required skills).

### Integration Tests (`tests/integration/recommendation.test.ts`) — VERIFIED: direct read

**Current state:** Uses `setupNeo4j()` which deletes all Neo4j data then calls `seedTaxonomy()`. Tests verify node counts (6 professions, 10 skills, 16 total), idempotency, REQUIRES relationships, and basic score correctness.

**Tests that break with Phase 14 changes:**

1. **"creates Skill nodes for all 10 skills"** — seed will have 36 skills after GRAPH-02. Must update expected count to 36.
2. **"running seedTaxonomy twice does not duplicate nodes"** — expected total node count `16` must be updated to `42` (36 skills + 6 professions).
3. **Factory helpers** `makeCandidate`/`makeJob` — field names change from `skills`/`requiredSkills` to `skillIds`/`requiredSkillIds`.
4. **"perfect match candidate scores 100"** — after Phase 14, a perfect score requires the Cypher traversal to return 0-hop matches for all required skills. This will work if seed data contains the skill IDs passed in `skillIds`.

**New integration test required (Success Criterion 1):**

```typescript
it('candidate with SQL skill scores nonzero on PostgreSQL job (1-hop adjacency)', async () => {
  // Seed must have: MERGE (sql:Skill {id:'sql'})-[:RELATED_TO]->(pg:Skill {id:'postgresql'})
  const candidate = makeCandidate({ skillIds: ['sql'] })   // has SQL, not PostgreSQL
  const job = makeJob({ requiredSkillIds: ['postgresql'] }) // requires PostgreSQL
  const score = await recRepo.computeFitScore(candidate, job)
  // SQL→PostgreSQL is 1 hop at 0.8x decay on the 35% skills factor
  // skillsScore = 0.8/1 = 0.8 → contributes 0.8 * 0.35 = 0.28
  expect(score).toBeGreaterThan(0)
  // Verify it is NOT a full-match score (1-hop < 1.0)
  const directMatch = makeCandidate({ skillIds: ['postgresql'] })
  const directScore = await recRepo.computeFitScore(directMatch, job)
  expect(score).toBeLessThan(directScore)
})
```

### Depth-Bound Verification (Success Criterion 4)

A grep/AST check that no `RELATED_TO*` without a bound appears in the codebase, and that the only bound used is `*1..2` (not `*0..2`):

```bash
grep -rn "RELATED_TO\*[^1]" src/
# Should return no results (all RELATED_TO traversal is bounded at *1..2; 0-hop is a separate CASE WHEN clause)
```

---

## Seed Script

### Current Invocation (VERIFIED: direct read)

`seedTaxonomy()` is called from `tests/helpers/neo4j-setup.ts`:

```typescript
export async function setupNeo4j(): Promise<void> {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    await session.run('MATCH (n) DETACH DELETE n')   // wipe all data
    const repo = new RecommendationRepository(driver)
    await repo.seedTaxonomy()
  } finally {
    await session.close()
  }
}
```

This is called only in `beforeAll` of `tests/integration/recommendation.test.ts`. There is no app-startup call to `seedTaxonomy()` — it is test-only infra.

**Production seeding:** There is no app.ts or server.ts call to `seedTaxonomy()`. The recommendation integration test is the only consumer. For production, the data must be manually seeded or seeded as part of deployment.

### Idempotency

The existing MERGE pattern is correct and idempotent:
```typescript
await tx.run('MERGE (s:Skill {id: $id}) SET s.name = $name', s)
```
`MERGE` on `id` creates the node only if it does not exist; `SET s.name = $name` updates the name if it has changed. With unique constraints on `Skill.id`, each MERGE performs an indexed lookup — O(1) per node.

For edges:
```typescript
await tx.run(
  'MATCH (a:Skill {id: $aId}), (b:Skill {id: $bId}) MERGE (a)-[:RELATED_TO]->(b)',
  r,
)
```
`MERGE` on relationship is also idempotent — does not duplicate if the edge already exists.

### Test Isolation Impact

`setupNeo4j()` wipes ALL Neo4j data (`MATCH (n) DETACH DELETE n`) before seeding. This means:
- Constraints are deleted too when nodes are deleted, but schema constraints survive `DETACH DELETE` — constraints are schema objects, not data.
- After wipe + seed, constraints still exist from the previous run, so `CREATE CONSTRAINT IF NOT EXISTS` is safe.
- Node counts in integration tests must be updated to match the expanded seed: 36 Skill nodes + 6 Profession nodes = 42 total nodes.

### Seed Structure (D-03 domains) — RESOLVED

Final seed: 36 Skill nodes, 6 Profession nodes, 26 bidirectional RELATED_TO pairs (52 directed edges).

**Skill count breakdown:**
- Original 10: nodejs, typescript, javascript, react, postgresql, docker, python, go, kotlin, swift
- Backend new (7): sql, mysql, java, spring, rust, django, fastapi
- Frontend new (6): vue, angular, css, sass, tailwind, nextjs
- DevOps new (8): kubernetes, devops, aws, cloud, terraform, iac, github-actions, ci-cd
- Mobile new (5): ios, android, react-native, flutter, dart
- **Total: 36 Skill nodes**

---

## Breaking Change Risk

### Scope Assessment

The breaking change (D-02: `skills` → `skillIds`, `requiredSkills` → `requiredSkillIds`) is **entirely contained within the TypeScript type system**. No API contract, no Prisma schema, and no database column is affected.

| Layer | Risk | Reason |
|-------|------|--------|
| REST API payloads | None | `skills` / `requiredSkills` field names in request/response bodies are unrelated to `FitScoreInput` — different code paths |
| Prisma schema | None | `CandidateProfile.skills` and `Job.requiredSkills` columns stay unchanged |
| Domain entities | None | `CandidateProfile.skills: string[]` and `Job.requiredSkills: string[]` stay unchanged |
| `FitScoreInput` / `FitScoreJobInput` | Yes | Field names change — TypeScript compile error forces all callers to update |
| `get-feed.use-case.ts` | Yes | Two field assignments must be renamed |
| `get-ranking.use-case.ts` | Yes | Two field assignments must be renamed; note line 67 `skills: swipe.candidate.skills` is in the censored profile object (NOT a FitScoreInput field) — that one stays unchanged |
| Unit test factories | Yes | `makeCandidate()` and `makeJob()` field names must change |
| Integration test factories | Yes | Same as above |

### The Skill ID Mapping Problem — RESOLVED (Option A adopted)

**Resolution:** Option A is adopted — Postgres stores skill IDs (slugs: `'nodejs'`, `'typescript'`) rather than display names. This is a Phase 14 convention enforced by:
1. Test factories in `tests/helpers/factories.ts` updated to default to slug IDs (Plan 01 Task 3)
2. Inline code comments at both `skillIds` assignment sites in use-case files (Plan 02 Task 2): `// CandidateProfile.skills stores Neo4j skill IDs (e.g. 'nodejs') — Phase 14 convention`

No Prisma schema migration is needed (column type stays `String[]`). The convention is enforced by the unique constraint on `Skill.id` in Neo4j — if a non-existent ID is passed, the traversal simply returns no adjacency for that skill.

### No Routes or DTOs Need Changes

Confirmed by inspection: no Fastify route schema, no Zod schema at the API boundary, and no controller method builds `FitScoreInput` directly. The change is confined to the two use case files and two test files.

---

## Validation Architecture

### Test Framework (VERIFIED: direct read)

| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` |
| Integration run command | `npx jest tests/integration/recommendation.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAPH-01 | 1-hop adjacency produces nonzero score (SQL→PostgreSQL at 0.8x) | integration | `npx jest tests/integration/recommendation.test.ts -t "1-hop adjacency"` | New test in existing file |
| GRAPH-01 | 0-hop direct match produces full skill weight | unit | `npx jest tests/unit/recommendation.service.test.ts -t "direct match"` | Update existing |
| GRAPH-01 | No adjacency produces 0 skill score | unit | `npx jest tests/unit/recommendation.service.test.ts -t "no adjacency"` | New test |
| GRAPH-01 | Mixed hop depths produce correct weighted average | unit | `npx jest tests/unit/recommendation.service.test.ts -t "mixed hop"` | New test |
| GRAPH-02 | Seed creates at least 50 RELATED_TO edges | integration | `npx jest tests/integration/recommendation.test.ts -t "50 RELATED_TO edges"` | New test |
| GRAPH-02 | seedTaxonomy remains idempotent after expansion | integration | `npx jest tests/integration/recommendation.test.ts -t "idempotent"` | Update expected count |
| GRAPH-03 | Skill.id unique constraint exists after seed | integration | `npx jest tests/integration/recommendation.test.ts -t "unique constraint"` | New test |
| GRAPH-03 | Profession.id unique constraint exists after seed | integration | `npx jest tests/integration/recommendation.test.ts -t "unique constraint"` | New test |
| (SC-5) | All 172 existing tests remain green | integration | `npx jest --no-coverage` | All existing files |

### Critical Verification Scenarios

**Scenario 1 (Success Criterion 1):** SQL → PostgreSQL adjacency
- Seed: `sql` and `postgresql` nodes with `RELATED_TO` edge
- Candidate: `skillIds: ['sql']`
- Job: `requiredSkillIds: ['postgresql']`
- Expected: `score > 0` (skill contribution: 0.8 * 0.35 * 100 = 28 points from skills alone)
- Expected: `score < score_of_direct_match` (direct would be 1.0 * 0.35 = 35 from skills)

**Scenario 2 (D-01 depth bound):** 3-hop path does NOT contribute
- Seed: sql → postgresql → mysql (two separate RELATED_TO edges)
- Candidate: `skillIds: ['sql']`
- Job: `requiredSkillIds: ['mysql']`
- SQL→PostgreSQL→MySQL is 2 hops from sql to mysql
- Expected: `score > 0` (2-hop contributes 0.6x)
- 3-hop test: if there were a 3-hop path, it should NOT appear (bounded at `*1..2`)

**Scenario 3 (idempotency):** Run `seedTaxonomy()` twice — node count must not double. Expected: 42 total nodes (36 + 6), not 84.

**Scenario 4 (constraint existence):**
```cypher
SHOW CONSTRAINTS
```
Must include entries for `Skill.id` and `Profession.id`.

### Wave 0 Gaps (Test Files to Create/Update Before Implementation)

- [x] Update `tests/unit/recommendation.service.test.ts` — new mock driver pattern, renamed factory fields, new adjacency test cases
- [x] Update `tests/integration/recommendation.test.ts` — renamed factory fields, updated node count assertions (36/42), new adjacency integration test, new constraint verification test
- No new test files needed — all changes fit in existing test files

---

## Open Questions (RESOLVED)

1. **Skill ID mapping resolution (CRITICAL)**
   - **RESOLVED:** Option A adopted — Postgres stores slug IDs (`'nodejs'`, `'typescript'`). Test factories in `tests/helpers/factories.ts` updated to slug defaults in Plan 01 Task 3. Inline convention comments added at both `skillIds` assignment sites in use-case files in Plan 02 Task 2.

2. **Exact node count after GRAPH-02 seed**
   - **RESOLVED:** 36 Skill nodes (10 original + 7 backend + 6 frontend + 8 DevOps + 5 mobile = 36). Total nodes: 36 + 6 professions = 42. Integration test assertions updated to `toBe(36)` and `toBe(42)` in Plan 01 Task 2.

3. **`IGraphPort` in `src/application/ports/graph.port.ts`**
   - **RESOLVED:** Leave `IGraphPort` untouched — it is dead code (not implemented or called anywhere in v2.0). Out of Phase 14 scope.

---

## Sources

### Primary (HIGH confidence — codebase direct inspection)
- `src/adapters/services/recommendation.repository.ts` — full current implementation
- `src/domain/interfaces/recommendation.repository.interface.ts` — interface definition
- `src/application/use-cases/swipe/get-feed.use-case.ts` — caller 1
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — caller 2
- `tests/unit/recommendation.service.test.ts` — unit test structure
- `tests/integration/recommendation.test.ts` — integration test structure
- `tests/helpers/factories.ts` — factory helpers
- `tests/helpers/neo4j-setup.ts` — Neo4j test setup
- `prisma/schema.prisma` — data model for skills/requiredSkills columns
- `src/adapters/controllers/candidate.controller.ts`, `job.controller.ts`, `credits.controller.ts` — API boundary (not affected)
- `.planning/phases/14-graph-recommendation/14-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence — Neo4j documentation pattern)
- [CITED: neo4j.com/docs/cypher-manual] — Neo4j 5 constraint syntax (`FOR (s:Skill) REQUIRE s.id IS UNIQUE`)
- [CITED: neo4j.com/docs/api/javascript-driver] — `disableLosslessIntegers: true`, session modes

### Tertiary (LOW confidence — assumed)
- Exact Cypher query form using `length(path)` for hop counting [ASSUMED — may need adjustment]
- Exact skill taxonomy pairs for the 52-edge seed [ASSUMED — D-03 lists domains but not every pair]

---

## Metadata

**Confidence breakdown:**
- Current code state: HIGH — verified by direct file inspection
- Callers audit: HIGH — verified by grep across full codebase
- Cypher query design: MEDIUM — pattern is correct; exact syntax needs implementation validation
- Neo4j constraints: HIGH — Neo4j 5 syntax cited from official docs
- Test strategy: HIGH — based on existing test structure
- Seed structure: MEDIUM — domain list from D-03, exact pairs assumed
- Breaking change risk: HIGH — confirmed by tracing all call sites

**Research date:** 2026-05-16
**Valid until:** 2026-06-16 (stable codebase, no external API changes)

---

## RESEARCH COMPLETE

**Phase:** 14 — Graph Recommendation
**Confidence:** HIGH (with one MEDIUM caveat on Cypher syntax and seed pairs)

### Key Findings

1. **computeFitScore makes zero Neo4j calls today** — the entire skills factor is pure TypeScript string comparison (`candidate.skills` vs `job.requiredSkills` case-insensitive). The Neo4j session is only used by `seedTaxonomy()`.

2. **Exactly 4 source files need field renames** (D-02): the interface file, two use case files, and two test files. No routes, no controllers, no Prisma schema, no domain entities.

3. **Skill ID mapping resolved (Option A).** Postgres stores skill IDs (slugs). Convention documented in inline code comments at both call sites in Plan 02 Task 2. Factories updated in Plan 01 Task 3.

4. **Constraints must be created in a separate transaction** from the data MERGE calls — Neo4j 5 does not allow schema changes and data writes in the same transaction.

5. **Unit tests need a mock driver** — after Phase 14, `computeFitScore` will call `this.driver.session()`, so the `{} as any` fake driver used today will throw. The unit test plan must include mock driver setup before implementation.

6. **`setupNeo4j()` wipes Neo4j data completely** before seeding in tests — integration test node count assertions updated to 36 skills / 42 total nodes.

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Current code state | HIGH | Direct file inspection |
| Callers audit | HIGH | grep across entire src/ and tests/ |
| Cypher query design | MEDIUM | Pattern correct; exact `length(path)` vs `size(r)` needs runtime validation |
| Neo4j constraints | HIGH | Cited from Neo4j 5 docs |
| Test strategy | HIGH | Based on existing test structure |
| Seed pairs | MEDIUM | Domain list locked; exact pairing assumed |
| Breaking change scope | HIGH | Full call-site trace completed |

### Open Questions
All open questions resolved. See "Open Questions (RESOLVED)" section above.

### Ready for Execution
Research complete and all planning questions resolved. Plans 01–03 are ready for execution.
