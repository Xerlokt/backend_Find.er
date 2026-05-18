# Phase 16: Recruiter Skill Preview — Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 3 new/modified files
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | use-case (modify) | request-response | `src/application/use-cases/swipe/get-feed.use-case.ts` | exact |
| `tests/unit/get-ranking.use-case.test.ts` | test (extend) | request-response | `tests/unit/get-feed.use-case.test.ts` | exact |
| `src/infrastructure/http/routes/swipe.routes.ts` | route/type (modify) | request-response | itself (current RankingItem inline type) | self-analog |

---

## Pattern Assignments

### `src/application/use-cases/swipe/get-ranking.use-case.ts` (use-case, request-response)

**Analog:** `src/application/use-cases/swipe/get-feed.use-case.ts` (exact role + data flow match)

**Pure function co-location pattern** — The project has an established precedent in `src/application/utils/haversine.ts`: a module-level pure function exported from the application layer with explicit nullable union return type. Phase 16 follows the same pattern but keeps `censorProfile()` and `buildFitReasons()` in the use-case file itself (not a separate utility) because they are specific to ranking censoring logic and have no other callers.

**Imports pattern** (`src/application/use-cases/swipe/get-ranking.use-case.ts` lines 1-6 — current):
```typescript
import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { haversineKm } from '../../utils/haversine'
import { ICachePort } from '../../ports/cache.port'
```

Add named imports from `swipe.repository.interface` — `SwipeWithCandidateInfo` is already exported there. No new imports needed; all types are already in scope.

**Type definitions to add** (new — place above `export class GetRankingUseCase`, after imports):
```typescript
// Profile types for ranking response — Phase 16
export interface FullProfile {
  name: string
  avatarUrl: string | null
  bio: string | null
  skills: string[]
  professionId: string
  preferredModalities: string[]
  salaryExpectation: number | null
}

export interface CensoredProfile {
  // Identity fields — always null for locked candidates (REC-03)
  name: null
  avatarUrl: null
  bio: null
  // Non-identity preview fields (REC-01, REC-02)
  matchingSkills: string[]
  fitReasons: string[]
}

export type RankingProfile = FullProfile | CensoredProfile
```

Note: `null` is removed from the union. After Phase 16, every candidate always receives either `FullProfile` or `CensoredProfile` — never `null`.

**buildFitReasons() pure function** (new — place after type definitions, before censorProfile):
```typescript
// Pure function — no side effects, no DB access (REC-02)
function buildFitReasons(
  candidate: { salaryExpectation: number | null; professionId: string },
  job: { requiredSkills: string[]; salaryMin: number | null; salaryMax: number | null; professionId: string },
  matchingSkills: string[],
): string[] {
  const reasons: string[] = []

  // Skill reason — canonical format locked in ROADMAP Phase 16 examples
  reasons.push(`${matchingSkills.length}/${job.requiredSkills.length} skills match`)

  // Salary reason — only emitted when both candidate and job have salary data
  if (candidate.salaryExpectation !== null && (job.salaryMin !== null || job.salaryMax !== null)) {
    const inRange =
      (job.salaryMin === null || candidate.salaryExpectation >= job.salaryMin) &&
      (job.salaryMax === null || candidate.salaryExpectation <= job.salaryMax)
    reasons.push(inRange ? 'salary in range' : 'salary outside range')
  }

  // Profession reason
  reasons.push(candidate.professionId === job.professionId ? 'profession match' : 'different profession')

  return reasons
}
```

**censorProfile() pure function** (new — place after buildFitReasons, before class):
```typescript
// Single code path for all reveal/conceal decisions (REC-03, Success Criterion 4)
// Analog: haversineKm() in src/application/utils/haversine.ts — module-level pure function
// with explicit union return type and null guards.
function censorProfile(
  swipe: SwipeWithCandidateInfo,
  job: { requiredSkills: string[]; salaryMin: number | null; salaryMax: number | null; professionId: string },
  isUnlocked: boolean,
): FullProfile | CensoredProfile {
  const isRevealed = swipe.direction === 'LIKE' || isUnlocked

  if (isRevealed) {
    return {
      name: swipe.candidate.name,
      avatarUrl: swipe.candidate.avatarUrl,
      bio: swipe.candidate.bio,
      skills: swipe.candidate.skills,
      professionId: swipe.candidate.professionId,
      preferredModalities: swipe.candidate.preferredModalities,
      salaryExpectation: swipe.candidate.salaryExpectation,
      // lat/lng intentionally excluded — location privacy (unchanged from current line 80)
    }
  }

  // DISLIKE + locked: preview only — no identity (REC-01, REC-02, REC-03)
  const matchingSkills = swipe.candidate.skills.filter(s => job.requiredSkills.includes(s))
  const fitReasons = buildFitReasons(swipe.candidate, job, matchingSkills)

  return {
    name: null,
    avatarUrl: null,
    bio: null,
    matchingSkills,
    fitReasons,
  }
}
```

