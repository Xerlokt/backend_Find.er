# Phase 6: Recommendation - Research

**Researched:** 2026-05-01
**Domain:** Neo4j 5 graph modeling, Cypher fit-score queries, recommendation service integration with existing SwipeService ranking
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | Fit score calculated via Neo4j considering: profession, skills, location, work mode, salary range | Cypher scoring query with 5 weighted components returning 0–100 float |
| REC-02 | Profession/skill graph seed in Neo4j | Cypher seed script run once as TypeScript entry point; idempotent MERGE statements |
| REC-03 | Candidates ranked by fit % descending on job page | Replace `fitScore: 0` placeholder in `SwipeService.getRanking` with Neo4j-computed scores |
| CAND-03 | Candidate can see a list of recommended jobs to swipe on | Extend `GET /jobs/feed` response to include `fitScore` per job, computed via RecommendationRepository |
</phase_requirements>

---

## Summary

Phase 6 delivers the core value of the entire product: a Neo4j graph-based fit-score engine that scores candidates against jobs across five dimensions (profession match, skills overlap, Haversine distance, work mode, salary range). Without this phase the product is a job board — with it, the platform has a meaningful ranking signal.

The implementation has a precise integration point already defined by Phase 5: `SwipeService.getRanking` returns `fitScore: 0` as a documented placeholder (D-13 in 05-CONTEXT.md). Phase 6 replaces that placeholder by injecting a `RecommendationRepository` (Neo4j) into `SwipeService` alongside the existing `SwipeRepository` (Prisma). The `RankingItem` interface exported from `job.routes.ts` requires no changes — it already has `fitScore: number`.

The graph schema is intentionally narrow: it represents only the taxonomy (professions and skills with relationships), not the candidates or jobs themselves. Candidates and jobs live in PostgreSQL; the graph gives semantic structure (e.g., "Backend Developer REQUIRES Node.js", "Node.js RELATED_TO TypeScript"). The fit score is computed as a weighted average: profession (30%), skills overlap (35%), location proximity (20%), work mode (10%), salary compatibility (5%). All weights and computation happen in Cypher or in the service layer — no new persistence layer is needed.

**Primary recommendation:** Implement a standalone `RecommendationRepository` that wraps the Neo4j driver session, expose it via constructor injection into `SwipeService`, and compute fit scores in a single Cypher query per job call. Score computation for CAND-03 (feed) runs per-job in a loop (acceptable at the feed scale of 20 items/page).

---

## Project Constraints (from CLAUDE.md)

| Directive | Constraint |
|-----------|-----------|
| Clean Architecture | routes → service → repository; no layer skipping; Neo4j calls only in repository |
| SOLID SRP | RecommendationRepository owns all Neo4j interaction; SwipeService orchestrates, does not touch driver |
| Module isolation (ARCH-04) | recommendation module accessed via interface, not imported directly by swipe module |
| Inputs validated with Zod | Any new route parameters validated via Zod schema |
| TDD mandatory | Unit tests written first (mock Neo4j driver), then implementation |
| Integration tests against real DB | Neo4j test container (or shared docker-compose neo4j container) — no mocked Neo4j in integration tests |
| No raw SQL interpolation | Not applicable (Cypher, not SQL); use parameterized Cypher (`$param`) — no string interpolation |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Graph seed (profession/skill taxonomy) | API / Backend (script) | — | One-time CLI script, not a route; runs as `ts-node` or npm script against Neo4j |
| Fit score calculation | API / Backend (RecommendationRepository) | — | Cypher query in repository; score returned to service layer as JS number |
| Ranking ordered by fit score | API / Backend (SwipeService) | — | SwipeService.getRanking fetches scores then sorts — same method, different fitScore source |
| Candidate job feed with fit scores | API / Backend (SwipeService + RecommendationRepository) | — | Feed already returns jobs; Phase 6 adds fitScore per job via batch Neo4j lookup |
| Node/relationship creation in graph | API / Backend (RecommendationRepository) | — | MERGE statements in repository seed method |

---

## Stack & Versions

### Core
| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| neo4j-driver | 6.0.1 (installed) | Official Neo4j JavaScript/TypeScript driver — sessions, transactions, Cypher execution | [VERIFIED: node_modules/neo4j-driver/package.json] |
| neo4j:5 (Docker) | 5.x | Graph database running in docker-compose.yml | [VERIFIED: docker-compose.yml] |

### Driver API (neo4j-driver v6) — Verified Patterns

**Driver instantiation** — already done in `src/shared/db/neo4j.ts`:
```typescript
// [VERIFIED: src/shared/db/neo4j.ts]
import neo4j, { Driver } from 'neo4j-driver'
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
```

**Read query via executeRead (preferred for idempotent reads)**:
```typescript
// [VERIFIED: neo4j-driver-core/lib/driver.js — executeQuery, Session.prototype.executeRead confirmed]
const session = driver.session({ defaultAccessMode: neo4j.session.READ })
try {
  const result = await session.executeRead(tx =>
    tx.run('MATCH (n:Skill) WHERE n.name = $name RETURN n', { name: 'Node.js' })
  )
  return result.records
} finally {
  await session.close()
}
```

