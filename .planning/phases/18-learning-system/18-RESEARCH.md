# Phase 18: Learning System — Research

**Researched:** 2026-05-30
**Domain:** EMA weight learning, Prisma upsert, Clean Architecture extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** EMA algorithm with α = 0.1: `new_w = 0.1 * observed_score + 0.9 * old_w`
- **D-02:** Per LIKE: compute the 5 factor scores of the liked job (professionScore, skillsScore, locationScore, modalityScore, salaryScore), apply EMA to each separately
- **D-03:** Initial weights (before first LIKE) = global fixed weights: profession=0.30, skills=0.35, location=0.20, modality=0.10, salary=0.05
- **D-04:** Weights stored as normalized floats (must sum ~1.0 after each update; renormalize if necessary)
- **D-05:** Candidates with < 5 LIKEs receive feed ordered by global default weights (unchanged behavior)
- **D-06:** Candidates with >= 5 LIKEs receive feed ordered by personal weights from `CandidateWeights`
- **D-07:** `likeCount` tracked as field in `CandidateWeights` (not derived via Swipe query)
- **D-08:** `CandidateWeights` stores only current weights — no per-LIKE history
- **D-09:** Model includes: `candidateId`, `professionWeight`, `skillsWeight`, `locationWeight`, `modalityWeight`, `salaryWeight`, `likeCount`, timestamps
- **D-10:** Upsert pattern: if not exists, create with defaults; if exists, update via EMA
- **D-11:** Update trigger: inside `RecordSwipeUseCase` when `direction === 'LIKE'`, via `IWeightsRepository`
- **D-12:** `GetFeedUseCase` fetches `CandidateWeights` via `IWeightsRepository` and passes weights to `computeFitScore` when `likeCount >= 5`
- **D-13:** `computeFitScore` receives optional weights as separate parameter: `computeFitScore(candidate, job, weights?: WeightSet)`
- **D-14:** DISC redistribution (Phase 17 D-05) applies over personal weights the same way it applies over globals — `w = hasDiscRequirement ? 0.9 : 1.0` multiplies received weights
- **D-15:** No change to cache strategy — `RecordSwipeUseCase` already calls `cache.del(feed:{candidateId})` on LIKE
- **D-16:** Cache key `feed:{candidateId}` unchanged — LIKE invalidation already covers weight updates
- **D-17:** `GetRankingUseCase` (recruiter ranking) does NOT use personal weights — continues with global fixed weights
- **D-18:** Only `GetFeedUseCase` receives personalized behavior (LEARN-03 literal)

### Claude's Discretion

- Exact structure of `WeightSet` type (inline interface vs type alias vs exported from domain/interfaces/)
- Renormalization of weights after EMA: whether needed for precision drift
- Location of `IWeightsRepository` (own file at `src/domain/interfaces/weights.repository.interface.ts`)
- Unit test strategy for EMA (mock `IWeightsRepository`, verify `new_w = 0.1*score + 0.9*old_w`)

### Deferred Ideas (OUT OF SCOPE)

- Personal weights in `GetRankingUseCase` (recruiter ranking) — D-17
- LIKE history for audit/replay — D-08
- Temporal weight decay (older LIKEs count less) — EMA simple, no time factor
- Weight reset endpoint — out of scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEARN-01 | Each candidate LIKE immediately writes an updated `CandidateWeights` record — weights reflect new preference before next feed request | EMA update in `RecordSwipeUseCase` + Prisma upsert in `WeightsRepository` + cache already invalidated by existing `cache.del` |
| LEARN-02 | System uses global default weights until candidate reaches 5 LIKEs (cold-start threshold) | `likeCount` field in `CandidateWeights`; `GetFeedUseCase` checks `>= 5` before passing personal weights |
| LEARN-03 | Recommendation feed applies candidate's personal weights in fit score calculation | `GetFeedUseCase` fetches weights + passes `WeightSet` to `computeFitScore`; `RecommendationRepository` uses passed weights instead of hardcoded values |
</phase_requirements>

---

## Summary

Phase 18 extends the existing Clean Architecture swipe module with a per-candidate weight learning layer. The domain is narrow: one new Prisma model, one new repository pair, and surgical extensions to two existing use cases and one adapter method. No new HTTP endpoints are introduced — the learning system is entirely internal.

The EMA algorithm is mathematically simple and stateless: `new_w = 0.1 * observed_score + 0.9 * old_w`. Each LIKE event computes the 5 factor scores of the liked job (reusing the same factor logic already in `RecommendationRepository.computeFitScore`), then applies EMA to the 5 stored weights independently. The resulting weights are renormalized to sum to 1.0 and persisted via Prisma upsert. After a cold-start threshold of 5 LIKEs, the candidate's feed uses their personal weights instead of the hardcoded global defaults.

