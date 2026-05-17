# Phase 16: Recruiter Skill Preview — Research

**Researched:** 2026-05-17
**Domain:** TypeScript pure-function refactor — extend GetRankingUseCase censoring logic
**Confidence:** HIGH

---

## Summary

Phase 16 is a targeted, self-contained enhancement to the existing `GetRankingUseCase`. No new infrastructure, routes, or schema migrations are required. The phase narrows entirely to one question: **what does a recruiter see on a censored candidate card?**

Currently, censored candidates (DISLIKE + not unlocked) receive `profile: null`. Phase 16 replaces that null with a structured object containing `matchingSkills[]` and `fitReasons[]` while keeping all identity fields (`name`, `email`, `photo`, `location`) as `null`. The key engineering constraint is that a **single `censorProfile()` pure function** must be the only code path that makes this reveal/conceal decision — preventing the three distinct candidate states (LIKE, DISLIKE-unlocked, DISLIKE-locked) from being handled in ad-hoc if/else branches scattered across the use case.

The work touches exactly four files: the use case (`get-ranking.use-case.ts`), the unit tests (`get-ranking.use-case.test.ts`), the route-level types (`swipe.routes.ts` RankingItem shape), and possibly the controller response contract. No new dependencies are needed. The entire phase is a TypeScript refactor with logic extension, TDD-first.

**Primary recommendation:** Introduce a `censorProfile()` pure function in the use case file (or co-located helper), define a `CensoredProfile` type for the preview shape, and update unit tests to cover all three candidate states before touching the implementation.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | Recruiter sees, for DISLIKE/not-unlocked candidates, the list of skills that match the job (not identity) | Requires `matchingSkills[]` computed as intersection of `candidate.skills` and `job.requiredSkills`; both are `String[]` already in scope at the point of censoring in `GetRankingUseCase` |
| REC-02 | Ranking response includes `fitReasons[]` (e.g., "4/6 skills match", "salary outside range") for censored candidates | Requires string array derived from comparing FitScoreInput fields to FitScoreJobInput fields; all inputs are already in scope at censor point |
| REC-03 | Preview never exposes name, email, photo, or location — only skills and fit reasons | Requires `censorProfile()` to explicitly null all identity fields while populating preview fields; unit test must cover that censored path returns null for name/avatarUrl/bio |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| matchingSkills computation | Application (use case) | — | Pure data intersection; no DB or Neo4j call needed — both skill arrays already in memory when censor runs |
| fitReasons generation | Application (use case) | — | String formatting of already-computed fitScore inputs; belongs with censoring logic, not the repository or route |
| Identity field nulling | Application (use case) | — | Information security decision; must be a domain concern, not a controller/route filter |
| Response type contract | Infrastructure (routes) | Adapters (controller) | RankingItem shape is exported from swipe.routes.ts per Decision 04-04; type must be updated there |
| Unit test coverage | Application (use case) | — | censorProfile() is a pure function; trivially testable with zero mocks |

---

## Standard Stack

No new dependencies required for this phase. All existing stack components apply.

[VERIFIED: codebase grep] The following already exist and are used directly:

| Library | Version | Purpose in Phase 16 |
|---------|---------|---------------------|
| TypeScript 5 | 5.x | Type-safe `CensoredProfile` and `FullProfile` union; `censorProfile()` return type |
| Jest 29 | 29.x | Unit tests for `censorProfile()` pure function; extend existing `get-ranking.use-case.test.ts` |
| Zod | already installed | No new schema needed; route params unchanged |

**Installation:** None required.

---

## Architecture Patterns

### System Architecture Diagram