**Write query via executeWrite (for seed)**:
```typescript
const session = driver.session({ defaultAccessMode: neo4j.session.WRITE })
try {
  await session.executeWrite(tx =>
    tx.run('MERGE (p:Profession {id: $id}) SET p.name = $name', { id: 'backend-dev', name: 'Backend Developer' })
  )
} finally {
  await session.close()
}
```

**Integer handling** — CRITICAL for fit scores:
- Cypher `toFloat()` → JavaScript `number` (native, no conversion needed) [VERIFIED: runtime test]
- Cypher integer literals → `neo4j.Integer` object (has `.toNumber()`) [VERIFIED: runtime test]
- Use `toFloat()` in Cypher when computing weighted scores to guarantee JS `number` return
- Alternative: pass `{ disableLosslessIntegers: true }` as third arg to `neo4j.driver()` to auto-convert all integers to JS numbers [VERIFIED: neo4j-driver-core/lib/types.js]

**Recommended driver config** (update `src/shared/db/neo4j.ts`):
```typescript
driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
  disableLosslessIntegers: true,  // all Cypher integers → JS number, not neo4j.Integer
})
```

### No New npm Dependencies
Phase 6 requires no new packages. The neo4j-driver (v6.0.1) is already installed and has a working singleton in `src/shared/db/neo4j.ts`.

---

## Graph Schema Design

### Node Labels

| Label | Properties | Purpose |
|-------|-----------|---------|
| `Profession` | `id: String` (PK), `name: String` | Maps to `professionId` strings used in Prisma `CandidateProfile.professionId` and `Job.professionId` |
| `Skill` | `id: String` (PK), `name: String` | Maps to skill strings in `CandidateProfile.skills[]` and `Job.requiredSkills[]` |

### Relationship Types

| Relationship | From → To | Properties | Purpose |
|-------------|----------|-----------|---------|
| `REQUIRES` | `Profession → Skill` | — | This profession typically requires this skill — drives taxonomy-based skill inference |
| `RELATED_TO` | `Skill → Skill` | `weight: Float` (0.0–1.0) | Two skills are semantically similar (e.g., TypeScript ↔ JavaScript). Weight drives partial credit for non-exact skill matches |

### Rationale for This Schema

The schema is intentionally **taxonomy-only** — it does NOT store candidate or job data in Neo4j. Candidates and jobs live in PostgreSQL. This avoids dual-write complexity (keeping Prisma + Neo4j in sync) and keeps the graph focused on a single responsibility: skill/profession relationships.

The fit score is computed by the service layer using data fetched from PostgreSQL (candidate profile, job requirements) combined with graph traversal to find related skills.

**Alternative considered and rejected:** Storing `(:Candidate)` and `(:Job)` nodes in Neo4j for relationship-based traversal. Rejected because: (a) dual-write atomicity across PG + Neo4j without distributed transactions is risky; (b) the taxonomy-only approach is simpler and sufficient for a 0–100 score across five factors.

### Seed Taxonomy (Starter Set)

The seed should include professions and skills representative of a tech job platform. Professions map exactly to the `professionId` strings already seeded in the factory helpers:

```cypher
// Source: factories.ts uses 'backend-dev' as default professionId
// These MERGE statements are idempotent — safe to run multiple times

// Professions
MERGE (p:Profession {id: 'backend-dev'}) SET p.name = 'Backend Developer'
MERGE (p:Profession {id: 'frontend-dev'}) SET p.name = 'Frontend Developer'
MERGE (p:Profession {id: 'fullstack-dev'}) SET p.name = 'Fullstack Developer'
MERGE (p:Profession {id: 'devops'}) SET p.name = 'DevOps Engineer'
MERGE (p:Profession {id: 'data-scientist'}) SET p.name = 'Data Scientist'
MERGE (p:Profession {id: 'mobile-dev'}) SET p.name = 'Mobile Developer'

// Skills
MERGE (s:Skill {id: 'nodejs'}) SET s.name = 'Node.js'
MERGE (s:Skill {id: 'typescript'}) SET s.name = 'TypeScript'
MERGE (s:Skill {id: 'javascript'}) SET s.name = 'JavaScript'
MERGE (s:Skill {id: 'react'}) SET s.name = 'React'
MERGE (s:Skill {id: 'postgresql'}) SET s.name = 'PostgreSQL'
MERGE (s:Skill {id: 'docker'}) SET s.name = 'Docker'
MERGE (s:Skill {id: 'python'}) SET s.name = 'Python'

// Profession → Skill REQUIRES relationships
MATCH (p:Profession {id:'backend-dev'}), (s:Skill {id:'nodejs'}) MERGE (p)-[:REQUIRES]->(s)
MATCH (p:Profession {id:'backend-dev'}), (s:Skill {id:'typescript'}) MERGE (p)-[:REQUIRES]->(s)
MATCH (p:Profession {id:'frontend-dev'}), (s:Skill {id:'react'}) MERGE (p)-[:REQUIRES]->(s)
MATCH (p:Profession {id:'frontend-dev'}), (s:Skill {id:'typescript'}) MERGE (p)-[:REQUIRES]->(s)

// Skill RELATED_TO relationships (bidirectional — create both directions)
MATCH (a:Skill {id:'typescript'}), (b:Skill {id:'javascript'}) 
MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b)
MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)
```