The key architectural constraint is that the EMA computation belongs in the **application layer** (use case), not the adapter. The use case owns business logic. The adapter (`WeightsRepository`) only provides upsert/findBy primitives. The factor scores for the liked job must be computed without calling `computeFitScore` recursively — they are extracted as pure computations matching the same logic used in `RecommendationRepository`.

**Primary recommendation:** Follow the DiscRepository pattern exactly — domain entity, interface, adapter with upsert and findBy, TDD with mock in unit tests and real Prisma in integration tests.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| EMA weight update logic | Application (use case) | — | Business rule: belongs in RecordSwipeUseCase, not adapter |
| CandidateWeights persistence | Adapters (repository) | — | Prisma upsert is adapter concern; use case calls via interface |
| Cold-start threshold check | Application (use case) | — | `likeCount >= 5` decision is business logic |
| Factor score extraction for liked job | Application (use case) | — | Computed from job data at LIKE time, not retrieved from DB |
| computeFitScore parametrization | Adapters (service) | Domain (interface) | RecommendationRepository is adapter; interface is domain |
| Weight model persistence | Database (Prisma) | — | CandidateWeights is a PostgreSQL table via Prisma |
| Dependency injection wiring | Infrastructure (routes) | — | swipe.routes.ts is composition root |

---

## Standard Stack

### Core (all already installed) [VERIFIED: codebase grep]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | 7.x (in use) | `CandidateWeights` model + upsert | Already used for all persistence in this project |
| TypeScript 5 | In use | Type-safe `WeightSet`, `IWeightsRepository` | Project language |
| Jest 29 + ts-jest | In use | Unit + integration tests (TDD) | Project test framework |
| Supertest | In use | Integration test HTTP calls | Already used in all integration tests |

### No New Dependencies Required [VERIFIED: codebase inspection]

Phase 18 requires zero new npm packages. All capabilities are delivered through:
- New Prisma model (schema change only, no new library)
- New TypeScript interfaces and classes using existing project patterns
- Extension of existing methods with optional parameters

---

## Architecture Patterns

### System Architecture Diagram

```
POST /swipes (LIKE)
        │
        ▼
RecordSwipeUseCase.execute()
        │
        ├─► ISwipeRepository.createSwipe()        (existing)
        │
        ├─► ICachePort.del(feed:{candidateId})     (existing)
        │
        ├─► IChatPort.createOrGetChat()            (existing, direction===LIKE)
        │
        └─► IWeightsRepository.upsertWeights()     [NEW — EMA update]
                │  compute 5 factor scores
                │  apply EMA per factor
                │  renormalize
                │  upsert to DB
                ▼
          CandidateWeights (PostgreSQL)


GET /jobs/feed
        │
        ▼
GetFeedUseCase.execute()
        │
        ├─► ISwipeRepository.findCandidateProfileByUserId()   (existing)
        │
        ├─► ICachePort.get(feed:{candidateId})                (existing)
        │         (cache HIT → return early)
        │
        ├─► IWeightsRepository.findByCandidateId()            [NEW]
        │         returns CandidateWeights | null
        │
        ├─► ISwipeRepository.findFeedJobs()                   (existing)
        │
        └─► IRecommendationRepository.computeFitScore(        (extended)
                  candidate, job, weights?: WeightSet
            )     │
                  ├─ likeCount < 5 → weights = undefined → use hardcoded globals
                  └─ likeCount >= 5 → weights = personal → replace globals
```

### Recommended Project Structure (new files only)

```
src/
├── domain/
│   ├── entities/
│   │   └── candidate-weights.entity.ts    [NEW] — CandidateWeights domain type
│   └── interfaces/
│       └── weights.repository.interface.ts [NEW] — IWeightsRepository + WeightSet
├── adapters/
│   └── repositories/
│       └── weights.repository.ts          [NEW] — WeightsRepository (Prisma upsert)
├── application/
│   └── use-cases/swipe/
│       ├── record-swipe.use-case.ts       [MODIFY] — add IWeightsRepository + EMA
│       └── get-feed.use-case.ts           [MODIFY] — add IWeightsRepository + pass weights
├── adapters/services/
│   └── recommendation.repository.ts      [MODIFY] — accept weights? param
└── domain/interfaces/
    └── recommendation.repository.interface.ts [MODIFY] — extend computeFitScore signature
```

### Pattern 1: Repository Pair (DiscRepository precedent)

**What:** Domain entity interface + adapter implementation with upsert and findBy methods.

**When to use:** Any new persistence need in Clean Architecture. Used for DiscResult in Phase 17.

**Example (from codebase — `src/domain/interfaces/disc.repository.interface.ts`):** [VERIFIED: codebase read]

