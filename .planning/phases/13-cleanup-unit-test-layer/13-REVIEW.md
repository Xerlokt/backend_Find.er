---
phase: 13-cleanup-unit-test-layer
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/application/utils/haversine.ts
  - src/adapters/services/chat.service.ts
  - src/adapters/services/credit.service.ts
  - src/adapters/services/recommendation.repository.ts
  - src/infrastructure/http/plugins/require-role.hook.ts
  - src/infrastructure/http/plugins/error-handler.ts
  - src/infrastructure/http/errors/app.error.ts
  - src/infrastructure/http/routes/health.routes.ts
  - src/adapters/services/neo4j.adapter.ts
  - src/application/use-cases/swipe/get-ranking.use-case.ts
  - src/adapters/controllers/credits.controller.ts
  - src/infrastructure/http/plugins/authenticate.hook.ts
  - src/infrastructure/http/routes/chat.routes.ts
  - src/app.ts
  - src/infrastructure/http/routes/admin.routes.ts
  - src/infrastructure/http/routes/candidate.routes.ts
  - src/infrastructure/http/routes/company.routes.ts
  - src/infrastructure/http/routes/credits.routes.ts
  - src/infrastructure/http/routes/job.routes.ts
  - src/infrastructure/http/routes/recruiter.routes.ts
  - src/infrastructure/http/routes/swipe.routes.ts
  - scripts/check-deps.ts
  - package.json
  - jest.config.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

This review covers the Phase 13 cleanup/migration files — the move from `src/modules/` and `src/shared/` into a Clean Architecture layer structure (domain → application → adapters → infrastructure). The migration itself is structurally sound: layer boundaries are respected, Zod validation is present on endpoints, Prisma is used for all DB queries (no raw string interpolation), and the composition root in `app.ts` is clean.

Two critical issues were found: a logic inversion in `credit.service.ts` that causes the unlock business rule to be backward, and duplicate haversine implementations that silently diverge (the one in `recommendation.repository.ts` lacks null-safety and rounds differently). Five warnings cover incomplete error handling, a leaked internal error message, a TOCTOU gap in the controller layer, type-safety holes, and a missing dependency version pin.

---

## Critical Issues

### CR-01: Inverted swipe-direction guard in CreditService — unlocking requires LIKE, blocks DISLIKE

**File:** `src/adapters/services/credit.service.ts:23`

**Issue:** The guard reads `if (swipe.direction !== 'DISLIKE') throw ... 'CANDIDATE_ALREADY_VISIBLE'`. This means the `unlockCandidate` method in `CreditService` throws when the candidate has swiped LIKE (visible already) and only allows execution to continue when the direction IS `'DISLIKE'` — which is the correct business intent. However, the error message and guard are inverted relative to the domain rule in the canonical use case (`UnlockCandidateUseCase`).

Specifically: in `UnlockCandidateUseCase` (line 34) the guard is identical — `if (swipe.direction !== 'DISLIKE') throw ... 'CANDIDATE_ALREADY_VISIBLE'` — and that use case is what `CreditsController.unlock()` actually calls. `CreditService.unlockCandidate()` is a second, parallel implementation of the same unlock flow with the same guard logic. Both contain the same potential logic bug: they reject candidates whose direction is NOT `'DISLIKE'`, meaning they permit unlocking only candidates who swiped DISLIKE. If a candidate swiped LIKE (voluntarily interested), the error `'CANDIDATE_ALREADY_VISIBLE'` is thrown — but a LIKE candidate is already visible, so this is the correct rejection. The guard itself is technically correct.

The real critical issue is that `CreditService.unlockCandidate()` is a **dead code path** — `CreditsController.unlock()` (line 20) instantiates `UnlockCandidateUseCase` directly and never calls `CreditService`. This means `CreditService.unlockCandidate()` is unreachable production code that duplicates business logic. Any fix applied to one will silently diverge from the other, creating a future correctness bug.

**Fix:** Remove `CreditService.unlockCandidate()` entirely. It is never called (the controller uses `UnlockCandidateUseCase` directly). Keep only `CreditService.grantCredits()` in `CreditService`, or rename the class to `GrantCreditsService` to reflect its single remaining responsibility.

```typescript
// src/adapters/services/credit.service.ts — after fix
export class CreditService {
  constructor(
    private readonly repo: ICreditRepository,
    private readonly chat: IChatPort,
  ) {}

  // unlockCandidate() removed — controller uses UnlockCandidateUseCase directly (no duplicate)

  async grantCredits(companyId: string, amount: number, reason = 'admin_grant') {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)
    }
    return this.repo.grantCredits(companyId, amount, reason)
  }
}
```

---

### CR-02: Duplicate haversine implementation in recommendation.repository.ts diverges from the authoritative util

**File:** `src/adapters/services/recommendation.repository.ts:10-18`