**Critical note:** Skill matching in the fit score uses `name` strings (e.g., `'Node.js'`, `'TypeScript'`) because that is what PostgreSQL stores in `requiredSkills[]` and `skills[]` arrays. The Cypher queries must match on the `name` property, not `id`. The `id` is for graph topology; `name` is the linking key to Prisma data.

---

## Fit Score Algorithm

### Overview

The fit score is a weighted average of five factors, each normalized to 0–1, then scaled to 0–100:

| Factor | Weight | Source Data | Scoring Logic |
|--------|--------|-------------|---------------|
| Profession match | 30% | `CandidateProfile.professionId` vs `Job.professionId` | 1.0 if exact match, 0.0 otherwise |
| Skills overlap | 35% | `CandidateProfile.skills[]` vs `Job.requiredSkills[]` | `matchedSkills / totalRequiredSkills` (Jaccard-style numerator) |
| Location proximity | 20% | Haversine distance (already computed in SwipeService) | Linear decay: 1.0 at 0km, 0.0 at `candidate.searchRadiusKm` (or 50km default), clamped |
| Work mode | 10% | `CandidateProfile.preferredModalities[]` vs `Job.modality` | 1.0 if job modality is in candidate's preferred list, 0.0 otherwise |
| Salary range | 5% | `CandidateProfile.salaryExpectation` vs `Job.salaryMin`/`salaryMax` | 1.0 if expectation within range (or either side null), 0.0 otherwise |

**Formula:**
```
fitScore = round(
  (professionScore * 0.30 +
   skillsScore     * 0.35 +
   locationScore   * 0.20 +
   modalityScore   * 0.10 +
   salaryScore     * 0.05) * 100
)
```

### Where to Compute — Service vs Cypher

**Recommended: Service layer** (TypeScript) for the weighted aggregation; Neo4j for the skills relationship query.

Rationale:
- Profession, location, work mode, and salary comparisons do not require graph traversal — they are straight comparisons of PostgreSQL-held data
- Only skills overlap benefits from the graph (to get `RELATED_TO` partial credit for near-matches)
- Computing everything in a single complex Cypher query creates an opaque "magic query" that is hard to unit-test, hard to tune, and locks scoring logic in the graph
- A service-layer implementation allows easy weight tuning without touching Cypher
- The skills graph query is a simple `MATCH` — easy to test in isolation

**Architecture:**

```
SwipeService.getRanking(userId, jobId)
  → SwipeRepository.findSwipesByJobId(jobId)   [Prisma — existing]
  → for each swipe: RecommendationRepository.computeFitScore(candidate, job)  [Neo4j]
    → internally calls: RecommendationRepository.findRelatedSkills(skillNames[])
    → service computes weighted score
  → sort by fitScore DESC
  → return RankingItem[]
```

### Skills Overlap with Graph Assistance

For the skills factor, the graph allows partial credit for related skills:

```cypher
// Given job requires: ['Node.js', 'TypeScript']
// Given candidate has: ['JavaScript', 'TypeScript']
// Expected: TypeScript is direct match (1.0), JavaScript is RELATED_TO TypeScript (weight 0.8)
// Result: matchedSkills = 1 + 0.8 = 1.8 out of 2 required = 0.9 (90%)

UNWIND $requiredSkills AS reqSkillName
MATCH (req:Skill {name: reqSkillName})
OPTIONAL MATCH (cand:Skill {name: reqSkillName})  // direct match
OPTIONAL MATCH (related:Skill)-[r:RELATED_TO]->(req)  
  WHERE related.name IN $candidateSkills
WITH reqSkillName,
  CASE WHEN cand IS NOT NULL AND cand.name IN $candidateSkills THEN 1.0 ELSE 0.0 END AS directScore,
  COALESCE(MAX(r.weight), 0.0) AS relatedScore
RETURN reqSkillName, GREATEST(directScore, relatedScore) AS contribution
```

**Simpler fallback** (no partial credit, acceptable for v1):
```typescript
// Pure TypeScript — no Neo4j needed for skills if skipping partial credit
const matched = requiredSkills.filter(s => candidateSkills.includes(s)).length
const skillsScore = requiredSkills.length === 0 ? 1.0 : matched / requiredSkills.length
```

**Recommendation for Phase 6:** Implement the simple TypeScript fallback first (no graph lookup for skills), then the Neo4j partial-credit version. The graph seed (REC-02) and basic score (REC-01) can be delivered in separate plans this way.

### Null/Missing Data Handling

