---
phase: 03-profiles-companies
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - prisma/schema.prisma
  - src/app.ts
  - src/modules/admin/admin.routes.ts
  - src/modules/admin/admin.service.ts
  - src/modules/candidate/candidate.repository.ts
  - src/modules/candidate/candidate.routes.ts
  - src/modules/candidate/candidate.service.ts
  - src/modules/company/company.repository.ts
  - src/modules/company/company.routes.ts
  - src/modules/company/company.service.ts
  - src/modules/recruiter/recruiter.repository.ts
  - src/modules/recruiter/recruiter.routes.ts
  - src/modules/recruiter/recruiter.service.ts
  - tests/integration/admin.test.ts
  - tests/integration/candidate.test.ts
  - tests/integration/company.test.ts
  - tests/integration/recruiter.test.ts
  - tests/unit/candidate.service.test.ts
  - tests/unit/company.service.test.ts
  - tests/unit/recruiter.service.test.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed all source and test files for Phase 03 (Profiles & Companies). The architecture is clean and consistent across all three modules: routes → service → repository, with proper authentication hooks, Zod validation on every endpoint, and userId always sourced from the JWT (`request.user.id`). No security regressions were found. Sensitive fields (`passwordHash`, `googleId`) are correctly excluded in all admin queries.

Four warnings were found: a race condition in the credit-adjustment guard, a missing 401 test for unauthenticated access, a missing `limit` upper-bound cap that allows unbounded pagination queries, and a `(request.query as any)` unsafe cast in admin routes. Five informational issues cover duplicate endpoint logic between `admin.routes` and `company.routes`, a missing index on `Company.credits`, pagination without total-count metadata, `as any` casts in test mocks, and the `createUser` factory defaulting to no password hash for ADMIN users in some integration tests.

---

## Warnings

### WR-01: Race condition in `CompanyService.adjustCredits` — read-then-write without transaction

**File:** `src/modules/company/company.service.ts:20-28`

