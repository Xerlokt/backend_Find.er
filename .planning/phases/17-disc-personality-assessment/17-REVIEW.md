---
phase: 17-disc-personality-assessment
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - prisma/migrations/20260529000000_add_disc_result_and_job_disc_profile/migration.sql
  - prisma/schema.prisma
  - src/adapters/controllers/disc.controller.ts
  - src/adapters/controllers/job.controller.ts
  - src/adapters/repositories/disc.repository.ts
  - src/adapters/repositories/job.repository.ts
  - src/adapters/repositories/swipe.repository.ts
  - src/adapters/services/recommendation.repository.ts
  - src/app.ts
  - src/application/use-cases/disc/disc-questions.ts
  - src/application/use-cases/disc/get-disc.use-case.ts
  - src/application/use-cases/disc/submit-disc.use-case.ts
  - src/application/use-cases/swipe/get-ranking.use-case.ts
  - src/domain/entities/disc-result.entity.ts
  - src/domain/entities/job.entity.ts
  - src/domain/interfaces/disc.repository.interface.ts
  - src/domain/interfaces/recommendation.repository.interface.ts
  - src/domain/interfaces/swipe.repository.interface.ts
  - src/infrastructure/http/routes/disc.routes.ts
  - tests/helpers/setup.ts
  - tests/integration/disc.test.ts
  - tests/unit/disc.use-cases.test.ts
  - tests/unit/get-ranking.use-case.test.ts
  - tests/unit/recommendation.service.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 17 introduces the DISC personality assessment feature across four layers: migration, schema, use cases, controller/routes, repository, scoring integration, and tests. The overall implementation is solid. The IDOR ownership check is correctly implemented in both `SubmitDiscUseCase` and `GetDiscUseCase`. The DISC scoring algorithm is correct including tie-break priority D > I > S > C. The weight redistribution math (`w = 0.9`) produces exactly 100 on perfect match with DISC and 90 on mismatch, verified by calculation. Clean Architecture compliance holds — no Prisma imports appear in application or domain layers. The integration tests cover the critical IDOR path for POST, and the unit tests cover the core FORBIDDEN scenarios.

Three info-level findings are reported: a missing unchecked `as` cast, two missing tie-break unit test cases (I > S and S > C), and a missing integration-level IDOR test for GET. One warning is reported: the dominant value stored in the database is not validated on read, so a corrupt DB value would bypass the `DiscDimension` type contract silently at the `getDisc` endpoint.

---

## Warnings

### WR-01: `dominant` cast without runtime validation in `GetDiscUseCase`

**File:** `src/application/use-cases/disc/get-disc.use-case.ts:22`

**Issue:** The use case reads `result.dominant` from the repository (ultimately from the database) and immediately casts it `as DiscDimension` without checking that the value is one of `'D' | 'I' | 'S' | 'C'`. If the database ever contains a corrupted or legacy value for `dominant`, the API will silently return that value as if it were a valid `DiscDimension`. The write path (`SubmitDiscUseCase`) is safe because the scoring algorithm only ever produces `'D' | 'I' | 'S' | 'C'`. However, the read path has no guard.

**Fix:** Add a runtime validation before the cast. A simple guard is sufficient:

```typescript
const DISC_DIMENSIONS: readonly string[] = ['D', 'I', 'S', 'C']

async execute(userId: string, candidateId: string): Promise<{ dominant: DiscDimension }> {
  const profile = await this.candidateRepo.findByUserId(userId)
  if (!profile || profile.id !== candidateId) {
    throw new DomainError('Forbidden', 'FORBIDDEN', 403)
  }

  const result = await this.discRepo.findByCandidateId(candidateId)
  if (!result) throw new DomainError('DISC result not found', 'NOT_FOUND', 404)

  if (!DISC_DIMENSIONS.includes(result.dominant)) {
    throw new DomainError('Invalid DISC result in database', 'INTERNAL_ERROR', 500)
  }

  return { dominant: result.dominant as DiscDimension }
}
```

---

## Info

### IN-01: Missing tie-break unit test cases for I > S and S > C

**File:** `tests/unit/disc.use-cases.test.ts:67-84`

**Issue:** Only the `D > I` tie-break is tested (equal scores D=2, I=2). The tie-break chain `D > I > S > C` has three decision points. The `I > S` tie-break (e.g., answers `['I', 'I', 'S', 'S']`) and the `S > C` tie-break (e.g., answers `['S', 'S', 'C', 'C']`) are not covered. While the implementation is correct (a simple `if/else if` chain), missing test cases mean a future refactor could silently break the lower tie-break levels.

**Fix:** Add two additional test cases to the `SubmitDiscUseCase` describe block:

```typescript
it('tie-break I>S — I=2, S=2 → dominant I (D-03)', async () => {
  // answers: ['I', 'I', 'S', 'S']
  // expected upsert call: { scoreD:0, scoreI:2, scoreS:2, scoreC:0, dominant:'I' }
})

it('tie-break S>C — S=2, C=2 → dominant S (D-03)', async () => {
  // answers: ['S', 'S', 'C', 'C']
  // expected upsert call: { scoreD:0, scoreI:0, scoreS:2, scoreC:2, dominant:'S' }
})
```

---

### IN-02: Missing integration-level IDOR test for GET `/candidates/:id/disc`

**File:** `tests/integration/disc.test.ts`

**Issue:** The integration test suite includes an IDOR test for `POST /candidates/:id/disc` (line 173) but there is no corresponding integration test for `GET /candidates/:id/disc`. The unit test at `tests/unit/disc.use-cases.test.ts:151` covers the `GetDiscUseCase` FORBIDDEN case, but an integration test would verify the full HTTP path including the authenticate/requireRole hooks and controller wiring.

**Fix:** Add an integration test after the existing IDOR test:

```typescript
it('403 — candidate cannot GET DISC for another candidateId', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()

  const { token } = await setupCandidate(app)
  const { candidateId: otherCandidateId } = await setupCandidate(app)

  const response = await supertest(app.server)
    .get(`/candidates/${otherCandidateId}/disc`)
    .set('Authorization', `Bearer ${token}`)

  expect(response.status).toBe(403)
  await app.close()
})
```

---

### IN-03: Use cases instantiated per-request inside controller handlers

**File:** `src/adapters/controllers/disc.controller.ts:22,37`

**Issue:** `SubmitDiscUseCase` and `GetDiscUseCase` (along with their repository dependencies `DiscRepository` and `CandidateRepository`) are constructed inside each handler call rather than in the controller constructor or injected via DI. This means object allocation on every request. This is the existing pattern across all controllers in the codebase (`job.controller.ts` lines 51, 68, 83, 99, 119 do the same), so this is not a regression introduced in phase 17. It is noted here for completeness since the DISC controller is new code where the pattern could be improved at zero risk.

**Fix:** Move dependencies to constructor injection (deferred to a future refactor phase, consistent with other controllers):

```typescript
export class DiscController {
  private readonly submitUseCase: SubmitDiscUseCase
  private readonly getUseCase: GetDiscUseCase

  constructor() {
    const discRepo = new DiscRepository()
    const candidateRepo = new CandidateRepository()
    this.submitUseCase = new SubmitDiscUseCase(discRepo, candidateRepo)
    this.getUseCase = new GetDiscUseCase(discRepo, candidateRepo)
  }
  // ...
}
```

---

## Findings Detail

### Security (IDOR ownership check)

The IDOR protection pattern is correct and verified. Both `SubmitDiscUseCase` and `GetDiscUseCase` call `candidateRepo.findByUserId(userId)` with the JWT subject, then compare `profile.id !== candidateId` (the URL parameter). If the profile is `null` (user has no candidate profile) or the IDs don't match, a 403 FORBIDDEN is thrown. The integration test at `disc.test.ts:173-188` confirms this end-to-end for POST.

### Logic (DISC scoring algorithm)

The scoring is correct. For 4 answers each being one of `D/I/S/C`, `Math.max(scoreD, scoreI, scoreS, scoreC)` is always >= 1 (since Zod enforces `length(4)`). The tie-break chain `if scoreD === max → D; else if scoreI === max → I; else if scoreS === max → S; else → C` implements D > I > S > C correctly. Verified manually for all relevant tie cases.

### Math (computeFitScore weight redistribution)

Verified numerically:
- `w = 0.9`, all factors 1.0, DISC match: `(0.30+0.35+0.20+0.10+0.05) * 0.9 * 100 + 0.10 * 100 = 90 + 10 = 100`. Correct.
- `w = 0.9`, all factors 1.0, DISC mismatch: `0.9 * 100 + 0 = 90`. Correct.
- `w = 1.0`, no discProfile, all factors 1.0: `1.0 * 100 + 0.0 * 0.10 * 100 = 100`. Correct.

The floating-point sum `0.30+0.35+0.20+0.10+0.05 = 0.9999...` produces 100 after `Math.round()`, so no precision bug exists in practice.

The `undefined != null` coercion for `candidate.discDominant` is safe: `undefined == null` is `true` in JavaScript, so `undefined != null` is `false`, treating an absent `discDominant` identically to `null` — discScore becomes 0.0 correctly.

### Architecture (Clean Architecture compliance)

Checked all changed files:
- Application layer (`submit-disc.use-case.ts`, `get-disc.use-case.ts`, `get-ranking.use-case.ts`): no Prisma imports. Compliant.
- Domain layer (`disc-result.entity.ts`, `job.entity.ts`, interfaces): no Prisma imports. Compliant.
- Adapter layer (`disc.repository.ts`, `job.repository.ts`, `swipe.repository.ts`, `recommendation.repository.ts`): Prisma imported correctly at the adapter boundary.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