| Situation | Handling |
|-----------|---------|
| Candidate has no professionId | Profession score = 0 |
| Job has no salaryMin AND salaryMax | Salary score = 1.0 (open salary is acceptable by default) |
| Candidate has no salaryExpectation | Salary score = 1.0 (no stated preference = any salary is acceptable) |
| Candidate has no lat/lng | Location score = 0.5 (neutral — cannot penalize candidate for not sharing location) |
| Job has no lat/lng | Location score = 1.0 for all (remote job or no location req = anyone qualifies) |
| Job modality not in candidate preferences | Modality score = 0.0 |
| Candidate has empty skills[] | Skills score = 0.0 |
| Job has empty requiredSkills[] | Skills score = 1.0 (no requirements = full credit) |

---

## Integration Points

### 1. Replace fitScore Placeholder in SwipeService.getRanking

**Current state** (`src/modules/swipe/swipe.service.ts`, line 71):
```typescript
fitScore: 0, // Phase 5 placeholder — Phase 6 replaces with Neo4j fit score (D-13)
```

**Phase 6 change:** SwipeService receives a second constructor argument `RecommendationRepository` (or an interface `IRecommendationService`). `getRanking` calls it for each swipe item before sorting.

**Constructor injection pattern** (consistent with existing codebase):
```typescript
// swipe.service.ts — Phase 6 update
export class SwipeService {
  constructor(
    private readonly repo: SwipeRepository,
    private readonly recommendation: IRecommendationService,  // NEW
  ) {}
```

**Wire in swipe.routes.ts** (swipeJobRoutes function):
```typescript
const swipeRepo = new SwipeRepository()
const recRepo = new RecommendationRepository(getNeo4jDriver())
const service = new SwipeService(swipeRepo, recRepo)
```

**ARCH-04 compliance:** `SwipeService` does not import `RecommendationRepository` directly — it depends on the interface `IRecommendationService`. The concrete class is injected at the route level. Both interfaces should live in `src/shared/interfaces/` or be co-located with the consuming module.

### 2. Add fitScore to CAND-03 Feed (GET /jobs/feed)

**Current state:** `SwipeService.getFeed` returns raw `Job` objects from Prisma with no fit score.

**Phase 6 change:** After fetching the feed jobs, compute a `fitScore` for each job:

```typescript
async getFeed(userId: string, cursor: string | undefined, limit: number) {
  const candidate = await this.repo.findCandidateProfileByUserId(userId)
  if (!candidate) throw new AppError('Candidate profile not found', 404, 'NOT_FOUND')

  const jobs = await this.repo.findFeedJobs(candidate.id, cursor, limit)
  const hasNext = jobs.length > limit
  const data = hasNext ? jobs.slice(0, limit) : jobs
  const nextCursor = hasNext ? data[data.length - 1].id : null

  // Phase 6: attach fit score per job (REC-01, CAND-03)
  const scoredData = await Promise.all(
    data.map(async (job) => ({
      ...job,
      fitScore: await this.recommendation.computeFitScore(candidate, job),
    }))
  )
  return { data: scoredData, nextCursor }
}
```

**Note:** For 20 jobs/page this runs 20 concurrent Neo4j read sessions. This is acceptable at development scale. Phase 6 does not need to solve caching.

### 3. Sorting — fitScore DESC in getRanking

After computing fit scores, `getRanking` must sort by score descending (REC-03):

```typescript
const items = await Promise.all(swipes.map(async (swipe) => {
  const fitScore = await this.recommendation.computeFitScore(swipe.candidate, job)
  return { ...swipeItem, fitScore }
}))

return items.sort((a, b) => b.fitScore - a.fitScore)
  .map((item, index) => ({ ...item, rank: index + 1 }))
```

**Note:** Secondary sort by `swipedAt DESC` (D-04 from Phase 5 CONTEXT) only applies when fit scores are tied.

### 4. IRecommendationService Interface

To satisfy ARCH-04 (module isolation), define:

```typescript
// src/shared/interfaces/recommendation.interface.ts
export interface CandidateData {
  professionId: string
  skills: string[]
  preferredModalities: string[]
  salaryExpectation: number | null
  lat: number | null
  lng: number | null
  searchRadiusKm: number
}

export interface JobData {
  professionId: string
  requiredSkills: string[]
  modality: string
  salaryMin: number | null
  salaryMax: number | null
  lat: number | null
  lng: number | null
}

export interface IRecommendationService {
  computeFitScore(candidate: CandidateData, job: JobData): Promise<number>
}
```

---

## Testing Strategy

### Unit Tests (no DB — mock Neo4j driver)

**Where:** `tests/unit/recommendation.service.test.ts`

**Mock pattern** — consistent with `tests/unit/swipe.service.test.ts` using `jest.Mocked<>`:

```typescript
const makeRecRepo = (): jest.Mocked<RecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
  findRelatedSkills: jest.fn(),
} as unknown as jest.Mocked<RecommendationRepository>)
```