**Issue:** `adjustCredits` reads the current credit balance with `findById`, checks `company.credits + delta < 0`, then calls `adjustCredits` (which uses Prisma's `{ increment: delta }`). Because the guard and the write are two separate database round-trips, a concurrent request can pass the guard simultaneously for the same company and both writes succeed, potentially driving the balance below zero. The project's own security rules state "Transações atômicas para créditos e swipes (race conditions)".

**Fix:** Wrap the guard and write in a Prisma interactive transaction, or use a conditional update that enforces the floor atomically:

```typescript
async adjustCredits(companyId: string, delta: number) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    if (company.credits + delta < 0) {
      throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS')
    }
    return tx.company.update({
      where: { id: companyId },
      data: { credits: { increment: delta } },
    })
  })
}
```

The same issue applies to `AdminService.adjustCredits` (`src/modules/admin/admin.service.ts:39-46`), which does not even have a guard — it only increments, so a race condition there would result in double-credits, not a balance underflow. That method should also be wrapped in a transaction if a CreditTransaction audit record is added later.

---

### WR-02: No upper bound on pagination `limit` parameter — allows unbounded DB scan

**File:** `src/modules/admin/admin.routes.ts:19`

**Issue:** The `limit` query parameter is parsed as `Number(request.query.limit ?? 20)` without any maximum cap. A caller can send `?limit=1000000` and force the service to attempt to load millions of rows in a single query. There is no Zod schema guarding these query parameters.

**Fix:** Validate query parameters with Zod before use:

```typescript
const ListUsersQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// In handler:
const { page, limit } = ListUsersQuerySchema.parse(request.query)
```

---

### WR-03: `(request.query as any)` unsafe cast bypasses TypeScript type safety

**File:** `src/modules/admin/admin.routes.ts:18-19`

**Issue:** Both `page` and `limit` are extracted via `(request.query as any).page` and `(request.query as any).limit`. This suppresses TypeScript's ability to catch typos or type errors, and `Number(undefined)` returns `NaN`, which would cause `skip: NaN` to be passed to Prisma — Prisma silently coerces `NaN` to `0`, making invalid inputs behave like `page=1`. If `limit` resolves to `NaN`, `take: NaN` also coerces to `0`, returning an empty result with no error.

**Fix:** Solved together with WR-02 by using the `ListUsersQuerySchema` parse above, which handles coercion safely and eliminates all `as any` casts.

---

### WR-04: Integration tests for company routes do not test unauthenticated access (missing 401 assertion)

**File:** `tests/integration/company.test.ts` (all describe blocks)
**File:** `tests/integration/candidate.test.ts` (all describe blocks)
**File:** `tests/integration/recruiter.test.ts` (all describe blocks)

**Issue:** None of the three integration test suites include a case that sends a request without an `Authorization` header to verify that the `authenticate` preHandler correctly rejects it with 401. The authorization layer is only tested via 403 cases (wrong role). If the `authenticate` hook were accidentally removed from a route, no test would catch it.

**Fix:** Add one 401 test per protected route family, for example in `company.test.ts`:

```typescript
it('401 para requisição sem Authorization header', async () => {
  const app = await buildApp({ testing: true })
  await app.ready()

  const response = await supertest(app.server)
    .get('/companies/00000000-0000-0000-0000-000000000000')

  expect(response.status).toBe(401)
  await app.close()
})
```

---

## Info

### IN-01: Duplicate credit-adjustment endpoint — `PATCH /admin/companies/:id/credits` and `PATCH /companies/admin/:id/credits`

**File:** `src/modules/admin/admin.routes.ts:34-41`
**File:** `src/modules/company/company.routes.ts:41-48`

**Issue:** There are two separate endpoints that both adjust company credits, both protected by `requireRole('ADMIN')`. They differ only in URL path and they reach different service implementations (`AdminService.adjustCredits` vs `CompanyService.adjustCredits`). The `AdminService` version has no balance guard (only increments), while the `CompanyService` version does have a guard. This duplication will cause confusion about which is the canonical endpoint and may lead to one being maintained while the other drifts.

**Fix:** Pick one canonical path, remove the other, and point both route files to the same service method.

---

### IN-02: `Company.plan` is a plain `String` field — no enum enforcement

**File:** `prisma/schema.prisma:96`

**Issue:** The `plan` field on `Company` is typed as `String` with a default of `"FREE"`, but valid plan values (FREE, BASIC, PRO, etc.) are business logic. Without an enum, any string can be written — `"FREEEE"`, `""`, etc. This will become a bug magnet when plan-gated features are implemented.

**Fix:** Define a Prisma enum and migrate:

```prisma
enum Plan {
  FREE
  BASIC
  PRO
}

model Company {
  // ...
  plan  Plan  @default(FREE)
}
```

---

### IN-03: Pagination response for `GET /admin/users` does not include total count

**File:** `src/modules/admin/admin.service.ts:5-19`

**Issue:** `listUsers` returns only the array of users. Without a `total` count, UI clients cannot compute the number of pages or show a progress indicator. This is typically required from day one for admin UIs.

**Fix:** Return both items and total:

```typescript
async listUsers(page: number, limit: number) {
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ])
  return { users, total, page, limit }
}
```

---

### IN-04: `as any` casts in unit test mocks reduce type safety of the test assertions

**File:** `tests/unit/candidate.service.test.ts:26,28`
**File:** `tests/unit/company.service.test.ts:26,40`
**File:** `tests/unit/recruiter.service.test.ts:27,31`

**Issue:** Mock return values are cast with `as any` (e.g., `repo.upsertProfile.mockResolvedValue(expectedProfile as any)`). These casts cause TypeScript to accept incomplete mock objects. If the actual Prisma return type gains a required field, the tests will not catch the mismatch.

**Fix:** Use `satisfies` or provide the full required fields matching the Prisma-generated type. Alternatively, import the type and construct a complete stub:

```typescript
import type { CandidateProfile } from '@prisma/client'

const expectedProfile: CandidateProfile = {
  id: 'profile-1',
  userId,
  name: 'Test User',
  bio: null,
  lat: null,
  lng: null,
  professionId: 'backend-dev',
  skills: ['Node.js'],
  preferredModalities: ['REMOTE'],
  searchRadiusKm: 50,
  salaryExpectation: null,
}
```

---

### IN-05: `RecruiterService` unit tests are missing a `getProfile` describe block

**File:** `tests/unit/recruiter.service.test.ts`

**Issue:** `RecruiterService.getProfile` is not covered by any unit test. The analogous methods in `CandidateService` and `CompanyService` both have unit test coverage. The integration test does cover the 404 path, but a unit test for `getProfile` with a found profile is absent.

**Fix:** Add a `describe('getProfile', ...)` block covering: (a) returns profile when found, (b) throws `AppError` 404 when `findProfileByUserId` returns `null`.

---

_Reviewed: 2026-04-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