```typescript
// src/domain/interfaces/weights.repository.interface.ts
import { CandidateWeights } from '../entities/candidate-weights.entity'

export type WeightSet = {
  profession: number
  skills: number
  location: number
  modality: number
  salary: number
}

export interface IWeightsRepository {
  upsertWeights(
    candidateId: string,
    data: {
      professionWeight: number
      skillsWeight: number
      locationWeight: number
      modalityWeight: number
      salaryWeight: number
      likeCount: number
    }
  ): Promise<CandidateWeights>
  findByCandidateId(candidateId: string): Promise<CandidateWeights | null>
}
```

### Pattern 2: Prisma Upsert (DiscRepository precedent)

**What:** `prisma.model.upsert({ where, create, update })` for idempotent persistence.

**Example (from codebase — `src/adapters/repositories/disc.repository.ts`):** [VERIFIED: codebase read]

```typescript
// src/adapters/repositories/weights.repository.ts
import { prisma } from '../../infrastructure/database/prisma'
import { IWeightsRepository } from '../../domain/interfaces/weights.repository.interface'
import { CandidateWeights } from '../../domain/entities/candidate-weights.entity'

export class WeightsRepository implements IWeightsRepository {
  async upsertWeights(
    candidateId: string,
    data: { professionWeight: number; skillsWeight: number; locationWeight: number; modalityWeight: number; salaryWeight: number; likeCount: number }
  ): Promise<CandidateWeights> {
    const row = await prisma.candidateWeights.upsert({
      where: { candidateId },
      create: { candidateId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByCandidateId(candidateId: string): Promise<CandidateWeights | null> {
    const row = await prisma.candidateWeights.findUnique({ where: { candidateId } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: any): CandidateWeights {
    return {
      id: row.id,
      candidateId: row.candidateId,
      professionWeight: row.professionWeight,
      skillsWeight: row.skillsWeight,
      locationWeight: row.locationWeight,
      modalityWeight: row.modalityWeight,
      salaryWeight: row.salaryWeight,
      likeCount: row.likeCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
```

### Pattern 3: EMA Update in Use Case (application layer logic)

**What:** Factor score extraction + EMA computation inside `RecordSwipeUseCase`.

**Critical insight:** The factor scores for the liked job (professionScore, skillsScore, locationScore, modalityScore, salaryScore) must be computed **without** calling `computeFitScore`. They are pure scalar values (0.0 or 1.0 for boolean factors, 0.0–1.0 for continuous). The EMA is applied per-factor, then weights are renormalized.

**Implementation note on skillsScore:** The full `skillsScore` requires a Neo4j traversal. For the EMA learning input, use a simpler boolean/intersection approximation: `skillsScore = candidateMatchesAnySkill ? 1.0 : 0.0` or `matchCount / totalRequired`. The full Neo4j traversal is expensive and the EMA is directional, not exact. The `GetFeedUseCase` still calls the full Neo4j-aware `computeFitScore` for ranking — the EMA input is the simplified per-factor observation. [ASSUMED — IWeightsRepository receives simplified factor scores, not the full Neo4j-weighted score]

**Alternative (simpler, avoids approximation):** Pass `IRecommendationRepository` into `RecordSwipeUseCase` to reuse `computeFitScore` for factor extraction. But this violates the spirit of EMA — the observation should be the factor score for this specific job, and we already need the job data. The simplest approach: compute inline factor scores in the use case (profession: exact match → 1.0; skills: intersection / required.length; location: use haversine; modality: in preferences; salary: in range). These are the same formulas used in the adapter but applied without Neo4j (direct skill match only).

**Example:**

```typescript
// Inside RecordSwipeUseCase.execute(), after createSwipe, on LIKE:
if (direction === 'LIKE') {
  const existing = await this.weights.findByCandidateId(candidate.id)

  // Step 1: Compute observed factor scores for the liked job
  const professionScore = candidate.professionId === job.professionId ? 1.0 : 0.0
  const skillsScore = job.requiredSkills.length === 0
    ? 1.0
    : candidate.skills.filter(s => job.requiredSkills.includes(s)).length / job.requiredSkills.length
  // ... location, modality, salary computed inline

  // Step 2: Apply EMA (α = 0.1)
  const ALPHA = 0.1
  const old = existing ?? GLOBAL_DEFAULTS  // GLOBAL_DEFAULTS = { profession: 0.30, ... }
  const raw = {
    profession: ALPHA * professionScore + (1 - ALPHA) * old.professionWeight,
    skills:     ALPHA * skillsScore     + (1 - ALPHA) * old.skillsWeight,
    // ...
  }

  // Step 3: Renormalize to sum = 1.0
  const sum = Object.values(raw).reduce((a, b) => a + b, 0)
  const normalized = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]))

  // Step 4: Upsert with incremented likeCount
  await this.weights.upsertWeights(candidate.id, {
    professionWeight: normalized.profession,
    skillsWeight: normalized.skills,
    locationWeight: normalized.location,
    modalityWeight: normalized.modality,
    salaryWeight: normalized.salary,
    likeCount: (existing?.likeCount ?? 0) + 1,
  })
}
```