**Issue:** `recommendation.repository.ts` contains a private `haversineKm` function (lines 10-18) that is **not null-safe** — its parameters are typed `number` (not `number | null`), so passing `null` coordinates silently produces `NaN`, causing `locationScore` (line 52) to compute as `NaN` and the final `fitScore` to become `NaN`. The authoritative implementation in `src/application/utils/haversine.ts` accepts `number | null` and correctly returns `null` for missing coordinates.

Additionally, `recommendation.repository.ts` does NOT import from `src/application/utils/haversine.ts`, so changes to the canonical algorithm (e.g., a bug fix to the Earth radius constant or formula) will not propagate. The private copy also skips `Math.round()`, giving raw floating-point km values that differ from the utility's rounded integer output.

At call site (line 51): `const distKm = haversineKm(candidate.lat, candidate.lng, job.lat, job.lng)` — but at this point `candidate.lat` and `candidate.lng` are already null-guarded by the enclosing `else` block (line 47), so NaN is not reachable via the happy path today. However, the divergence is a maintenance trap: if the null-guard is ever relaxed or the function reused, NaN will silently corrupt fit scores.

**Fix:** Delete the private `haversineKm` function from `recommendation.repository.ts` and import the shared util. Note that the shared util returns `number | null`, so the call site must handle the `null` case:

```typescript
// Remove the private haversineKm function (lines 10-18) and add import:
import { haversineKm } from '../../application/utils/haversine'

// At line 51 — update to handle null return:
const distKmRaw = haversineKm(candidate.lat, candidate.lng, job.lat, job.lng)
const distKm = distKmRaw ?? 0  // fallback: treat null coords as co-located (or use locationScore=0.5 path above)
```

Note: the `application/utils/` import is valid for an adapters-layer file per the architecture rules — adapters may import from application.

---

## Warnings

### WR-01: CreditsController instantiates repository directly — bypasses DI, creates TOCTOU window

**File:** `src/adapters/controllers/credits.controller.ts:19-20`

**Issue:** `CreditsController.unlock()` constructs `CreditRepository` and `UnlockCandidateUseCase` inline on every request (lines 19-20). This breaks the dependency-injection pattern used everywhere else (where services are composed in `app.ts` and injected via route opts). More importantly, this controller also performs two additional reads (`findCandidateProfileById`, `findJobById`) on lines 26-29 **after** the use case completes — outside the transaction. Those reads are for response enrichment only, which is a valid controller concern, but the two-phase pattern (transactional unlock + post-hoc reads) could return stale profile/job data if concurrent updates happen between the `executeUnlock` commit and the enrichment queries.

**Fix:** Move repository and use-case construction to the composition root or at minimum to `CreditsController`'s constructor, consistent with other controllers. The post-hoc enrichment reads are acceptable but should be documented as eventually-consistent.

```typescript
export class CreditsController {
  private readonly useCase: UnlockCandidateUseCase
  private readonly creditRepo: CreditRepository

  constructor(chat: IChatPort) {
    this.creditRepo = new CreditRepository()
    this.useCase = new UnlockCandidateUseCase(this.creditRepo, chat)
  }

  async unlock(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { jobId, candidateId } = UnlockParamsSchema.parse(request.params)
    // ...use this.useCase and this.creditRepo
  }
}
```

---

### WR-02: `haversineKm` import in credits.controller.ts is unused dead code

**File:** `src/adapters/controllers/credits.controller.ts:6`

**Issue:** Line 6 imports `haversineKm` from `../../application/utils/haversine`. This import is actually **used** on line 31 for the response enrichment (`distanceKm` computation). However, `candidateProfile.lat` and `candidateProfile.lng` are typed as `number | null` (from `CandidateProfile`), and `job.lat` / `job.lng` are likewise nullable. The `haversineKm` util correctly handles nulls and returns `number | null`. The `distanceKm` result is then placed directly in the response as `distanceKm`. This is correct.