```
Recruiter HTTP Request
  GET /jobs/:jobId/ranking
        |
        v
  [swipe.routes.ts]  (authenticate + requireRole('RECRUITER'))
        |
        v
  [SwipeController.getRanking()]
        |
        v
  [GetRankingUseCase.execute(userId, jobId)]
        |
        +-- repo.findRecruiterProfileByUserId()  -> ownership check
        +-- repo.findJobById()                   -> job (requiredSkills[])
        +-- repo.findSwipesByJobId()             -> swipes (candidate.skills[])
        +-- repo.findUnlocksByJobAndCompany()    -> Set<candidateId>
        +-- rec.computeFitScore()                -> number (per swipe)
        |
        v
  [censorProfile(swipe, job, fitScore, isUnlocked)]   <-- NEW pure function
        |
        +-- direction === 'LIKE'          -> FullProfile (all fields)
        +-- direction === 'DISLIKE' + unlocked -> FullProfile (all fields)
        +-- direction === 'DISLIKE' + locked  -> CensoredProfile
              matchingSkills: intersection(candidate.skills, job.requiredSkills)
              fitReasons: buildFitReasons(candidate, job, fitScore)
              name: null, avatarUrl: null, bio: null, lat: null, lng: null
        |
        v
  RankingItem[]  (sorted by fitScore DESC, ranked)
        |
        v
  [SCALE-02 cache write]  ranking:${jobId}  TTL 30s
        |
        v
  HTTP 200 JSON response
```

### Recommended Project Structure

No new directories needed. All changes are in existing locations:

```
src/
  application/
    use-cases/
      swipe/
        get-ranking.use-case.ts      # extend: add censorProfile() function
tests/
  unit/
    get-ranking.use-case.test.ts     # extend: add tests for censorProfile() states
src/
  infrastructure/
    http/
      routes/
        swipe.routes.ts              # update: RankingItem type (new preview fields)
```

### Pattern 1: censorProfile() Pure Function

**What:** A pure function that takes the swipe, job, fitScore, and unlock state, and returns either a FullProfile or CensoredProfile. It is the single, auditable code path for all reveal decisions.

**When to use:** Called once per candidate inside the `Promise.all` map in `GetRankingUseCase.execute`.

**Type definitions (NEW):**

```typescript
// Source: [VERIFIED: codebase inspection of get-ranking.use-case.ts + domain interfaces]

export interface CensoredProfile {
  // Identity — always null for censored candidates (REC-03)
  name: null
  avatarUrl: null
  bio: null
  // Non-identity preview fields (REC-01, REC-02)
  matchingSkills: string[]
  fitReasons: string[]
}

export interface FullProfile {
  name: string
  avatarUrl: string | null
  bio: string | null
  skills: string[]
  professionId: string
  preferredModalities: string[]
  salaryExpectation: number | null
}

export type RankingProfile = FullProfile | CensoredProfile | null
```

Note: `null` profile is no longer the correct output for DISLIKE-locked candidates after Phase 16; they receive `CensoredProfile` instead. The `null` case is eliminated.

**censorProfile function signature:**