### Pattern 4: Optional Weights Parameter in computeFitScore

**What:** Extend `IRecommendationRepository.computeFitScore` with an optional `WeightSet` parameter. When provided, the adapter uses these weights instead of the hardcoded globals. The DISC redistribution (`w = hasDiscRequirement ? 0.9 : 1.0`) applies to whatever weights are received.

**Current code (lines 107–116 in `recommendation.repository.ts`):** [VERIFIED: codebase read]

```typescript
// BEFORE (hardcoded):
const w = hasDiscRequirement ? 0.9 : 1.0
return Math.round(
  (professionScore * 0.30 * w +
    skillsScore * 0.35 * w +
    locationScore * 0.20 * w +
    modalityScore * 0.10 * w +
    salaryScore * 0.05 * w +
    discScore * 0.10) * 100,
)

// AFTER (parametrized):
const baseWeights = weights ?? { profession: 0.30, skills: 0.35, location: 0.20, modality: 0.10, salary: 0.05 }
const w = hasDiscRequirement ? 0.9 : 1.0
return Math.round(
  (professionScore * baseWeights.profession * w +
    skillsScore     * baseWeights.skills     * w +
    locationScore   * baseWeights.location   * w +
    modalityScore   * baseWeights.modality   * w +
    salaryScore     * baseWeights.salary     * w +
    discScore * 0.10) * 100,
)
```

**D-14 verification:** The `w` multiplier applies to the personal weights the same way it applies to the globals. If `weights.skills = 0.40` and `hasDiscRequirement = true`, the effective skills weight is `0.40 * 0.9 = 0.36`. This preserves the DISC contribution ceiling at 10%.

### Pattern 5: Constructor Injection Extension

**What:** Add `IWeightsRepository` as a new constructor parameter to both `RecordSwipeUseCase` and `GetFeedUseCase`. Follow the existing pattern.

**Current signatures (from codebase):** [VERIFIED: codebase read]

```typescript
// BEFORE:
class RecordSwipeUseCase {
  constructor(repo: ISwipeRepository, chat: IChatPort, cache: ICachePort) {}
}

class GetFeedUseCase {
  constructor(repo: ISwipeRepository, rec: IRecommendationRepository, cache: ICachePort) {}
}

// AFTER:
class RecordSwipeUseCase {
  constructor(repo: ISwipeRepository, chat: IChatPort, cache: ICachePort, weights: IWeightsRepository) {}
}

class GetFeedUseCase {
  constructor(repo: ISwipeRepository, rec: IRecommendationRepository, cache: ICachePort, weights: IWeightsRepository) {}
}
```

**Wiring point:** `src/adapters/controllers/swipe.controller.ts` instantiates both use cases directly (lines 37, 52). The controller receives opts from the routes. The `IWeightsRepository` must be added to `SwipeRouteOpts` and passed through.

**Current controller instantiation (from codebase):** [VERIFIED: codebase read]

```typescript
// recordSwipe():
const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat, this.opts.cache)

// getFeed():
const useCase = new GetFeedUseCase(new SwipeRepository(), this.opts.neo4j, this.opts.cache)
```

Both must become:
```typescript
const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat, this.opts.cache, new WeightsRepository())
// or pass via opts:
const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat, this.opts.cache, this.opts.weights)
```

**Recommendation:** Pass `WeightsRepository` via `opts` (add `weights: IWeightsRepository` to `SwipeRouteOpts` in `swipe.routes.ts`) and instantiate in the routes file. This follows the same pattern as `neo4j`, `chat`, and `cache`. Instantiating `new WeightsRepository()` directly inside the controller is also acceptable since it has no constructor dependencies, but using opts is more testable.

### Pattern 6: Prisma Schema Addition

**What:** New `CandidateWeights` model in `prisma/schema.prisma`.

**Follows:** `DiscResult` model pattern (one record per candidate, `candidateId @unique`, `onDelete: Cascade`).

**Example:**

```prisma
model CandidateWeights {
  id               String           @id @default(uuid())
  candidateId      String           @unique
  candidate        CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  professionWeight Float            @default(0.30)
  skillsWeight     Float            @default(0.35)
  locationWeight   Float            @default(0.20)
  modalityWeight   Float            @default(0.10)
  salaryWeight     Float            @default(0.05)
  likeCount        Int              @default(0)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}
```

**Note:** `candidateWeights` relation must also be declared on `CandidateProfile`:
```prisma
model CandidateProfile {
  // ...existing fields...
  discResult       DiscResult?
  candidateWeights CandidateWeights?   // [ADD]
}
```

### Anti-Patterns to Avoid