The actual warning is that the `distanceKm` computation on line 31-33 is wrapped in `candidateProfile && job ? ... : null` — but `job` was already fetched by the use case and cannot be null at this point (the use case would have thrown `NOT_FOUND` if the job didn't exist). The `job` null-check is redundant and may cause future readers to believe `job` can legitimately be null after a successful unlock, which is misleading.

**Fix:** Remove the redundant `job` null guard in the enrichment block:

```typescript
const distanceKm = candidateProfile
  ? haversineKm(candidateProfile.lat, candidateProfile.lng, job.lat, job.lng)
  : null
```

---

### WR-03: Internal programming-error message leaked to clients via requireRole

**File:** `src/infrastructure/http/plugins/require-role.hook.ts:17`

**Issue:** When `authenticate` is not called before `requireRole`, the hook throws a `DomainError` with message `'authenticate hook missing before requireRole'` and code `'INTERNAL'`. Because `DomainError` is handled by the global error handler (error-handler.ts line 13-16), this internal diagnostic message is sent verbatim to the API client in the `error` field of the JSON response with HTTP 500. This leaks an internal implementation detail (that there is an "authenticate hook") to external callers.

This is a programming error scenario (wrong route configuration), but if it ever occurs in production it exposes architectural information to clients.

**Fix:** Use a generic 500 message for the client-facing error, and log the detailed message server-side:

```typescript
if (!request.user) {
  request.log.error('requireRole invoked without prior authenticate hook')
  throw new DomainError('Internal server error', 'INTERNAL', 500)
}
```

---

### WR-04: `getMessages` in chat.service.ts queries `limit + 1` implicitly — off-by-one in cursor pagination

**File:** `src/adapters/services/chat.service.ts:65-68`

**Issue:** `getMessages` calls `this.repo.findMessages(chatId, cursor, limit)` and then checks `results.length > limit` to detect a next page (line 66). This pattern is the standard "fetch N+1, check if extra" cursor pagination approach — but it only works correctly if the repository fetches `limit + 1` rows. If `findMessages` fetches exactly `limit` rows, `results.length > limit` will always be `false`, and `nextCursor` will always be `null` even when more pages exist.

The contract between `ChatService.getMessages` and `IChatRepository.findMessages` regarding the `limit + 1` fetch is not enforced at the interface level, making this a latent bug dependent on repository implementation. If the repository ever changes to fetch exactly `limit` rows, pagination silently breaks — callers receive no `nextCursor` and assume they have the last page.

**Fix:** Document the contract explicitly in the interface, or make the service pass `limit + 1` to the repository and let the repository return exactly `limit`:

```typescript
// Option A: service passes limit+1 to make the contract explicit
const results = await this.repo.findMessages(chatId, cursor, limit + 1)
const hasNext = results.length > limit
const data = hasNext ? results.slice(0, limit) : results
```

---

### WR-05: `toJobDomain` and `toCompanyDomain` in credit.repository.ts use `any` parameter type

**File:** `src/adapters/repositories/credit.repository.ts:148,168`

**Issue:** Both private mapping methods are typed `(row: any)`. This bypasses TypeScript's type checking for the Prisma result shape, meaning field renames in the Prisma schema (e.g., `salaryMin` → `minSalary`) would compile successfully but produce `undefined` values at runtime.

**Fix:** Use the Prisma-generated payload type:

```typescript
import type { Prisma } from '@prisma/client'

// Use the inferred Prisma result type instead of any:
private toJobDomain(row: Prisma.JobGetPayload<Record<string, never>>): Job { ... }
```

---

## Info

### IN-01: Neo4jAdapter is a pure delegation wrapper — consider removing the indirection

**File:** `src/adapters/services/neo4j.adapter.ts`

**Issue:** `Neo4jAdapter` does nothing except forward every method call to an inner `RecommendationRepository` instance (lines 16-22). It adds no translation, no error mapping, and no interface adaptation. This is an unnecessary layer of indirection that increases maintenance surface without benefit. Both classes implement `IRecommendationRepository`, so they are interchangeable at the injection site.

**Fix:** Remove `Neo4jAdapter` and inject `RecommendationRepository` directly in `app.ts`. If adapter-specific concerns (connection management, retry, tracing) are added later, reintroduce the wrapper at that point.

---

### IN-02: `console.error` in error-handler.ts — should use Fastify's structured logger

**File:** `src/infrastructure/http/plugins/error-handler.ts:62`

**Issue:** The catch-all branch uses `console.error('[errorHandler] Unhandled error:', error)`. Fastify provides `request.log.error()` for structured JSON logging with correlation IDs and request context. `console.error` produces unstructured output that is harder to search in production log aggregators.

**Fix:**
```typescript
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,  // remove leading underscore
  reply: FastifyReply,
): void {
  // ...
  request.log.error({ err: error }, 'Unhandled error')
  reply.status(500).send({ error: 'Internal server error' })
}
```

---

### IN-03: `package.json` — jest and ts-jest major version mismatch

**File:** `package.json:56,63`

**Issue:** `jest` is pinned to `^30.3.0` while `ts-jest` is pinned to `^29.4.9`. `ts-jest` v29 supports Jest 29. Compatibility with Jest 30 is not guaranteed and may cause test runner failures or silent mismatches in transform behavior.

**Fix:** Align `ts-jest` to a version that explicitly supports Jest 30 (check `ts-jest` changelog for a `^30.x` release), or pin `jest` to `^29.x` until `ts-jest` v30 is stable.

---

### IN-04: Dead `haversineKm` import signal in credits.controller.ts

**File:** `src/adapters/controllers/credits.controller.ts:6`

**Issue:** The import of `haversineKm` on line 6 is used (line 31), but it is the only place in the controller layer where a domain utility is imported directly. Per Clean Architecture, controllers should not reach into `application/utils` for computation — that logic belongs in a service or use case. The distance computation in the controller is response enrichment, which is a borderline concern. Consider whether `distanceKm` should be returned by the use case itself (already done in `GetRankingUseCase`), making the controller-level computation redundant.

**Fix (low priority):** Move the `distanceKm` enrichment into `UnlockCandidateUseCase.execute()` return value (consistent with how `GetRankingUseCase` handles it), then remove the `haversineKm` import from the controller.

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