**Current censoring logic to replace** (`get-ranking.use-case.ts` lines 69-82):
```typescript
// CURRENT — inline ternary to be replaced:
const profile =
  swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
    ? {
        name: swipe.candidate.name,
        avatarUrl: swipe.candidate.avatarUrl,
        bio: swipe.candidate.bio,
        skills: swipe.candidate.skills,
        professionId: swipe.candidate.professionId,
        preferredModalities: swipe.candidate.preferredModalities,
        salaryExpectation: swipe.candidate.salaryExpectation,
        // lat/lng intentionally excluded — location privacy
      }
    : null // DISLIKE not unlocked — identity fully censored

// AFTER Phase 16 — single call:
const profile = censorProfile(swipe, job, unlockedCandidateIds.has(swipe.candidateId))
```

**Error handling pattern** (unchanged — copy from `get-feed.use-case.ts` lines 23-24, `get-ranking.use-case.ts` lines 29-32):
```typescript
try {
  const cached = await this.cache.get(cacheKey)
  if (cached) return JSON.parse(cached)
} catch { /* Redis down or corrupt cache entry — fall through */ }
```

---

### `tests/unit/get-ranking.use-case.test.ts` (test, extend)

**Analog:** `tests/unit/get-feed.use-case.test.ts` (exact match — same repo/rec/cache factory pattern, same swipe module fixtures)

**Imports pattern** (lines 1-4 — current, unchanged):
```typescript
import { GetRankingUseCase } from '../../src/application/use-cases/swipe/get-ranking.use-case'
import type { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import type { IRecommendationRepository } from '../../src/domain/interfaces/recommendation.repository.interface'
import type { ICachePort } from '../../src/application/ports/cache.port'
```

Add import for the new exported types:
```typescript
import { censorProfile, buildFitReasons, type CensoredProfile, type FullProfile } from '../../src/application/use-cases/swipe/get-ranking.use-case'
```

Note: `censorProfile` and `buildFitReasons` must be exported from the use-case file (named export, not default) for direct unit testing. This is required by CLAUDE.md TDD rules: pure functions must be tested in isolation.

**Mock factory pattern** (lines 6-26 — current, reuse unchanged):
```typescript
const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
} as jest.Mocked<ISwipeRepository>)

const makeRecRepo = (): jest.Mocked<IRecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
} as jest.Mocked<IRecommendationRepository>)

const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),        // default: cache miss
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})
```

**Fixture pattern** (lines 28-50 — current, extend `jobItem` with salary/profession fields needed for `buildFitReasons`):
```typescript
// jobItem already has professionId, salaryMin/Max — no changes needed for censorProfile tests
const jobItem = {
  id: 'job-1',
  companyId: 'comp-1',
  recruiterId: 'rec-1',
  professionId: 'backend-dev',
  requiredSkills: ['nodejs'],
  modality: 'REMOTE',
  salaryMin: null,
  salaryMax: null,
  lat: null,
  lng: null,
  isActive: true,
  expiresAt: new Date(Date.now() + 86400000),
  title: 'Backend Dev',
  description: 'Build stuff',
}
```

Add a `candidateProfile` fixture at file scope (currently it is defined only inside a single test — lines 79-91 of existing test). Move or duplicate to top-level for reuse in new tests:
```typescript
const candidateProfile = {
  id: 'cand-1',
  name: 'Alice',
  professionId: 'backend-dev',
  skills: ['nodejs'],
  preferredModalities: ['REMOTE'],
  salaryExpectation: null,
  lat: null,
  lng: null,
  searchRadiusKm: 50,
  bio: null,
  avatarUrl: null,
}
```

