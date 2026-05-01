---
phase: 05-swipe
reviewed: 2026-05-01T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/modules/swipe/swipe.repository.ts
  - src/modules/swipe/swipe.service.ts
  - src/modules/swipe/swipe.routes.ts
  - src/app.ts
  - tests/unit/swipe.service.test.ts
  - tests/integration/swipe.test.ts
  - tests/helpers/factories.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The swipe module is well-structured overall. The key security requirements are met: candidateId is always resolved from the JWT (no IDOR), `prisma.$transaction` wraps swipe creation, `lat`/`lng` are excluded from the ranking response, and DISLIKE candidates receive `profile: null`. The rate limit config on `POST /swipes` is correctly scoped per-route.

One critical issue was found: `findSwipesByJobId` fetches candidate `lat`/`lng` from the database but those columns are not excluded at the query level — only omitted in the service `map()`. This is a defense-in-depth gap; the raw data with coordinates passes through in-memory before being stripped, and any future serialisation bug (e.g. a `...spread`, logging middleware, or a new code path) would leak coordinates to the caller. The fix is to exclude the columns at the Prisma `select` layer.

Four warnings address a Zod parse placement issue in routes (exceptions escape the Fastify error handler on invalid input), a missing `404` integration test for expired jobs, a potential `any`-typed `swipe` parameter in the service `map()` that hides type errors, and a cross-module import (`RankingItem` from `job.routes`) that violates module isolation rules.

---

## Critical Issues

### CR-01: Candidate coordinates fetched from DB and live in-memory before being stripped (location privacy D-05/D-07)

**File:** `src/modules/swipe/swipe.repository.ts:38-48`

**Issue:** `findSwipesByJobId` uses `include: { candidate: true }` (no `select`), which means the full `CandidateProfile` row — including `lat` and `lng` — is loaded into memory and passed to the service. The service then omits those fields in its `map()` at line 72-84. This relies entirely on the mapping logic to preserve privacy. Any future change — an accidental `...spread`, a debug log of the raw swipes array, or a new code path that forwards the repository result — will silently leak coordinates.

The fix is to exclude coordinates at the query boundary so they are never loaded:

```typescript
// swipe.repository.ts — findSwipesByJobId
async findSwipesByJobId(jobId: string) {
  return prisma.swipe.findMany({
    where: { jobId },
    orderBy: [{ swipedAt: 'desc' }],
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          bio: true,
          skills: true,
          professionId: true,
          preferredModalities: true,
          salaryExpectation: true,
          lat: true,   // still needed for Haversine — but NOT forwarded to caller
          lng: true,   // same
          user: { select: { avatarUrl: true } },
        },
      },
    },
  })
}
```

The `lat`/`lng` columns are required for the Haversine calculation inside the service, so they still need to be fetched — but they must never appear in any returned object. With an explicit `select`, TypeScript will also enforce that no extra columns are accidentally included when the schema changes.

---

## Warnings

### WR-01: Zod `parse()` in route handlers throws `ZodError`, which may bypass the Fastify error handler

**File:** `src/modules/swipe/swipe.routes.ts:29, 49, 58`

**Issue:** `SwipeBodySchema.parse(request.body)`, `FeedQuerySchema.parse(request.query)`, and `JobIdParamsSchema.parse(request.params)` throw a raw `ZodError` on invalid input. If the global `errorHandler` (in `src/shared/errors/errorHandler.ts`) does not explicitly handle `ZodError`, these will surface as a 500 or as an unformatted error object instead of a structured 400. Fastify's `setErrorHandler` does catch all thrown errors, but the shape of the response depends on whether `ZodError` is a handled case.

The safer pattern — consistent with how other modules in this codebase should operate — is to use `safeParse` and convert to an `AppError`:

```typescript
// In each route handler, replace:
const body = SwipeBodySchema.parse(request.body)

// With:
const parsed = SwipeBodySchema.safeParse(request.body)
if (!parsed.success) {
  throw new AppError(parsed.error.message, 400, 'VALIDATION_ERROR')
}
const body = parsed.data
```

Alternatively, verify that `errorHandler` already handles `ZodError` and produces the expected `{ statusCode: 400, code: 'VALIDATION_ERROR' }` shape. If it does, document the contract here with a comment so future maintainers do not remove the handling.

### WR-02: `swipe` parameter typed as `any` in the `getRanking` map — hides missing fields at compile time

**File:** `src/modules/swipe/swipe.service.ts:68`

**Issue:** `swipes.map((swipe: any, index: number) => ...)` uses an explicit `any` cast. This silences TypeScript for the entire body of the mapping function. If `findSwipesByJobId` changes its shape (e.g., a column is renamed, a relation is dropped), the compiler will not catch the mismatch and the runtime will silently return `undefined` values in the API response.

```typescript
// Remove the `: any` annotation; let TypeScript infer the type from repo.findSwipesByJobId's return
return swipes.map((swipe, index) => ({
  ...
}))
```

If the inferred type is too wide because of the Prisma `include`, extract a type alias from `Awaited<ReturnType<typeof this.repo.findSwipesByJobId>>[number]` and annotate explicitly.