**Test cases for `computeFitScore`:**
1. Exact profession match contributes 30 points
2. No profession match contributes 0
3. Full skills overlap contributes 35 points
4. No skills overlap contributes 0
5. Partial skills overlap contributes proportional score
6. Location within radius contributes 20 points; beyond radius contributes 0
7. Matching modality contributes 10 points; mismatch contributes 0
8. Salary within range contributes 5 points; outside range contributes 0
9. Null candidate lat/lng → location score = 0.5 (neutral)
10. Null salary fields → salary score = 1.0 (open)
11. Candidate with all 5 perfect matches → fitScore = 100
12. Candidate with all 5 zero matches → fitScore = 0

**Unit tests for SwipeService.getRanking Phase 6 update:**
- Higher fit score candidate sorts above lower fit score candidate
- `rank` is assigned after sorting (not before)
- getRanking calls recommendation.computeFitScore for each swipe

### Integration Tests (real Neo4j — docker-compose neo4j service)

**Where:** `tests/integration/recommendation.test.ts`

**Strategy:** Use the existing `docker-compose.yml` `neo4j` service (bolt://localhost:7687). No testcontainer needed — the existing docker-compose setup already has Neo4j 5.

**Setup/teardown pattern:**
```typescript
// Before each integration test suite: clear graph, run seed
beforeAll(async () => {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    await session.run('MATCH (n) DETACH DELETE n')  // clean slate
    await seedNeo4j(driver)  // run the taxonomy seed
  } finally {
    await session.close()
  }
})
```

**Important:** The integration test setup.ts (`tests/helpers/setup.ts`) handles PostgreSQL but NOT Neo4j. Phase 6 must add Neo4j cleanup to the integration test setup or handle it per-test in the recommendation test file.

**Integration test cases:**
1. `computeFitScore` returns a number between 0 and 100
2. Candidate with all matching fields scores 100
3. Candidate with no matching fields scores 0
4. Candidate with partial skill overlap scores between 0 and 100
5. `GET /jobs/:jobId/ranking` response items have `fitScore` !== 0 (real score, not placeholder)
6. Ranking is sorted by fitScore DESC in the response

### Neo4j Test Isolation

**Critical pitfall:** Neo4j is shared state unlike PostgreSQL test DB. The integration tests MUST:
1. Run `MATCH (n) DETACH DELETE n` before seeding in `beforeAll`
2. Re-seed after clearing (or seed once in `globalSetup`)
3. NOT delete nodes in `afterEach` (seeding takes time — clear only once per suite)

**Recommendation:** Add a Neo4j setup helper `tests/helpers/neo4j-setup.ts`:
```typescript
import { getNeo4jDriver } from '../../src/shared/db/neo4j'
import { seedNeo4j } from '../../src/modules/recommendation/seed'

export async function setupNeo4j() {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    await session.run('MATCH (n) DETACH DELETE n')
    await seedNeo4j(driver)
  } finally {
    await session.close()
  }
}
```

**Neo4j env vars for tests:** The existing `.env.example` already defines `NEO4J_URI=bolt://localhost:7687`. Jest's `setupFiles` already loads `dotenv/config`. No new test config needed.

---

## CAND-03 Feed

CAND-03 requires "candidate can see a list of recommended jobs to swipe on." The `GET /jobs/feed` endpoint already returns active unswiped jobs (built in Phase 5). Phase 6 adds `fitScore` to each item in the feed response.

**Approach:** Compute `fitScore` for each job in the feed using `RecommendationRepository.computeFitScore(candidate, job)`. Do NOT sort the feed by fitScore — the feed is ordered by `createdAt DESC` (Tinder-style newest first). The fitScore is informational metadata on each feed item, allowing the frontend to display a match percentage indicator.

**Why not sort feed by fitScore:** Sorting by score would require fetching ALL available jobs, scoring them all, then paginating. That breaks cursor pagination and creates an unbounded query. The current cursor-based design returns newest unswiped jobs first — candidates see fresh jobs, not the same high-scoring ones repeatedly. This is the intentional UX design for a swipe platform.

**Response shape for feed item (Phase 6 addition):**
```typescript
{
  id: string,
  title: string,
  description: string,
  professionId: string,
  requiredSkills: string[],
  modality: 'REMOTE' | 'HYBRID' | 'IN_PERSON',
  salaryMin: number | null,
  salaryMax: number | null,
  expiresAt: Date,
  createdAt: Date,
  fitScore: number,  // NEW in Phase 6 — 0-100
  // lat/lng intentionally excluded (location privacy — only distanceKm if added)
}
```

---

## Recommendation Module Structure

```
src/modules/recommendation/
├── recommendation.repository.ts    # Neo4j driver calls, seed, computeFitScore
├── recommendation.service.ts       # Optional: thin wrapper if scoring logic is complex
└── seed.ts                         # Standalone seed script; also imported by repository.seedTaxonomy()

src/shared/interfaces/
└── recommendation.interface.ts     # IRecommendationService — ARCH-04 boundary

tests/unit/
└── recommendation.service.test.ts  # Unit tests with mocked Neo4j driver

tests/integration/
└── recommendation.test.ts          # Integration tests against real Neo4j

tests/helpers/
└── neo4j-setup.ts                  # Setup/teardown helper for Neo4j in integration tests

scripts/
└── seed-neo4j.ts                   # CLI entry point: ts-node scripts/seed-neo4j.ts
```

**Note on whether to use a `recommendation.service.ts`:** The scoring logic (5-factor weighted average) can live entirely in `recommendation.repository.ts` or be split into a service. Given that scoring uses no external dependencies beyond the repository call for related skills, it is acceptable to implement the algorithm in the repository class for Phase 6. The interface boundary (`IRecommendationService`) provides the abstraction for testing regardless.

---

## Risks & Landmines

### Risk 1: `fitScore: 0` Placeholder Not Removed Everywhere

The placeholder is in `swipe.service.ts` at exactly line 71. The `getRanking` method uses `.map()` which processes all swipes. After Phase 6, if the injection is missing (e.g., test routes instantiate `SwipeService` without the recommendation repo), all scores return 0. Integration tests that assert `fitScore !== 0` will catch this — they MUST be in the test suite.

**How to avoid:** Unit tests for getRanking must assert the correct score, not just that `profile` is shaped correctly. The `makeRecRepo` mock must be passed to `new SwipeService(swipeRepo, recRepo)`.

### Risk 2: Neo4j Integer Type vs JS number

Cypher integer literals (e.g., `RETURN 0`) return `neo4j.Integer` objects, not JS `number`. If the scoring Cypher returns an uncast integer, TypeScript will see an object not a number, and `fitScore: 0` would not equal JS `0` in comparisons. Use `toFloat()` in ALL Cypher expressions that produce the final score, or set `disableLosslessIntegers: true` in the driver config.

**How to avoid:** Update `src/shared/db/neo4j.ts` to add `{ disableLosslessIntegers: true }` as third arg to `neo4j.driver()`. Verified this config key exists in neo4j-driver-core v6.0.1.

### Risk 3: SwipeService Constructor Signature Change Breaks Existing Tests

`tests/unit/swipe.service.test.ts` creates `new SwipeService(repo)` with one argument. After Phase 6 adds a second constructor argument, all existing SwipeService unit tests will fail with a TypeScript error unless the second argument is optional or the tests are updated.

**How to avoid:** Make the second argument optional in the constructor with a default no-op implementation, OR update the existing unit tests to pass a mock recommendation repo. Updating existing tests is cleaner — they should be updated to pass `makeRecRepo()` with `computeFitScore.mockResolvedValue(0)` to preserve the existing test behaviors.

### Risk 4: Session Leak in RecommendationRepository

Every call to `computeFitScore` must open and close a Neo4j session. If `session.close()` is not called (e.g., exception thrown before the `finally` block), connections leak and the driver pool exhausts. The `finally` pattern is mandatory.

**How to avoid:** Always use the pattern:
```typescript
const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
try {
  const result = await session.executeRead(tx => tx.run(query, params))
  return processResult(result)
} finally {
  await session.close()
}
```

### Risk 5: Skills Matching is Case-Sensitive

The Cypher `MATCH (s:Skill {name: $name})` is case-sensitive. If the seed uses `'Node.js'` but a test factory creates a job with `requiredSkills: ['node.js']`, the graph will not find the node and the skills score will be 0.

**How to avoid:** Normalize skill names to the same case as the seed before querying. Either (a) normalize on write (in CandidateRepository and JobRepository), or (b) normalize in RecommendationRepository before passing to Cypher. Option (b) is in-scope for Phase 6. Use `toLowerCase()` on both sides, and seed skill names as lowercase.

**Impact on seed:** If skill names are normalized to lowercase in Cypher queries, the seed should store lowercase names. The display names (in `name` property) can remain cased for display purposes, but the matching property should be consistently cased.

**Simplest approach:** Add a `nameNormalized: String` property to Skill nodes, or just match on `toLower(s.name) = toLower($name)` in Cypher.

### Risk 6: Neo4j Integration Tests Require Docker Running

The same pre-existing blocker that affected Phase 5 integration tests (Docker not running) applies to Phase 6 Neo4j tests. All integration tests that use `getNeo4jDriver()` will fail with connection refused if Docker is not running. This is a known limitation documented in all Phase 5 SUMMARY files.

### Risk 7: Circular Dependency via IRecommendationService

If `swipe.service.ts` imports `IRecommendationService` from `src/shared/interfaces/` and `recommendation.repository.ts` also imports types from `src/shared/`, there is no circular dependency. However, if `recommendation.repository.ts` ever imports from `src/modules/swipe/`, that creates a circular module dependency violating ARCH-04. Never import swipe types in the recommendation module.

---

## Implementation Recommendations

### Plan Structure (matching ROADMAP.md outline)

**06-01: Neo4j graph seed + RecommendationRepository skeleton**
- Create `src/modules/recommendation/recommendation.repository.ts` with `seedTaxonomy()` and `computeFitScore()` (stub returning 0)
- Create `scripts/seed-neo4j.ts` CLI entry point
- Write Cypher seed as MERGE statements (idempotent)
- Unit tests: mock the Neo4j driver, verify seedTaxonomy calls session.executeWrite
- Integration test: seedTaxonomy runs; verify nodes exist in graph

**06-02: Fit score algorithm — all five factors**
- Implement the 5-factor scoring in `RecommendationRepository.computeFitScore()`
- Unit tests: each factor independently tested (12 cases documented above)
- No integration DB needed for unit tests — pure TypeScript math + mocked Neo4j result

**06-03: Wire into ranking + feed; integration tests**
- Update `SwipeService` constructor to accept `IRecommendationService`
- Update `swipe.routes.ts` to inject `RecommendationRepository`
- Update existing `swipe.service.test.ts` tests to pass mock `recRepo`
- Update `GET /jobs/feed` to attach `fitScore` per job
- Integration tests: `GET /jobs/:jobId/ranking` returns items sorted by fitScore DESC
- Integration tests: `GET /jobs/feed` items include `fitScore` field

### Key Design Decision: Scoring Location

**Recommendation:** Implement all 5-factor scoring in `RecommendationRepository.computeFitScore()` as TypeScript, calling Neo4j ONLY for the skills graph query (to get `RELATED_TO` relationships). This keeps the algorithm readable, testable, and avoids putting business logic in Cypher.

For Phase 6 scope, the simplest viable approach is **no graph traversal for skills** — just exact string matching in TypeScript (`candidateSkills.filter(s => requiredSkills.includes(s)).length`). The graph infrastructure (seed, nodes, relationships) is still built per REC-02, and the `RELATED_TO` query can be added in a v1.1 iteration. This satisfies all success criteria: "Fit score accounts for all five factors" is met by the TypeScript computation.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.9 |
| Config file | `jest.config.ts` (project root) |
| Quick run command | `npx jest tests/unit/recommendation.service.test.ts --no-coverage` |
| Full suite command | `npx jest --runInBand --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | Fit score computed with 5 factors, 0–100 | unit | `npx jest tests/unit/recommendation.service.test.ts -t "computeFitScore" --no-coverage` | ❌ Wave 0 |
| REC-02 | Graph seed creates Profession and Skill nodes | integration | `npx jest tests/integration/recommendation.test.ts -t "seedTaxonomy" --runInBand --no-coverage` | ❌ Wave 0 |
| REC-03 | Ranking sorted by fitScore DESC | integration | `npx jest tests/integration/swipe.test.ts -t "ranking" --runInBand --no-coverage` | ✅ (update needed) |
| CAND-03 | Feed items include fitScore field | integration | `npx jest tests/integration/swipe.test.ts -t "feed" --runInBand --no-coverage` | ✅ (update needed) |

### Sampling Rate
- **Per task commit:** `npx jest tests/unit/recommendation.service.test.ts --no-coverage`
- **Per wave merge:** `npx jest --runInBand --no-coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/recommendation.service.test.ts` — covers REC-01 scoring factors
- [ ] `tests/integration/recommendation.test.ts` — covers REC-02 graph seed and REC-01 integration
- [ ] `tests/helpers/neo4j-setup.ts` — shared Neo4j clear+seed fixture

*(Existing swipe tests at `tests/integration/swipe.test.ts` and `tests/unit/swipe.service.test.ts` need updating to pass mock recRepo, not new files)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface |
| V3 Session Management | no | No new session handling |
| V4 Access Control | no | No new routes with new access rules |
| V5 Input Validation | yes | `professionId`, skill names, coordinates — validated via Zod on all existing routes; RecommendationRepository receives typed TypeScript parameters, not raw user input |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns for Neo4j + Cypher

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cypher injection via string interpolation | Tampering | Always use parameterized Cypher (`$param`) — never concatenate user-supplied strings into query strings [VERIFIED: Neo4j driver supports parameterized queries] |
| Information disclosure via fit score | Information Disclosure | fitScore is computed per-candidate and is aggregated/rounded — raw graph data (skill relationships, weights) not exposed in API response |
| IDOR on ranking endpoint | Spoofing | Ownership check already in SwipeService.getRanking (recruiterProfile.id === job.recruiterId → 403 if mismatch) — unchanged by Phase 6 |

**Cypher injection note:** The scoring query receives `professionId`, `skills[]`, `modality`, etc. from the PostgreSQL candidate profile — these are not raw HTTP input but trusted service-layer data. They still MUST go through Cypher parameters (not string interpolation) in case the database is ever compromised upstream. Pattern: `tx.run('MATCH (s:Skill) WHERE s.name IN $skills RETURN s', { skills: candidate.skills })`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| neo4j-driver | RecommendationRepository | ✓ | 6.0.1 | — |
| Neo4j 5 (Docker) | Integration tests, seed script | Blocked (Docker not running) | 5.x | Unit tests run without Docker; integration tests blocked same as Phase 5 |
| PostgreSQL test DB (Docker) | Existing integration tests | Blocked (same Docker issue) | 16 | Same pre-existing constraint |
| Node.js / ts-node | Seed script runner | ✓ | v24.14.0 | — |

**Missing dependencies with no fallback:**
- Docker (all integration tests) — pre-existing constraint; unit tests work without it

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Skill names in PostgreSQL match skill names in Neo4j seed exactly (case-sensitive by default) | Fit Score Algorithm | Skills overlap score would be 0 for all candidates even with matching skills |
| A2 | 20 concurrent Neo4j sessions per feed page is acceptable at dev/MVP scale | CAND-03 Feed | Connection pool exhaustion under load; mitigation: batch query in single session |
| A3 | `disableLosslessIntegers: true` on driver config does not affect existing Phase 1–5 functionality (no prior code relied on `neo4j.Integer` objects) | Stack & Versions | Existing code that calls `.toNumber()` on results would break — but no existing code uses Neo4j query results yet |

---

## Open Questions

1. **Skill name normalization strategy**
   - What we know: PostgreSQL stores skill strings as-is (e.g., `'Node.js'`, `'TypeScript'`); Neo4j seed uses the same strings
   - What's unclear: If a recruiter or candidate enters `'node.js'` vs `'Node.js'`, matching breaks
   - Recommendation: In the scoring function, normalize both sides with `toLowerCase()` before comparison; add `toLower()` to Cypher queries. No schema migration needed.

2. **Scoring null/partial data for locationScore**
   - What we know: Candidate may have no lat/lng. Suggested: score 0.5 (neutral)
   - What's unclear: Is 0.5 the right neutral value? It still gives location-unverified candidates a 10-point contribution (0.5 * 0.20 * 100 = 10 points)
   - Recommendation: Use 0.5 as neutral for missing location — planner should confirm or treat as Claude's discretion

3. **Whether to add sorted feed as a separate endpoint**
   - What we know: CAND-03 says "recommended jobs to swipe on" — could imply recommendation ordering
   - What's unclear: Whether "recommended" means "sorted by fit score" or "personalized but still cursor-paginated"
   - Recommendation: Attach fitScore to existing feed; do NOT sort by fitScore (preserves cursor pagination). This matches the Phase 5 deferred note: "Fit score real no feed — CAND-03 / REC-01, entregue na Fase 6 (Neo4j). Feed da Fase 5 retorna vagas sem score de fit." — i.e., Phase 6 adds the score, not a new sort order.

---

## Sources

### Primary (HIGH confidence)
- `src/shared/db/neo4j.ts` — existing driver singleton pattern [VERIFIED: codebase read]
- `src/modules/swipe/swipe.service.ts` — existing getRanking with fitScore:0 placeholder [VERIFIED: codebase read]
- `src/modules/job/job.routes.ts` — RankingItem interface { candidateId, fitScore, profile } [VERIFIED: codebase read]
- `prisma/schema.prisma` — CandidateProfile, Job field shapes [VERIFIED: codebase read]
- `docker-compose.yml` — Neo4j 5 service on bolt://localhost:7687 [VERIFIED: codebase read]
- `node_modules/neo4j-driver/package.json` — version 6.0.1 [VERIFIED: runtime]
- `node_modules/neo4j-driver-core/lib/types.js` — `disableLosslessIntegers` config option [VERIFIED: file read]
- `node_modules/neo4j-driver-core/lib/driver.js` — `Driver.prototype.executeQuery`, `session()` method [VERIFIED: file read + runtime inspection]
- `node_modules/neo4j-driver-core/lib/session.js` — `Session.prototype.executeRead`, `executeWrite` [VERIFIED: runtime inspection]

### Secondary (MEDIUM confidence)
- `.planning/phases/05-swipe/05-CONTEXT.md` — D-13 Phase 6 extension contract, D-04 sort order [CITED: phase 5 context doc]
- `.planning/phases/05-swipe/05-03-SUMMARY.md` — fitScore:0 is documented stub, unit test coverage details [CITED: phase 5 summary]

### Tertiary (LOW confidence — training knowledge)
- 5-factor weighting (profession 30%, skills 35%, location 20%, work mode 10%, salary 5%) — weights are author's recommendation, not from external authority [ASSUMED]
- Neo4j MERGE idempotency for seed scripts — standard Cypher practice [ASSUMED — well-established pattern but not verified against v5 docs in this session]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — driver version verified from installed package; session API verified from prototype inspection
- Architecture: HIGH — integration points verified from existing source code; no speculative file paths
- Fit score algorithm: MEDIUM — 5 factors specified in REC-01; weights are Claude's recommendation (ASSUMED)
- Pitfalls: HIGH — derived from verified codebase state (existing placeholder, constructor change impact, session leak risk)
- Graph schema: MEDIUM — taxonomy-only approach is well-justified; specific node labels are recommendations

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (stable stack; 30-day window)
