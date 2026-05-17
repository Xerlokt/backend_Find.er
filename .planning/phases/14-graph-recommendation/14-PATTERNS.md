# Phase 14: Graph Recommendation - Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 6
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/domain/interfaces/recommendation.repository.interface.ts` | interface | request-response | itself (surgical rename) | self |
| `src/adapters/services/recommendation.repository.ts` | service/adapter | request-response + graph I/O | itself (engine upgrade) + `src/adapters/services/neo4j.adapter.ts` | self + role-match |
| `src/application/use-cases/swipe/get-feed.use-case.ts` | use-case | request-response | `src/application/use-cases/swipe/get-ranking.use-case.ts` | exact |
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | use-case | request-response | `src/application/use-cases/swipe/get-feed.use-case.ts` | exact |
| `tests/unit/recommendation.service.test.ts` | test (unit) | request-response | itself (mock upgrade + field renames) | self |
| `tests/integration/recommendation.test.ts` | test (integration) | request-response + graph I/O | itself (factory renames + new test cases) | self |

---

## Pattern Assignments

### `src/domain/interfaces/recommendation.repository.interface.ts` (interface, surgical rename)

**Analog:** itself — the full current content is the starting point for D-02.

**Current interface** (lines 1-26, full file):
```typescript
export interface FitScoreInput {
  id: string
  professionId: string
  skills: string[]          // RENAME to skillIds: string[]
  lat: number | null
  lng: number | null
  preferredModalities: string[]
  salaryExpectation: number | null
  searchRadiusKm: number
}