### WR-03: Cross-module import violates ARCH-04 module isolation

**File:** `src/modules/swipe/swipe.service.ts:4`

**Issue:** `import type { RankingItem } from '../job/job.routes'` imports a type directly from the `job` module's routes file. This violates the ARCH-04 rule that modules must not import directly from one another. Additionally, importing from a `routes` file inside a service is a layer violation (routes → service, not service → routes).

Move `RankingItem` to a shared types file (e.g., `src/shared/types/ranking.ts` or a `src/modules/swipe/swipe.types.ts`) and import from there in both the job and swipe modules:

```typescript
// src/shared/types/ranking.ts
export interface RankingItem {
  candidateId: string
  fitScore: number
  profile: Record<string, unknown> | null
}

// swipe.service.ts
import type { RankingItem } from '../../shared/types/ranking'

// job.routes.ts
import type { RankingItem } from '../../shared/types/ranking'
```

### WR-04: Missing integration test for expired-job guard on `POST /swipes`

**File:** `tests/integration/swipe.test.ts`

**Issue:** The unit tests cover the expired-job case (`expiresAt <= now`) at line 70-75 of `swipe.service.test.ts`, but the integration test suite covers only `isActive: false` (line 122-136). There is no integration test that creates a job with `expiresAt` in the past and verifies the route returns 404. Since the expiry check depends on a `new Date()` comparison at the service layer, a real-DB integration test provides stronger confidence that the guard works end-to-end.

```typescript
it('404 quando job está expirado (expiresAt no passado)', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()
  const company = await createCompany()
  const { token } = await createCandidateWithProfile(app, 'expired-job')
  const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'expired-job-rec')
  const job = await createJob(company.id, recruiterProfile.id, {
    isActive: true,
    expiresAt: new Date(Date.now() - 1000), // already expired
  })
  const response = await supertest(app.server)
    .post('/swipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId: job.id, direction: 'LIKE' })
  expect(response.status).toBe(404)
  await app.close()
})
```

---

## Info

### IN-01: `createSwipe` wraps a single write in a `prisma.$transaction` with no benefit

**File:** `src/modules/swipe/swipe.repository.ts:6-8`

**Issue:** The transaction wraps only `tx.swipe.create({ data })` — a single statement. A transaction around a single atomic write adds no isolation or atomicity guarantee beyond what the write itself provides. The intent (preventing race conditions on duplicate swipes) is handled by the unique constraint on `(candidateId, jobId)` enforced by Prisma error code `P2002`, not by the transaction.

If a future phase adds a credit deduction or a Neo4j write alongside the swipe creation, the transaction will become meaningful. For now it is harmless dead code.

Either remove it and use `prisma.swipe.create` directly, or add a comment explaining why the transaction wrapper is intentionally pre-structured for Phase 6 expansion:

```typescript
// Option A: remove transaction (simpler now, add back in Phase 6 with credit deduction)
async createSwipe(data: { candidateId: string; jobId: string; direction: SwipeDirection }) {
  return prisma.swipe.create({ data })
}

// Option B: keep transaction, document intent
async createSwipe(data: { candidateId: string; jobId: string; direction: SwipeDirection }) {
  // Transaction wrapper retained for Phase 6: credit deduction + swipe creation must be atomic
  return prisma.$transaction(async (tx) => {
    return tx.swipe.create({ data })
  })
}
```

### IN-02: `createJob` factory does not expose `lat`/`lng` overrides

**File:** `tests/helpers/factories.ts:54-78`

**Issue:** The `createJob` factory `overrides` type does not include `lat` or `lng`. The integration test for ranking distance (line 305-321 in `swipe.test.ts`) creates a job "with no lat/lng" by relying on the factory default — which is correct — but there is no way to create a job with coordinates through the factory. A future test that needs to verify non-null `distanceKm` end-to-end must either inline a raw `prisma.job.create` call or extend the factory.

```typescript
export async function createJob(
  companyId: string,
  recruiterId: string,
  overrides: Partial<{
    professionId: string
    modality: Modality
    requiredSkills: string[]
    isActive: boolean
    expiresAt: Date
    lat: number       // add
    lng: number       // add
  }> = {}
) {
  return prisma.job.create({
    data: {
      ...
      lat: overrides.lat,
      lng: overrides.lng,
    },
  })
}
```

### IN-03: `fitScore` is hardcoded to `0` in the ranking response with no schema-level enforcement

**File:** `src/modules/swipe/swipe.service.ts:70`

**Issue:** `fitScore: 0` is a known Phase 5 placeholder (comment on line 70 documents this). The concern is that the `RankingItem` interface types `fitScore` as `number`, so `0` satisfies it and the compiler will accept any integer substituted here in Phase 6. There is no test asserting the field is present and numeric in the integration suite for the ranking endpoint. When Phase 6 replaces `0` with a Neo4j score, a test that checks `typeof result[0].fitScore === 'number'` will catch regressions.

No code change needed now, but add to the Phase 6 acceptance checklist: assert `fitScore` is a finite number, not `0` or `NaN`, in the ranking integration test.

---

_Reviewed: 2026-05-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