- **Calling computeFitScore inside RecordSwipeUseCase to get factor scores:** Requires a Neo4j session per LIKE, which is expensive and couples the learning trigger to the full scoring pipeline. Compute inline factor scores (pure math) instead.
- **Storing GLOBAL_DEFAULTS only in the adapter:** The defaults (`profession=0.30, skills=0.35, ...`) must also be accessible in the use case for the EMA initial value. Extract to a constants file or inline in the use case. Do not import from the adapter (layer violation).
- **Putting EMA logic in WeightsRepository:** The EMA formula is a business rule. The repository only stores and retrieves. The application layer computes.
- **Fetching CandidateWeights in a separate query after scoring starts:** Fetch before `Promise.all` in `GetFeedUseCase` — one read, then pass to all computeFitScore calls in the loop.
- **Skipping renormalization:** Pure EMA does not preserve sum = 1.0 when different scores are applied per factor. Without renormalization, weights drift and the total weight changes, distorting scores. Always renormalize.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert with race protection | Manual SELECT + INSERT/UPDATE | `prisma.candidateWeights.upsert()` | Prisma upsert is atomic at DB level; manual approach has TOCTOU race |
| Float precision renormalization | Custom rounding functions | Simple sum division: `v / sum` | IEEE 754 drift is tiny; single-pass normalization is sufficient |
| EMA state storage | In-memory per-user map | Prisma CandidateWeights | In-memory state dies on restart; must be durable |
| Factor score reuse across phases | New scoring module | Inline computations in use case | 5 factors are simple boolean/ratio math; no library needed |

**Key insight:** Phase 18 has no "don't hand-roll" problem — the domain is pure arithmetic and Prisma upsert. The risk is over-engineering (unnecessary abstraction layers) not under-engineering.

---

## Common Pitfalls

### Pitfall 1: GLOBAL_DEFAULTS Defined in Adapter, Needed in Application Layer

**What goes wrong:** The hardcoded weights `0.30, 0.35, 0.20, 0.10, 0.05` currently live in `recommendation.repository.ts` (adapter). If the EMA use case needs these values as initial state (when `findByCandidateId` returns null), importing them from the adapter violates the architecture (`application/` must not import `adapters/`).

**Why it happens:** Natural copy-paste instinct; the numbers are already there in the adapter.