export interface FitScoreJobInput {
  id: string
  professionId: string
  requiredSkills: string[]  // RENAME to requiredSkillIds: string[]
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

**What changes (D-02, D-04):**
- `skills: string[]` → `skillIds: string[]`
- `requiredSkills: string[]` → `requiredSkillIds: string[]`
- No other fields added or removed — clean substitution, no fallback accumulation.

---

### `src/adapters/services/recommendation.repository.ts` (service/adapter, graph I/O + request-response)

**Analog:** itself — existing file is the template; the skills factor block (lines 23-32) and `seedTaxonomy` (lines 72-141) are the sections under change.

**Session pattern for READ queries** — copy from `seedTaxonomy` (lines 73-74, 138-139), change mode to READ:
```typescript
const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
try {
  // ... session.run(query, params)
} finally {
  await session.close()
}
```

**Current skills factor to be replaced** (lines 23-32):
```typescript
// Factor 2: Skills overlap (35%) — case-insensitive exact match (RELATED_TO traversal deferred to v1.1)
let skillsScore: number
if (job.requiredSkills.length === 0) {
  skillsScore = 1.0
} else {
  const matched = job.requiredSkills.filter((req) =>
    candidate.skills.some((cs) => cs.toLowerCase() === req.toLowerCase()),
  )
  skillsScore = matched.length / job.requiredSkills.length
}
```

**Replacement pattern (D-01) — Cypher adjacency + TypeScript weight math:**
```typescript
// Factor 2: Skills overlap (35%) — Neo4j RELATED_TO*1..2 traversal (Phase 14, per D-01/SC-4)
// 0-hop (direct match) handled via CASE WHEN, not *0..2
const WEIGHT: Record<number, number> = { 0: 1.0, 1: 0.8, 2: 0.6 }
let skillsScore: number
if (job.requiredSkillIds.length === 0) {
  skillsScore = 1.0
} else {
  const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
  let adjacency: Array<{ skill: string; hops: number }> = []
  try {
    const result = await session.run(
      `UNWIND $requiredSkillIds AS reqId
       OPTIONAL MATCH path = (cand:Skill)-[:RELATED_TO*1..2]->(adj:Skill {id: reqId})
         WHERE cand.id IN $candidateSkillIds
       WITH reqId,
         CASE
           WHEN reqId IN $candidateSkillIds THEN 0
           WHEN path IS NOT NULL THEN toInteger(length(path))
           ELSE null
         END AS hops
       WHERE hops IS NOT NULL
       RETURN reqId AS skill, hops`,
      {
        requiredSkillIds: job.requiredSkillIds,
        candidateSkillIds: candidate.skillIds,
      },
    )
    adjacency = result.records.map((r) => ({
      skill: r.get('skill') as string,
      hops: r.get('hops') as number,
    }))
  } finally {
    await session.close()
  }
  const totalWeight = adjacency.reduce((sum, { hops }) => sum + (WEIGHT[hops] ?? 0), 0)
  skillsScore = Math.min(totalWeight / job.requiredSkillIds.length, 1.0)
}
```

**Schema constraint pattern (GRAPH-03) — separate transaction before data MERGE:**
```typescript
// Step 1: schema constraints (must be in separate session from data writes)
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

// Step 2: data MERGE (existing executeWrite pattern, lines 74-136)
const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
try {
  await session.executeWrite(async (tx) => { /* MERGE nodes and edges */ })
} finally {
  await session.close()
}
```

**RELATED_TO MERGE pattern** (lines 130-135) — idempotent bidirectional, preserve `{weight: 0.8}`:
```typescript
await tx.run(
  'MATCH (a:Skill {id: $aId}), (b:Skill {id: $bId}) MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b) MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)',
  r,
)
```

**Skill MERGE pattern** (lines 102-104) — idempotent, exact template for new skill nodes:
```typescript
for (const s of skills) {
  await tx.run('MERGE (s:Skill {id: $id}) SET s.name = $name', s)
}
```

---

### `src/application/use-cases/swipe/get-feed.use-case.ts` (use-case, request-response)

**Analog:** `src/application/use-cases/swipe/get-ranking.use-case.ts` — identical FitScoreInput construction pattern.

**What changes (D-02) — field rename only** (lines 27-43):
```typescript
// BEFORE (lines 27-43):
{
  id: candidate.id,
  professionId: candidate.professionId,
  skills: candidate.skills,              // line 29
  ...
} satisfies FitScoreInput,
{
  id: job.id,
  professionId: job.professionId,
  requiredSkills: job.requiredSkills,    // line 39
  ...
} satisfies FitScoreJobInput,

// AFTER:
{
  id: candidate.id,
  professionId: candidate.professionId,
  skillIds: candidate.skills,            // renamed field; value source unchanged
  ...
} satisfies FitScoreInput,
{
  id: job.id,
  professionId: job.professionId,
  requiredSkillIds: job.requiredSkills,  // renamed field; value source unchanged
  ...
} satisfies FitScoreJobInput,
```

**Note on skill ID mapping (Open Question from RESEARCH.md):** The planner must adopt Option A — Postgres stores skill IDs (slugs like `'nodejs'`, `'typescript'`) not display names. Test factories in `tests/helpers/factories.ts` that currently pass `skills: ['Node.js', 'TypeScript']` to `prisma.candidateProfile.create` must be updated to `skills: ['nodejs', 'typescript']`. The `satisfies FitScoreInput` compile-time check will catch any caller that misses the rename.

**Preserved structural pattern** (lines 21-47) — `Promise.all` + spread + fitScore injection is unchanged:
```typescript
const scoredData = await Promise.all(
  data.map(async (job) => ({
    ...job,
    fitScore: await this.rec.computeFitScore(
      { ... } satisfies FitScoreInput,
      { ... } satisfies FitScoreJobInput,
    ),
  })),
)
```

---

### `src/application/use-cases/swipe/get-ranking.use-case.ts` (use-case, request-response)

**Analog:** `src/application/use-cases/swipe/get-feed.use-case.ts` — mirror of the same rename.

**What changes (D-02) — two occurrences** (lines 40-41 and 51-52):
```typescript
// Line 41 — FitScoreInput construction:
skills: swipe.candidate.skills,           // RENAME to skillIds:

// Line 52 — FitScoreJobInput construction:
requiredSkills: job.requiredSkills,       // RENAME to requiredSkillIds:
```

**Line 67 stays unchanged** — this `skills` field is in the censored profile object, not a FitScoreInput field:
```typescript
// Line 66-67 — profile object, NOT FitScoreInput — do NOT rename:
skills: swipe.candidate.skills,
```

---

### `tests/unit/recommendation.service.test.ts` (test/unit, request-response)

**Analog:** itself — the factory pattern and describe structure are reused; mock driver and field names change.

**Current fake driver (line 32) — must be replaced:**
```typescript
// BEFORE — works only when computeFitScore makes no DB calls:
recRepo = new RecommendationRepository({} as any)
```

**Replacement mock driver pattern** (from RESEARCH.md Test Strategy section):
```typescript
function makeMockDriver(adjacency: Array<{ skill: string; hops: number }>): Driver {
  const mockRun = jest.fn().mockResolvedValue({
    records: adjacency.map(({ skill, hops }) => ({
      get: (key: string) => (key === 'skill' ? skill : hops),
    })),
  })
  const mockSession = {
    run: mockRun,
    close: jest.fn().mockResolvedValue(undefined),
  }
  return { session: jest.fn().mockReturnValue(mockSession) } as unknown as Driver
}
```

**Factory field rename pattern** (lines 5-25, both factories):
```typescript
// BEFORE:
const makeCandidate = (overrides: Partial<FitScoreInput> = {}): FitScoreInput => ({
  ...
  skills: overrides.skills ?? ['Node.js', 'TypeScript'],
  ...
})
const makeJob = (overrides: Partial<FitScoreJobInput> = {}): FitScoreJobInput => ({
  ...
  requiredSkills: overrides.requiredSkills ?? ['Node.js', 'TypeScript'],
  ...
})

// AFTER:
const makeCandidate = (overrides: Partial<FitScoreInput> = {}): FitScoreInput => ({
  ...
  skillIds: overrides.skillIds ?? ['nodejs', 'typescript'],
  ...
})
const makeJob = (overrides: Partial<FitScoreJobInput> = {}): FitScoreJobInput => ({
  ...
  requiredSkillIds: overrides.requiredSkillIds ?? ['nodejs', 'typescript'],
  ...
})
```

**New adjacency-specific test cases — mock driver usage pattern:**
```typescript
it('1-hop adjacency scores 0.8 of skill factor', async () => {
  recRepo = new RecommendationRepository(
    makeMockDriver([{ skill: 'postgresql', hops: 1 }])
  )
  const candidate = makeCandidate({ skillIds: ['sql'] })
  const job = makeJob({ requiredSkillIds: ['postgresql'] })
  const score = await recRepo.computeFitScore(candidate, job)
  // skillsScore = 0.8/1 = 0.8 → 0.8 * 0.35 = 0.28 component
  expect(score).toBeGreaterThan(0)
})

it('no adjacency → skill factor = 0', async () => {
  recRepo = new RecommendationRepository(makeMockDriver([]))
  const candidate = makeCandidate({ skillIds: ['rust'] })
  const job = makeJob({ requiredSkillIds: ['postgresql'] })
  // ...
})
```

**Composite score test update — "all factors perfect match → 100"** (lines 182-203):
The test must pass a mock driver that returns 0-hop matches for all required skill IDs. Change `beforeEach` to build the repo with an appropriate mock, or rebuild `recRepo` inside the test. The score of 100 requires adjacency to confirm 0-hop for both `'nodejs'` and `'typescript'`.

---

### `tests/integration/recommendation.test.ts` (test/integration, graph I/O)

**Analog:** itself — structure (beforeAll/afterAll/beforeEach/describe) is preserved; node count assertions and factory fields change, new test cases added.

**Factory field rename** (lines 7-27) — same pattern as unit test factories:
```typescript
// BEFORE line 10:
skills: overrides.skills ?? ['Node.js', 'TypeScript'],
// AFTER:
skillIds: overrides.skillIds ?? ['nodejs', 'typescript'],

// BEFORE line 21:
requiredSkills: overrides.requiredSkills ?? ['Node.js', 'TypeScript'],
// AFTER:
requiredSkillIds: overrides.requiredSkillIds ?? ['nodejs', 'typescript'],
```

**Node count assertions — must be updated** (lines 57-61, 75-78):
```typescript
// BEFORE (10 skills, total 16 nodes):
expect(count).toBe(10)   // line 61
expect(count).toBe(16)   // line 77

// AFTER — planner must set exact values once seed skill list is finalized.
// Based on D-03 seed plan: ~30 skill nodes + 6 profession nodes = ~36 total nodes.
// Exact count is an implementation decision — planner must confirm.
expect(count).toBe(/* FILL IN: exact skill node count from seed */)
expect(count).toBe(/* FILL IN: skills + professions */)
```

**New adjacency integration test (GRAPH-01, Success Criterion 1):**
```typescript
it('candidate with SQL skill scores nonzero on PostgreSQL job (1-hop adjacency)', async () => {
  // Requires seed to have: (sql)-[:RELATED_TO]->(postgresql)
  const candidate = makeCandidate({ skillIds: ['sql'] })
  const job = makeJob({ requiredSkillIds: ['postgresql'] })
  const score = await recRepo.computeFitScore(candidate, job)
  expect(score).toBeGreaterThan(0)

  const directMatch = makeCandidate({ skillIds: ['postgresql'] })
  const directScore = await recRepo.computeFitScore(directMatch, job)
  expect(score).toBeLessThan(directScore)
})
```

**New constraint verification test (GRAPH-03):**
```typescript
it('Skill.id unique constraint exists after seedTaxonomy', async () => {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    const result = await session.run('SHOW CONSTRAINTS')
    const names = result.records.map((r) => r.get('name') as string)
    expect(names).toContain('skill_id_unique')
    expect(names).toContain('profession_id_unique')
  } finally {
    await session.close()
  }
})
```

**New RELATED_TO edge count test (GRAPH-02):**
```typescript
it('creates at least 50 RELATED_TO edges', async () => {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    const result = await session.run('MATCH ()-[:RELATED_TO]->() RETURN count(*) AS count')
    const count = result.records[0].get('count') as number
    expect(count).toBeGreaterThanOrEqual(50)
  } finally {
    await session.close()
  }
})
```

**Session query pattern for verification tests** — copy from existing lines 46-55:
```typescript
const driver = getNeo4jDriver()
const session = driver.session()
try {
  const result = await session.run('MATCH (n:Label) RETURN count(n) AS count')
  const count = result.records[0].get('count') as number
  expect(count).toBe(expected)
} finally {
  await session.close()
}
```

---

## Shared Patterns

### Neo4j Session Lifecycle
**Source:** `src/adapters/services/recommendation.repository.ts` lines 73-74 + 138-139
**Apply to:** All new session usages in `computeFitScore` and the schema step of `seedTaxonomy`
```typescript
const session = this.driver.session({ defaultAccessMode: neo4j.session.READ /* or WRITE */ })
try {
  // ... session.run() or session.executeWrite()
} finally {
  await session.close()
}
```

### MERGE Idempotency (Nodes)
**Source:** `src/adapters/services/recommendation.repository.ts` lines 86-87 + 102-104
**Apply to:** All new Skill nodes in the expanded `seedTaxonomy()`
```typescript
await tx.run('MERGE (s:Skill {id: $id}) SET s.name = $name', s)
```

### MERGE Idempotency (Bidirectional Edges)
**Source:** `src/adapters/services/recommendation.repository.ts` lines 131-133
**Apply to:** All new RELATED_TO edges in the expanded `seedTaxonomy()`
```typescript
await tx.run(
  'MATCH (a:Skill {id: $aId}), (b:Skill {id: $bId}) MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b) MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)',
  r,
)
```

### `satisfies` Type Guard at Call Sites
**Source:** `src/application/use-cases/swipe/get-feed.use-case.ts` lines 34 + 44
**Apply to:** Both use-case call sites after field rename — TypeScript enforces completeness at compile time
```typescript
{ ... } satisfies FitScoreInput,
{ ... } satisfies FitScoreJobInput,
```

### DomainError Pattern
**Source:** `src/application/use-cases/swipe/get-feed.use-case.ts` line 13; `src/application/use-cases/swipe/get-ranking.use-case.ts` lines 15, 23
**Apply to:** Any new error throwing in use cases — note arg order `(message, code, statusCode)` NOT `AppError` order
```typescript
throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)
```

### Unit Test Mock Driver
**Source:** RESEARCH.md Test Strategy section (no existing analog — new pattern for this phase)
**Apply to:** `tests/unit/recommendation.service.test.ts` — replaces `{} as any` Driver stub
```typescript
function makeMockDriver(adjacency: Array<{ skill: string; hops: number }>): Driver {
  const mockRun = jest.fn().mockResolvedValue({
    records: adjacency.map(({ skill, hops }) => ({
      get: (key: string) => (key === 'skill' ? skill : hops),
    })),
  })
  const mockSession = {
    run: mockRun,
    close: jest.fn().mockResolvedValue(undefined),
  }
  return { session: jest.fn().mockReturnValue(mockSession) } as unknown as Driver
}
```

---

## No Analog Found

All 6 files have direct analogs (self or sibling). The mock driver pattern for unit tests is new to this phase — no existing test uses a mock Neo4j driver. The RESEARCH.md Test Strategy section is the reference for that pattern.

| File / Pattern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| Unit test mock Neo4j Driver | test utility | request-response | No existing unit test mocks a Neo4j session; current pattern uses `{} as any` (no DB calls). Phase 14 is the first unit test that needs a real mock because `computeFitScore` will call `driver.session()`. |

---

## Critical Planning Note — Skill ID Mapping (Open Question)

RESEARCH.md identifies a name→ID mismatch:
- PostgreSQL stores `CandidateProfile.skills = ['Node.js', 'TypeScript']` (display names).
- After D-02, `FitScoreInput.skillIds` is matched against Neo4j `WHERE s.id IN $skillIds`, where IDs are slugs (`'nodejs'`, `'typescript'`).

**Resolution the planner must adopt (Option A):** Change all test data to store skill IDs (slugs) in PostgreSQL for integration tests. This means:
- `tests/helpers/factories.ts` `createCandidate()` default `skills: ['Node.js', 'TypeScript']` → `skills: ['nodejs', 'typescript']`
- All inline `prisma.candidateProfile.create({ data: { skills: [...] } })` calls in integration tests use ID slugs
- The `tests/integration/recommendation.test.ts` line 184 `skills: ['Node.js', 'TypeScript']` → `skills: ['nodejs', 'typescript']`
- No Prisma schema change — column type stays `String[]`

This is a data convention change, not a schema change. The `CandidateProfile.skills` API endpoint's Zod schema (`skills: z.array(z.string())`) already accepts any string — it will now accept ID slugs without code change. Callers of `computeFitScore` pass `skillIds: candidate.skills` directly, so if Postgres stores slugs, Neo4j receives slugs, and the query works correctly.

---

## Metadata

**Analog search scope:** `src/domain/interfaces/`, `src/adapters/services/`, `src/application/use-cases/swipe/`, `tests/unit/`, `tests/integration/`, `tests/helpers/`
**Files read:** 8
**Pattern extraction date:** 2026-05-16