```typescript
// Source: [VERIFIED: derived from get-ranking.use-case.ts lines 70-82]
function censorProfile(
  swipe: SwipeWithCandidateInfo,
  job: Job,
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

### Pattern 2: buildFitReasons() Pure Function

**What:** Generates human-readable fit reason strings. Called only for censored (DISLIKE-locked) candidates.

**Input availability:** All fields needed are in scope inside `GetRankingUseCase.execute` at the point `censorProfile` is called — `swipe.candidate` carries `salaryExpectation`, `skills`, `professionId`; `job` carries `salaryMin`, `salaryMax`, `requiredSkills`, `professionId`.

**Example output format (from ROADMAP):**
- `"4/6 skills match"` — e.g., `${matchingSkills.length}/${job.requiredSkills.length} skills match`
- `"salary outside range"` or `"salary in range"` — compare salaryExpectation to salaryMin/salaryMax
- `"profession match"` or `"different profession"` — compare professionId strings

**Implementation sketch:**

```typescript
// Source: [VERIFIED: derived from ROADMAP Phase 16 success criteria + domain entity fields]
function buildFitReasons(
  candidate: CandidateProfile & { avatarUrl: string | null },
  job: Job,
  matchingSkills: string[],
): string[] {
  const reasons: string[] = []

  // Skill reason (REC-02 example: "4/6 skills match")
  reasons.push(`${matchingSkills.length}/${job.requiredSkills.length} skills match`)

  // Salary reason
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

### Pattern 3: Cache Compatibility

**Critical:** `GetRankingUseCase` writes the result to `cache.set('ranking:${jobId}', JSON.stringify(result), 30)`. After Phase 16, the result items will have `profile: CensoredProfile` instead of `profile: null` for DISLIKE-locked candidates. This is automatically handled — `JSON.stringify` serializes the new shape correctly. No cache invalidation changes needed.

**However:** Existing cached entries from before Phase 16 will have `profile: null` for DISLIKE-locked candidates. These will expire within 30 seconds (TTL), so no migration is needed.

### Anti-Patterns to Avoid

- **Inline censoring in the map callback:** Repeating the LIKE/DISLIKE/unlocked decision in the Promise.all map body rather than delegating to `censorProfile()`. Violates Success Criterion 4 (single code path).
- **Computing matching skills in the repository:** `matchingSkills` is an intersection of two in-memory arrays. It does not require a DB query. Pushing this to the repository layer violates Clean Architecture (repository should not contain presentation logic).
- **Partial identity leakage:** Returning `skills: swipe.candidate.skills` instead of `matchingSkills` for censored candidates. The skills array on the full profile includes all skills; the censored preview must include ONLY the intersection.
- **Adding `email` or `location` to CensoredProfile:** The `CandidateProfile` domain entity has no `email` field (userId links to User which has email, but the profile itself does not expose it). Location (`lat`/`lng`) is excluded from FullProfile already (line 80 comment in current get-ranking.use-case.ts: "lat/lng intentionally excluded — location privacy"). CensoredProfile must not introduce them.
- **Caching before Phase 16 changes are applied to the cache key:** The cache TTL is 30s. No special invalidation needed for the schema change. Do not add a `cacheVersion` parameter — overkill for a 30s TTL.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill intersection | Custom set intersection utility | `array.filter(s => otherArray.includes(s))` | Arrays are small (< 50 skills); O(n²) is negligible; no utility library needed |
| Fit reason i18n | Translation layer | Plain English strings | MVP; no i18n requirement in REQUIREMENTS.md |
| Profile union type discrimination | Runtime type guard functions | TypeScript union `FullProfile \| CensoredProfile` with explicit nullable fields | Structural typing is sufficient; discriminated union by checking `'matchingSkills' in profile` if needed downstream |

---

## Common Pitfalls

### Pitfall 1: matchingSkills uses candidate.skills, not job.requiredSkills
**What goes wrong:** Computing the intersection in the wrong direction — filtering `job.requiredSkills` by `candidate.skills` vs filtering `candidate.skills` by `job.requiredSkills` — produces the same intersection for a pure intersection. But the semantic is "which of the candidate's skills appear in this job's requirements," so filtering candidate.skills is the correct mental model.
**Why it happens:** Both directions produce the same set for pure intersection, but the variable is named `matchingSkills` and belongs conceptually to the candidate, so start from `candidate.skills`.
**How to avoid:** `candidate.skills.filter(s => job.requiredSkills.includes(s))` — keeps the candidate perspective.

### Pitfall 2: CensoredProfile shape changes the RankingItem type contract
**What goes wrong:** The RankingItem type exported from `swipe.routes.ts` or defined in `job.routes.ts` (Decision 04-04) currently has `profile: {...} | null`. After Phase 16, the profile field is `FullProfile | CensoredProfile`. If the type is not updated, TypeScript compilation will fail, or the type will be `any`.
**Why it happens:** The type was defined in Phase 4/6 as a simple union with null and never updated.
**How to avoid:** Update `RankingItem` type in `swipe.routes.ts` to use the new union. Confirm `tsc --noEmit` passes after the change.

### Pitfall 3: Cache invalidation on shape change
**What goes wrong:** A recruiter hits the cached ranking (30s TTL) and gets the old `profile: null` shape from before Phase 16 was deployed. The client receives inconsistent shapes in the same session.
**Why it happens:** Cache TTL is 30 seconds. Between deploy and TTL expiry, old data is served.
**How to avoid:** 30-second TTL makes this a non-issue in practice. Do not add complexity. Document it as an accepted trade-off in the code comment.

### Pitfall 4: Unit tests mock the result of censorProfile instead of testing it
**What goes wrong:** Tests only verify that GetRankingUseCase returns a certain structure, but `censorProfile()` itself is not tested with edge cases (0 matching skills, all skills match, no job salary defined).
**Why it happens:** TDD shortcut — testing the use case output without isolating the pure function.
**How to avoid:** Because `censorProfile()` is a pure function, it can and MUST be tested directly with zero mocks per CLAUDE.md TDD rules.

### Pitfall 5: fitReasons format not agreed before coding
**What goes wrong:** String formats like `"4 of 6 skills match"` vs `"4/6 skills match"` are debated during code review because they were not specified upfront.
**Why it happens:** Free-text strings with no canonical format.
**How to avoid:** Lock the format strings in the plan. Use the ROADMAP examples as canonical: `"4/6 skills match"`, `"salary outside range"`, `"salary in range"`. These are not user-facing UI strings, just API payloads — simple is fine.

---

## Code Examples

### Current censoring logic (to be replaced by censorProfile())

```typescript
// Source: [VERIFIED: src/application/use-cases/swipe/get-ranking.use-case.ts lines 69-82]
// Current implementation — profile: null for DISLIKE-locked candidates
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
```

After Phase 16, this inline block becomes `censorProfile(swipe, job, unlockedCandidateIds.has(swipe.candidateId))`.

### Existing unit test factory pattern (extend, don't rewrite)

```typescript
// Source: [VERIFIED: tests/unit/get-ranking.use-case.test.ts]
// The 4 existing tests cover: cache HIT, cache MISS, FORBIDDEN, NOT_FOUND.
// Phase 16 adds tests for the 3 candidate states:
//   - direction='LIKE' → FullProfile (name not null)
//   - direction='DISLIKE' + unlocked → FullProfile (name not null)
//   - direction='DISLIKE' + locked → CensoredProfile (name null, matchingSkills, fitReasons)

// The existing makeSwipeRepo / makeRecRepo / makeCache factories are reused.
// The existing candidateProfile and jobItem fixtures are reused.
```

### Skill intersection — simple array filter

```typescript
// Source: [ASSUMED — standard JS pattern, no library needed]
const matchingSkills = swipe.candidate.skills.filter(
  (skill) => job.requiredSkills.includes(skill),
)
```

Note: Both `CandidateProfile.skills` and `Job.requiredSkills` are `String[]` (PostgreSQL text arrays, mapped to TypeScript `string[]`). [VERIFIED: prisma/schema.prisma lines 71 and 129]

---

## State of the Art

| Old Approach | Current Approach | Phase | Impact |
|--------------|------------------|-------|--------|
| `profile: null` for DISLIKE-locked | `profile: CensoredProfile` with preview fields | Phase 16 | Recruiter gets actionable skill preview without identity exposure |
| Inline ternary in map callback | `censorProfile()` pure function | Phase 16 | Single auditable code path; fully testable in isolation |

**No deprecated approaches in this phase.** This is a forward-only extension.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `buildFitReasons()` output format (`"4/6 skills match"`, `"salary outside range"`) matches what the frontend/recruiter expects | Architecture Patterns | Low — these are API payload strings, not UI text; easy to change later |
| A2 | `CandidateProfile` does not expose `email` — only `User` does | Don't Hand-Roll | Low — confirmed from `candidate.entity.ts` (VERIFIED: no email field); User is a separate entity |
| A3 | The `FullProfile` shape in the REVEALED branch should remain identical to the current implementation — no new fields added in this phase | Architecture Patterns | Low — adding fields is backward compatible; the plan can always add them |
| A4 | Phase 15 integration tests (Docker-dependent) do not need to be updated for Phase 16 because the cache key and TTL are unchanged | Common Pitfalls | Low — cache shape changes but TTL/key unchanged; integration tests check cache HIT identity, which still holds for LIKE candidates |

**All claims tagged ASSUMED above are low risk.** All factual claims about the current codebase are VERIFIED by direct source inspection.

---

## Open Questions

1. **fitReasons strings — match exactly vs contain?**
   - What we know: ROADMAP says `"4/6 skills match"`, `"salary outside range"` as examples
   - What's unclear: Are these exact strings locked, or just examples? Is the recruiter UI displaying these verbatim?
   - Recommendation: Lock the strings in the plan as the canonical format. They are easy to change in a single function if a future phase needs different wording.

2. **CensoredProfile — should it include `professionId`?**
   - What we know: REC-01 says "only skills"; REC-03 says name/email/photo/location are null. Profession is not identity (it's a category string like "backend-dev").
   - What's unclear: Is `professionId` considered identity information in this context?
   - Recommendation: Exclude `professionId` from CensoredProfile for Phase 16 (conservative). It can be added in a follow-on if recruiters need it. This matches the ROADMAP success criteria which mention only `matchingSkills[]` and `fitReasons[]` for censored candidates.

3. **Phase 16 CONTEXT.md absent — no locked decisions from user**
   - What we know: No CONTEXT.md exists for Phase 16. The ROADMAP is the authoritative spec.
   - What's unclear: Nothing — ROADMAP success criteria are detailed enough to plan without a discussion phase.
   - Recommendation: Proceed directly to planning. All decisions are derivable from ROADMAP + codebase inspection.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 16 is a pure code/logic change. No new external dependencies. Existing Node.js, TypeScript, Jest, Prisma, Redis, Neo4j infrastructure is unchanged.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 |
| Config file | `jest.config.ts` (project root) |
| Quick run command | `npx jest tests/unit/get-ranking.use-case.test.ts --no-coverage` |
| Full suite command | `npx jest tests/unit --runInBand --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | DISLIKE-locked candidate returns `matchingSkills[]` containing only shared skills | unit | `npx jest tests/unit/get-ranking.use-case.test.ts -t "DISLIKE locked" --no-coverage` | ❌ Wave 0 |
| REC-02 | DISLIKE-locked candidate returns `fitReasons[]` with skill count and salary reasons | unit | `npx jest tests/unit/get-ranking.use-case.test.ts -t "fitReasons" --no-coverage` | ❌ Wave 0 |
| REC-03 | DISLIKE-locked candidate profile has `name: null`, `avatarUrl: null`, `bio: null` | unit | `npx jest tests/unit/get-ranking.use-case.test.ts -t "censored" --no-coverage` | ❌ Wave 0 |
| REC-03 | LIKE candidate profile reveals name/avatarUrl (no regression) | unit | `npx jest tests/unit/get-ranking.use-case.test.ts -t "LIKE" --no-coverage` | extends existing |
| REC-03 | DISLIKE + unlocked candidate profile reveals name/avatarUrl | unit | `npx jest tests/unit/get-ranking.use-case.test.ts -t "unlocked" --no-coverage` | ❌ Wave 0 |
| REC-01 | `censorProfile()` pure function — 0 matching skills returns empty array | unit | `npx jest tests/unit/get-ranking.use-case.test.ts -t "censorProfile" --no-coverage` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx jest tests/unit/get-ranking.use-case.test.ts --no-coverage`
- **Per wave merge:** `npx jest tests/unit --runInBand --no-coverage`
- **Phase gate:** Full unit suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Add 5+ new test cases to `tests/unit/get-ranking.use-case.test.ts` covering: DISLIKE-locked, DISLIKE-unlocked, censorProfile direct unit tests, fitReasons format, 0-match edge case
- [ ] No new test files required — extend existing file

*(No new framework install needed — Jest 29 already configured)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | JWT already in place; no auth changes |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | censorProfile() enforces data minimization; `requireRole('RECRUITER')` already on route |
| V5 Input Validation | no | No new inputs; jobId already validated via Zod UUID |
| V6 Cryptography | no | No crypto changes |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Partial identity leakage via preview fields | Information Disclosure | censorProfile() pure function as single code path; unit tests assert each identity field is null for censored state; no `email` or `location` fields added |
| Cache serving pre-Phase-16 null profile | Information Disclosure | 30s TTL ensures stale entries expire quickly; documented as accepted trade-off; no data breach risk since old entries are MORE restrictive (null vs preview) |
| IDOR — recruiter viewing another recruiter's job ranking | Elevation of Privilege | Already mitigated in GetRankingUseCase line 23-25: `job.recruiterId !== recruiterProfile.id` check; Phase 16 does not change this guard |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: codebase] `src/application/use-cases/swipe/get-ranking.use-case.ts` — current censoring logic, cache pattern, all field names
- [VERIFIED: codebase] `src/domain/interfaces/swipe.repository.interface.ts` — SwipeWithCandidateInfo shape
- [VERIFIED: codebase] `src/domain/entities/candidate.entity.ts` — CandidateProfile fields (skills: string[], no email)
- [VERIFIED: codebase] `src/domain/entities/job.entity.ts` — Job fields (requiredSkills: string[])
- [VERIFIED: codebase] `prisma/schema.prisma` — CandidateProfile.skills: String[], Job.requiredSkills: String[]
- [VERIFIED: codebase] `tests/unit/get-ranking.use-case.test.ts` — existing test structure and factories
- [VERIFIED: codebase] `tests/helpers/factories.ts` — integration test factory patterns
- [VERIFIED: .planning] ROADMAP.md Phase 16 success criteria
- [VERIFIED: .planning] REQUIREMENTS.md REC-01, REC-02, REC-03
- [VERIFIED: .planning] STATE.md Decision 12-03 (censoring history)
- [VERIFIED: .planning] 15-VERIFICATION.md — Phase 15 artifacts and cache wiring confirmed

### Secondary (MEDIUM confidence)

- [ASSUMED] fitReasons string format is not locked in any spec document — derived from ROADMAP examples

---

## Metadata

**Confidence breakdown:**
- Current codebase shape: HIGH — direct file inspection
- Required changes: HIGH — unambiguous from success criteria + code reading
- fitReasons string format: MEDIUM — ROADMAP gives examples, not a locked spec
- No integration test changes needed: HIGH — cache key/TTL unchanged

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (stable domain; no external dependency changes expected)

## Project Constraints (from CLAUDE.md)

All of the following are directly relevant to Phase 16:

| Directive | Impact on Phase 16 |
|-----------|-------------------|
| Clean Architecture: routes → service → repository, no layer skipping | `censorProfile()` belongs in the application use case layer, not in the controller or repository |
| SOLID: SRP per class/function | `censorProfile()` and `buildFitReasons()` are separate pure functions with distinct responsibilities |
| Modules isolated: modules must not import directly from other modules | No new cross-module imports; all inputs to `censorProfile()` come from types already in scope |
| Inputs validated with Zod on all endpoints | No new endpoints; existing Zod validation on jobId UUID unchanged |
| TDD mandatory: test first, then implementation | Wave 0 writes RED unit tests for all 3 candidate states before touching use case |
| Unit tests in `tests/unit/` — per service, no DB | `censorProfile()` is a pure function; all new tests are DB-free unit tests |
| Integration tests in `tests/integration/` — against real DB (no mocks) | No new integration tests required; existing cache integration tests in swipe.test.ts are not affected by the profile shape change for the LIKE-candidate test |