**How to avoid:** Define `GLOBAL_WEIGHT_DEFAULTS` as a constant in `src/application/use-cases/swipe/` (co-located with the use case, or in a `src/application/constants/` file). The adapter also uses these defaults but reads them from the same constants file, or hard-codes its own copy (the values are fixed by D-03 and won't change).

**Warning signs:** `import ... from '../../../adapters/...'` appearing in a use case file.

### Pitfall 2: skillsScore Approximation vs Full Neo4j Score

**What goes wrong:** Using the full `computeFitScore` result as the EMA observation (trying to learn from the total fit score rather than per-factor scores) means the algorithm does not learn which *individual* factors drove the like.

**Why it happens:** Calling `this.rec.computeFitScore(candidate, job)` inside `RecordSwipeUseCase` seems natural.

**How to avoid:** Compute the 5 factor scores independently as pure math in the use case. For `skillsScore`, use direct string intersection (no Neo4j): `matchCount / totalRequired`. This is a simplification — the feed scoring uses Neo4j adjacency, but the EMA observation uses direct matching. This is acceptable: the EMA input is a signal, not an exact score.

**Warning signs:** `this.rec.computeFitScore(...)` appearing inside `RecordSwipeUseCase`.

### Pitfall 3: Constructor Parameter Order Breaks Existing Tests

**What goes wrong:** Adding `weights: IWeightsRepository` as a new 4th constructor parameter to `RecordSwipeUseCase` and `GetFeedUseCase` immediately breaks all existing unit tests that call `new RecordSwipeUseCase(repo, chat, cache)` and `new GetFeedUseCase(repo, rec, cache)`.

**Why it happens:** TypeScript enforces arity for non-optional parameters.

**How to avoid:** Either (a) add `weights` as optional with a default, or (b) update all existing test instantiations simultaneously with the constructor change. Option (b) is cleaner — tests should explicitly inject the mock. Existing tests in `tests/unit/record-swipe.use-case.test.ts` and `tests/unit/get-feed.use-case.test.ts` will need a `makeWeightsRepo()` factory added and passed to the constructor.

**Impact:** 5 existing test cases in `record-swipe.use-case.test.ts` + 4 in `get-feed.use-case.test.ts` need updated instantiation.

### Pitfall 4: likeCount Race Condition in Upsert

**What goes wrong:** Reading `likeCount` from `findByCandidateId`, incrementing it in memory, then writing it back via upsert leaves a window for two concurrent LIKEs to both read the same `likeCount` and produce the same value (classic TOCTOU).

**Why it happens:** Upsert is used for the initial create path, but the `likeCount + 1` operation happens in application code.

**How to avoid:** For this phase, the existing Swipe table has a `@@unique([candidateId, jobId])` constraint — a candidate can only LIKE a job once. The probability of two concurrent LIKEs from the same candidate is extremely low in practice. If strict atomic increment is required, add a `$executeRaw` for `UPDATE ... SET likeCount = likeCount + 1` as a separate step, or accept the tiny race since duplicate swipes are already blocked at DB level.

**Pragmatic decision:** Accept the race (per D-08 no history, the EMA result is directional not exact). Document as known limitation.

### Pitfall 5: setup.ts Missing candidateWeights Cleanup

**What goes wrong:** Integration tests leak `candidateWeights` rows between tests because `setup.ts` does not delete them in `afterEach`. This causes test pollution — a candidate may have personal weights from a previous test affecting cold-start behavior.

**Why it happens:** `setup.ts` (verified in codebase) explicitly lists each model to delete. A new model must be added.

**How to avoid:** Add `await prisma.candidateWeights.deleteMany()` to `afterEach` in `tests/helpers/setup.ts`, placed before `prisma.discResult.deleteMany()` (since DiscResult and CandidateWeights are both children of CandidateProfile). **This is a required change.**

**Warning signs:** Integration tests that test cold-start behavior (< 5 LIKEs) fail intermittently.

### Pitfall 6: WeightSet Type Not Exported from Domain Layer

**What goes wrong:** `WeightSet` type is defined in the adapter or use case, requiring other code to import it from outside the domain layer.

**Why it happens:** It feels natural to co-locate the type with its first use.

**How to avoid:** Export `WeightSet` from `src/domain/interfaces/weights.repository.interface.ts`. Both the use case and the recommendation interface import it from there. This keeps the domain as the single source of truth for types.

### Pitfall 7: D-14 Math — Personal Weights + DISC Must Not Exceed 1.0

**What goes wrong:** If personal weights sum to 1.0 and DISC is applied with `discScore * 0.10`, the total when all factors are 1.0 becomes `1.0 * w + 0.10` = 1.0 when w=0.9, which is correct. But if personal weights do not sum precisely to 1.0 (float precision), the final score may slightly exceed 100.

**Why it happens:** Float arithmetic.

**How to avoid:** `Math.round()` is already applied in the return statement. The renormalization step after EMA ensures weights sum to 1.0. The `Math.round()` call handles residual float imprecision. No additional clamping needed, but add `Math.min(result, 100)` as defensive guard. [ASSUMED — Math.min is sufficient defensive guard]

---

## Code Examples

### GLOBAL_DEFAULTS constant (application layer)

```typescript
// src/application/use-cases/swipe/weights.constants.ts
export const GLOBAL_WEIGHT_DEFAULTS = {
  profession: 0.30,
  skills: 0.35,
  location: 0.20,
  modality: 0.10,
  salary: 0.05,
} as const

export type WeightKeys = keyof typeof GLOBAL_WEIGHT_DEFAULTS
```

### EMA computation (inline in use case)

```typescript
const ALPHA = 0.1
const existing = await this.weights.findByCandidateId(candidate.id)
const old = existing
  ? {
      profession: existing.professionWeight,
      skills: existing.skillsWeight,
      location: existing.locationWeight,
      modality: existing.modalityWeight,
      salary: existing.salaryWeight,
    }
  : { ...GLOBAL_WEIGHT_DEFAULTS }

const raw = {
  profession: ALPHA * professionScore + (1 - ALPHA) * old.profession,
  skills:     ALPHA * skillsScore     + (1 - ALPHA) * old.skills,
  location:   ALPHA * locationScore   + (1 - ALPHA) * old.location,
  modality:   ALPHA * modalityScore   + (1 - ALPHA) * old.modality,
  salary:     ALPHA * salaryScore     + (1 - ALPHA) * old.salary,
}

// Renormalize
const sum = Object.values(raw).reduce((a, b) => a + b, 0)
const normalized = sum > 0
  ? { profession: raw.profession / sum, skills: raw.skills / sum, location: raw.location / sum, modality: raw.modality / sum, salary: raw.salary / sum }
  : { ...GLOBAL_WEIGHT_DEFAULTS }

await this.weights.upsertWeights(candidate.id, {
  professionWeight: normalized.profession,
  skillsWeight:     normalized.skills,
  locationWeight:   normalized.location,
  modalityWeight:   normalized.modality,
  salaryWeight:     normalized.salary,
  likeCount: (existing?.likeCount ?? 0) + 1,
})
```

### GetFeedUseCase weight injection

```typescript
// After findCandidateProfileByUserId, before cache check:
const candidateWeightsRecord = await this.weights.findByCandidateId(candidate.id)
const personalWeights: WeightSet | undefined =
  candidateWeightsRecord && candidateWeightsRecord.likeCount >= 5
    ? {
        profession: candidateWeightsRecord.professionWeight,
        skills:     candidateWeightsRecord.skillsWeight,
        location:   candidateWeightsRecord.locationWeight,
        modality:   candidateWeightsRecord.modalityWeight,
        salary:     candidateWeightsRecord.salaryWeight,
      }
    : undefined

// Then in the scoredData Promise.all:
fitScore: await this.rec.computeFitScore(candidateInput, jobInput, personalWeights),
```

### Unit test factory additions

```typescript
// Add to record-swipe.use-case.test.ts and get-feed.use-case.test.ts:
const makeWeightsRepo = (): jest.Mocked<IWeightsRepository> => ({
  upsertWeights: jest.fn().mockResolvedValue({
    id: 'w-1', candidateId: 'cand-1',
    professionWeight: 0.30, skillsWeight: 0.35, locationWeight: 0.20,
    modalityWeight: 0.10, salaryWeight: 0.05, likeCount: 1,
    createdAt: new Date(), updatedAt: new Date(),
  }),
  findByCandidateId: jest.fn().mockResolvedValue(null),  // default: no existing weights
})
```

### Integration test pattern for learning system

```typescript
// tests/integration/weights.test.ts (new file)
it('LIKE action immediately writes CandidateWeights with likeCount=1', async () => {
  // 1. register candidate, create profile
  // 2. create job
  // 3. POST /swipes { direction: 'LIKE' }
  // 4. query DB: expect prisma.candidateWeights.findUnique({ where: { candidateId } }) to exist
  // 5. expect likeCount === 1
})

it('feed uses global weights with 4 LIKEs (cold-start)', async () => {
  // 4 LIKEs → GET /jobs/feed → scores should match global-weight computation
})

it('feed uses personal weights with 5+ LIKEs', async () => {
  // 5 LIKEs → GET /jobs/feed → scores should differ from pure global-weight scores
  // (create a second job with very different profile to make divergence observable)
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded weights in computeFitScore | Optional `weights?` parameter | Phase 18 | Backward compatible — undefined = global defaults |
| No learning from candidate behavior | EMA per-LIKE weight drift | Phase 18 | Feed personalizes after 5 LIKEs |
| Single RecordSwipeUseCase constructor | 4-arg constructor with IWeightsRepository | Phase 18 | All existing tests need `makeWeightsRepo()` added |

**Deprecated/outdated:**
- Hardcoded `0.30, 0.35, 0.20, 0.10, 0.05` literals in `recommendation.repository.ts` lines 109–113: after Phase 18, these become the fallback path (`weights ?? globals`), not the only path.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | skillsScore for EMA observation uses direct string intersection (no Neo4j) | Architecture Patterns, Pattern 3 | If full Neo4j traversal is used, RecordSwipeUseCase gains a Neo4j dependency — must pass IRecommendationRepository into it (architecture change) |
| A2 | `Math.min(result, 100)` sufficient guard for float imprecision with personal weights + DISC | Pitfall 7 | If overflow is real, scores >100 could appear in feed responses |
| A3 | Passing `WeightsRepository` via `opts` (not instantiated in controller body) is the preferred wiring pattern | Patterns, Pattern 5 | Either approach works; controller-instantiated is simpler if no testing of the wiring is needed |

---

## Open Questions

1. **skillsScore approximation fidelity**
   - What we know: The EMA observation should be per-factor, not the total score
   - What's unclear: Whether to use direct string match (no Neo4j) or full Neo4j traversal for the skills observation in EMA
   - Recommendation: Use direct string intersection for the EMA input (simpler, no Neo4j session per LIKE). The full Neo4j traversal still runs in `computeFitScore` for ranking. This is a known simplification.

2. **GLOBAL_DEFAULTS location**
   - What we know: Must be in `application/` or `domain/`, not `adapters/`
   - What's unclear: Whether a shared constants file is needed or inline is fine
   - Recommendation: Inline in `weights.constants.ts` co-located with the use case. Only two consumers (use case + adapter fallback).

---

## Environment Availability

Step 2.6: SKIPPED — Phase 18 is a pure code/schema change. No new external dependencies (no new services, no new CLI tools, no new runtimes). Prisma, PostgreSQL, and Neo4j are all already running in the development environment.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest tests/unit/record-swipe.use-case.test.ts tests/unit/get-feed.use-case.test.ts tests/unit/recommendation.service.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEARN-01 | LIKE writes CandidateWeights record immediately | unit (mock) + integration | `npx jest tests/unit/record-swipe.use-case.test.ts -t "weights"` | ❌ Wave 0 |
| LEARN-01 | EMA formula: new_w = 0.1*score + 0.9*old_w | unit | `npx jest tests/unit/record-swipe.use-case.test.ts -t "EMA"` | ❌ Wave 0 |
| LEARN-02 | < 5 LIKEs → global weights passed as undefined | unit | `npx jest tests/unit/get-feed.use-case.test.ts -t "cold-start"` | ❌ Wave 0 |
| LEARN-02 | >= 5 LIKEs → personal WeightSet passed to computeFitScore | unit | `npx jest tests/unit/get-feed.use-case.test.ts -t "personal weights"` | ❌ Wave 0 |
| LEARN-03 | computeFitScore uses personal weights when provided | unit | `npx jest tests/unit/recommendation.service.test.ts -t "personal weights"` | ❌ Wave 0 |
| LEARN-03 | computeFitScore falls back to globals when weights=undefined | unit | `npx jest tests/unit/recommendation.service.test.ts -t "fallback"` | ❌ Wave 0 |
| LEARN-01+02+03 | End-to-end: 5 LIKEs → feed changes | integration | `npx jest tests/integration/weights.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx jest tests/unit/record-swipe.use-case.test.ts tests/unit/get-feed.use-case.test.ts tests/unit/recommendation.service.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/record-swipe.use-case.test.ts` — needs `makeWeightsRepo()` factory + 4 new EMA test cases (LEARN-01); update 5 existing `new RecordSwipeUseCase(...)` calls to 4-arg constructor
- [ ] `tests/unit/get-feed.use-case.test.ts` — needs `makeWeightsRepo()` factory + 3 new cold-start/personal-weights test cases (LEARN-02); update 4 existing `new GetFeedUseCase(...)` calls to 4-arg constructor
- [ ] `tests/unit/recommendation.service.test.ts` — needs 2 new test cases for `computeFitScore` with personal weights (LEARN-03); `makeRecRepo()` mock needs `computeFitScore` updated to accept optional 3rd arg
- [ ] `tests/integration/weights.test.ts` — new file, 3 integration test cases covering LEARN-01+02+03
- [ ] `tests/helpers/setup.ts` — add `await prisma.candidateWeights.deleteMany()` before `discResult.deleteMany()` in `afterEach`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | No new endpoints; existing `requireRole('CANDIDATE')` on POST /swipes covers trigger path |
| V5 Input Validation | no | No new HTTP input; `direction` already validated by existing `SwipeBodySchema` with Zod |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Candidate forging weights by submitting manipulated LIKEs | Tampering | Weights are computed server-side from verified swipe data; client never submits weights directly |
| Weight drift leaking information about other candidates | Information Disclosure | Weights are per-candidate, stored by candidateId; no cross-candidate weight exposure |
| Float overflow producing score > 100 | Tampering | `Math.round()` + `Math.min(result, 100)` defensive guard |

**Phase 18 has minimal security surface** — no new endpoints, no new authentication, no user-controlled weight input. The learning is entirely server-computed.

---

## Sources

### Primary (HIGH confidence)
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — verified constructor, LIKE block, cache.del pattern [VERIFIED: codebase read]
- `src/application/use-cases/swipe/get-feed.use-case.ts` — verified constructor, computeFitScore call site, cache pattern [VERIFIED: codebase read]
- `src/adapters/services/recommendation.repository.ts` — verified hardcoded weight lines 107–116 [VERIFIED: codebase read]
- `src/adapters/repositories/disc.repository.ts` — verified upsert pattern to follow [VERIFIED: codebase read]
- `src/domain/interfaces/disc.repository.interface.ts` — verified interface pattern to follow [VERIFIED: codebase read]
- `prisma/schema.prisma` — verified CandidateProfile structure, DiscResult pattern for new model [VERIFIED: codebase read]
- `tests/helpers/setup.ts` — verified afterEach cleanup list (CandidateWeights not in it) [VERIFIED: codebase read]
- `src/adapters/controllers/swipe.controller.ts` — verified use case instantiation points [VERIFIED: codebase read]
- `src/infrastructure/http/routes/swipe.routes.ts` — verified SwipeRouteOpts type, composition root [VERIFIED: codebase read]
- `tests/unit/record-swipe.use-case.test.ts` — verified 5 existing tests needing constructor update [VERIFIED: codebase read]
- `tests/unit/get-feed.use-case.test.ts` — verified 4 existing tests needing constructor update [VERIFIED: codebase read]
- `.planning/phases/18-learning-system/18-CONTEXT.md` — all locked decisions D-01 through D-18 [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- EMA formula `new_w = α*x + (1-α)*old_w` — standard exponential moving average, mathematically well-established [ASSUMED: training knowledge, formula matches D-01]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in use, verified from codebase
- Architecture: HIGH — patterns directly observed from DiscRepository/Phase 17 implementation
- EMA math: HIGH — formula locked by D-01, mathematically deterministic
- Pitfalls: HIGH (setup.ts gap, constructor arity) / MEDIUM (float precision edge cases)
- skillsScore approximation: MEDIUM — depends on final decision about Neo4j use in EMA path

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable domain — no fast-moving dependencies)