**Pure function test describe block pattern** (analog: `recommendation.service.test.ts` lines 41-347 — nested describe by concern, no mocks for pure function tests):
```typescript
describe('censorProfile() pure function', () => {
  const job = { ...jobItem }

  const makeSwipe = (overrides: Partial<{ direction: string; candidateSkills: string[] }> = {}) => ({
    id: 'swipe-1',
    candidateId: 'cand-1',
    jobId: 'job-1',
    direction: overrides.direction ?? 'LIKE',
    swipedAt: new Date(),
    candidate: {
      ...candidateProfile,
      skills: overrides.candidateSkills ?? ['nodejs'],
    },
  })

  it('LIKE direction → FullProfile with name not null', () => {
    const result = censorProfile(makeSwipe({ direction: 'LIKE' }) as any, job as any, false)
    expect(result.name).toBe('Alice')
    expect('matchingSkills' in result).toBe(false)
  })

  it('DISLIKE + unlocked → FullProfile with name not null', () => {
    const result = censorProfile(makeSwipe({ direction: 'DISLIKE' }) as any, job as any, true)
    expect(result.name).toBe('Alice')
  })

  it('DISLIKE + locked → CensoredProfile with name: null', () => {
    const result = censorProfile(makeSwipe({ direction: 'DISLIKE' }) as any, job as any, false)
    expect(result.name).toBeNull()
    expect(result.avatarUrl).toBeNull()
    expect(result.bio).toBeNull()
    expect('matchingSkills' in result).toBe(true)
  })

  it('DISLIKE + locked → matchingSkills contains only intersection', () => {
    const result = censorProfile(
      makeSwipe({ direction: 'DISLIKE', candidateSkills: ['nodejs', 'python'] }) as any,
      { ...job, requiredSkills: ['nodejs', 'typescript'] } as any,
      false,
    ) as CensoredProfile
    expect(result.matchingSkills).toEqual(['nodejs'])
  })

  it('DISLIKE + locked → matchingSkills is empty array when no overlap', () => {
    const result = censorProfile(
      makeSwipe({ direction: 'DISLIKE', candidateSkills: ['python'] }) as any,
      { ...job, requiredSkills: ['nodejs'] } as any,
      false,
    ) as CensoredProfile
    expect(result.matchingSkills).toEqual([])
  })

  it('DISLIKE + locked → fitReasons includes skill count string', () => {
    const result = censorProfile(
      makeSwipe({ direction: 'DISLIKE', candidateSkills: ['nodejs'] }) as any,
      { ...job, requiredSkills: ['nodejs', 'typescript'] } as any,
      false,
    ) as CensoredProfile
    expect(result.fitReasons).toContain('1/2 skills match')
  })
})
```

**Use-case integration describe block** (copy structure from lines 52-135 of existing test — `describe('GetRankingUseCase', ...)` block):
- The 4 existing tests (cache HIT, cache MISS, FORBIDDEN, NOT_FOUND) are untouched.
- Add 2 new `it` blocks inside the existing describe to cover `direction='DISLIKE'` locked and unlocked states at the use-case output level (verifying profile shape in the returned array).

**beforeEach pattern** (line 53 — current, unchanged):
```typescript
beforeEach(() => jest.clearAllMocks())
```

---

### `src/infrastructure/http/routes/swipe.routes.ts` (route/type, modify)

**Current state:** The file (lines 1-29) defines route registration only; it does NOT currently export a `RankingItem` type. The RESEARCH.md notes reference to "Decision 04-04" — a previous phase decision to put the type in `swipe.routes.ts`. However, the current file has no such exported type.

**Search result:** No `RankingItem` type found in the current swipe.routes.ts. The controller (`swipe.controller.ts`) uses `reply.status(200).send(result)` untyped. The response type flows implicitly.

**Action:** Add the exported `RankingItem` type to `swipe.routes.ts` immediately after the `SwipeRouteOpts` type (line 9). This gives the planner a concrete anchor for updating the type contract:

```typescript
// RankingItem — response shape for GET /jobs/:jobId/ranking
// Updated in Phase 16: profile is FullProfile | CensoredProfile (no longer null)
export type RankingItem = {
  candidateId: string
  fitScore: number
  distanceKm: number | null
  rank: number
  profile: import('../../../application/use-cases/swipe/get-ranking.use-case').RankingProfile
}
```

**Import pattern in swipe.routes.ts** (lines 1-8 — current, unchanged pattern):
```typescript
import { FastifyInstance } from 'fastify'
import { SwipeController } from '../../../adapters/controllers/swipe.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { IChatPort } from '../../../application/ports/chat.port'
import { ICachePort } from '../../../application/ports/cache.port'
import { IRecommendationRepository } from '../../../domain/interfaces/recommendation.repository.interface'
```

---

## Shared Patterns

### Pure Function Declaration (module-level, not class method)

**Source:** `src/application/utils/haversine.ts` lines 1-17
**Apply to:** `censorProfile()` and `buildFitReasons()` in `get-ranking.use-case.ts`

Pattern: declare as plain named `function` (not arrow function assigned to `const`) at module scope, before the class. Use explicit TypeScript return types. Export with `export` keyword so tests can import and call directly.

```typescript
export function haversineKm(
  lat1: number | null,
  // ...
): number | null {
  if (lat1 == null || ...) return null
  // ...
}
```

Key decisions mirrored for `censorProfile`/`buildFitReasons`:
- Named function declaration (not const arrow) — consistent with project style
- Explicit return type annotation
- `export` keyword — required for TDD isolation per CLAUDE.md

### Error Handling (try/catch around cache calls)

**Source:** `src/application/use-cases/swipe/get-ranking.use-case.ts` lines 29-32 and 107
**Apply to:** No change — cache try/catch pattern is already in the use case and is unchanged by Phase 16.

```typescript
try {
  const cached = await this.cache.get(cacheKey)
  if (cached) return JSON.parse(cached)
} catch { /* Redis down or corrupt cache entry — fall through */ }
// ...
try { await this.cache.set(cacheKey, JSON.stringify(result), 30) } catch { /* Redis down — ok */ }
```

### Interface Union Typing (TypeScript structural union)

**Source:** `src/domain/interfaces/swipe.repository.interface.ts` line 12 — `SwipeWithCandidateInfo` uses intersection type `CandidateProfile & { avatarUrl: string | null }` as a pattern for extending domain types inline.

**Apply to:** `RankingProfile = FullProfile | CensoredProfile` type alias in `get-ranking.use-case.ts`. No discriminant field is needed for Phase 16 — downstream code can use `'matchingSkills' in profile` as a type guard if needed.

### Jest Mock Factory Pattern

**Source:** `tests/unit/get-ranking.use-case.test.ts` lines 6-26 (existing), `tests/unit/get-feed.use-case.test.ts` lines 6-26 (identical structure)
**Apply to:** Reuse all three factory functions (`makeSwipeRepo`, `makeRecRepo`, `makeCache`) unchanged. Add a `makeSwipe()` factory scoped inside the `describe('censorProfile() pure function', ...)` block.

Pattern: factory functions return `jest.Mocked<Interface>` objects. Default mock values chosen to represent the most common path (cache miss, no errors) so each test only needs to override what it tests.

```typescript
const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),        // default: cache miss
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})
```

---

## No Analog Found

No files in this phase lack an analog. All three files have direct analogs in the codebase.

---

## Key Field Reference

Fields available on `SwipeWithCandidateInfo.candidate` (`src/domain/interfaces/swipe.repository.interface.ts` line 12):

```typescript
CandidateProfile & { avatarUrl: string | null }
// = { id, userId, name, bio, lat, lng, professionId, skills, preferredModalities, searchRadiusKm, salaryExpectation }
//   & { avatarUrl: string | null }
```

Fields available on `Job` (`src/domain/entities/job.entity.ts`):
```
id, companyId, recruiterId, title, description, professionId,
salaryMin, salaryMax, lat, lng, modality, requiredSkills, expiresAt, isActive, createdAt
```

Note: `CandidateProfile` has NO `email` field — confirmed from `src/domain/entities/candidate.entity.ts`. Do not add `email` to `CensoredProfile` (REC-03, Anti-Pattern 4 in RESEARCH.md).

---

## Metadata

**Analog search scope:** `src/application/use-cases/swipe/`, `src/application/utils/`, `tests/unit/`, `src/domain/interfaces/`, `src/infrastructure/http/routes/`, `src/adapters/controllers/`
**Files read:** 13
**Pattern extraction date:** 2026-05-17
