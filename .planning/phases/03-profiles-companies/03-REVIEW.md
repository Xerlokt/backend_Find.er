---
phase: 03-profiles-companies
reviewed: 2026-04-20T00:00:00Z
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
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed all source and test files for Phase 03 (Profiles & Companies). The architecture is clean and consistent across all three modules: routes delegate to services which delegate to repositories, with proper authentication hooks, Zod validation on every endpoint, and userId always sourced from the JWT (`request.user.id`). No IDOR vulnerabilities were found. Sensitive fields (`passwordHash`, `googleId`) are correctly excluded in all admin queries.

One critical issue was found: the credit-adjustment guard is not atomic — a race condition can drive company credits below zero under concurrent requests. This violates the project's own stated rule ("Transações atômicas para créditos"). Four warnings cover the unbounded pagination `limit` parameter, the `(request.query as any)` cast that silently produces `NaN`, the missing CreditTransaction audit record on credit grants, and missing 401 test coverage for unauthenticated access. Five informational items cover the duplicate credit endpoint, the `Company.plan` being an unvalidated string, missing pagination total-count, `as any` casts in test mocks, and a missing `getProfile` unit test in the recruiter suite.

---

## Critical Issues

### CR-01: Race condition in `CompanyService.adjustCredits` — credits can go negative under concurrent load

**File:** `src/modules/company/company.service.ts:20-28`

**Issue:** `adjustCredits` reads the current credit balance with `findById` (line 20), checks `company.credits + delta < 0` (line 24), then calls `repo.adjustCredits` (line 27) which uses Prisma's `{ increment: delta }`. Because the guard and the write are two separate database round-trips, two concurrent requests can both read the same balance, both pass the guard, and both writes succeed — driving credits below zero. The project's CLAUDE.md explicitly requires "Transações atômicas para créditos e swipes (race conditions)".

The same structure appears in `AdminService.adjustCredits` (`src/modules/admin/admin.service.ts:39-45`): a separate `findUnique` followed by a bare `update`, again without a transaction.

**Fix:** Wrap the guard and write in a Prisma interactive transaction in both service methods:

```typescript
// src/modules/company/company.service.ts
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

Apply the same pattern to `AdminService.adjustCredits`.

---

## Warnings

### WR-01: No upper bound on pagination `limit` parameter — allows unbounded DB scan

**File:** `src/modules/admin/admin.routes.ts:19`

**Issue:** The `limit` query parameter is parsed with `Number((request.query as any).limit ?? 20)` without any maximum cap. A caller sending `?limit=1000000` forces the service to attempt loading millions of rows in a single query. There is no Zod schema guarding these query parameters.

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

### WR-02: `(request.query as any)` cast — `NaN` silently accepted by Prisma, empty results returned

**File:** `src/modules/admin/admin.routes.ts:18-19`

**Issue:** `page` and `limit` are extracted via `(request.query as any).page` and `(request.query as any).limit`. `Number(undefined)` returns `NaN`. When `limit` is `NaN`, Prisma silently coerces `take: NaN` to `take: 0` and returns an empty array with no error — a silent data loss to the client. When `page` is `NaN`, `skip: NaN` is coerced to `skip: 0`, returning the first page but masking the invalid input. This bypasses TypeScript type safety and eliminates compile-time typo detection.

**Fix:** Resolved together with WR-01 by using the `ListUsersQuerySchema` parse above, which handles coercion safely via `z.coerce.number()` and eliminates all `as any` casts.

---

### WR-03: CreditTransaction audit record is never written when credits are adjusted

**File:** `src/modules/admin/admin.service.ts:39-45`
**File:** `src/modules/company/company.service.ts:19-28`

**Issue:** The schema defines a `CreditTransaction` model (schema.prisma lines 167-174) with `companyId`, `amount`, and `reason` fields, clearly intended as an audit trail. Neither `AdminService.adjustCredits` nor `CompanyService.adjustCredits` creates a `CreditTransaction` record. This means there is currently no persistent record of who granted credits, when, or how many. Any future billing or credit reconciliation feature will have no historical data.

**Fix:** Create the audit record inside the same `$transaction` as the credit update (see CR-01):

```typescript
await tx.creditTransaction.create({
  data: {
    companyId,
    amount: delta,
    reason: 'admin_grant',
  },
})
```

The `adjustCredits` methods should accept an optional `reason` string parameter to support different call sites (admin grant vs. future automated deductions).

---

### WR-04: Integration tests do not cover unauthenticated access (missing 401 assertions)

**File:** `tests/integration/company.test.ts` (all describe blocks)
**File:** `tests/integration/candidate.test.ts` (all describe blocks)
**File:** `tests/integration/recruiter.test.ts` (all describe blocks)

**Issue:** None of the three integration test suites include a case that sends a request without an `Authorization` header. Authorization is only tested via 403 cases (wrong role). If the `authenticate` preHandler were accidentally removed from a route registration, no test would catch it.

**Fix:** Add one 401 test per protected route family. Example for `company.test.ts`:

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

### IN-01: Duplicate credit-adjustment endpoint creates divergent implementations

**File:** `src/modules/admin/admin.routes.ts:34-41`
**File:** `src/modules/company/company.routes.ts:41-48`

**Issue:** Two separate endpoints adjust company credits, both protected by `requireRole('ADMIN')`:
- `PATCH /admin/companies/:id/credits` — calls `AdminService.adjustCredits` (no balance guard)
- `PATCH /companies/admin/:id/credits` — calls `CompanyService.adjustCredits` (has balance guard)

The two implementations already have divergent behavior: the company route enforces an underflow guard while the admin route does not. This duplication will cause confusion about the canonical endpoint and risk further divergence.

**Fix:** Pick one canonical path, remove the other, and route both to the same service method (prefer `CompanyService.adjustCredits` as it has the guard).

---

### IN-02: `Company.plan` is an unvalidated `String` field — no enum enforcement

**File:** `prisma/schema.prisma:96`

**Issue:** The `plan` field on `Company` is typed as `String` with a default of `"FREE"`. Any string can be written without DB-level rejection. This will become a bug source when plan-gated features are implemented.

**Fix:** Define a Prisma enum and run a migration:

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

### IN-03: `GET /admin/users` response does not include total count for pagination

**File:** `src/modules/admin/admin.service.ts:5-19`

**Issue:** `listUsers` returns only the array slice. Without a total count, clients cannot determine the total number of pages or render a pagination control.

**Fix:** Return both items and total in a single batch query:

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

### IN-04: `as any` casts in unit test mocks reduce type safety of assertions

**File:** `tests/unit/candidate.service.test.ts:26,28`
**File:** `tests/unit/company.service.test.ts:26,40`
**File:** `tests/unit/recruiter.service.test.ts:27,31`

**Issue:** Mock return values are cast with `as any` (e.g., `repo.upsertProfile.mockResolvedValue(expectedProfile as any)`). These casts cause TypeScript to accept structurally incomplete mock objects. If a required field is added to a Prisma model, the tests will not detect the mismatch.

**Fix:** Import the Prisma-generated type and construct a complete stub, or use `satisfies`:

```typescript
import type { CandidateProfile } from '@prisma/client'

const expectedProfile = {
  id: 'profile-1', userId, name: 'Test User', bio: null, lat: null,
  lng: null, professionId: 'backend-dev', skills: ['Node.js'],
  preferredModalities: ['REMOTE' as const], searchRadiusKm: 50, salaryExpectation: null,
} satisfies CandidateProfile
```

---

### IN-05: `RecruiterService.getProfile` has no unit test coverage

**File:** `tests/unit/recruiter.service.test.ts`

**Issue:** The `RecruiterService.getProfile` method is not covered by any unit test. The analogous methods in `CandidateService` and `CompanyService` both have unit test describe blocks. The integration test covers the 404 path, but a unit test for the found-profile path and the not-found error path is absent.

**Fix:** Add a `describe('getProfile', ...)` block covering: (a) returns profile when `findProfileByUserId` returns a value, (b) throws `AppError` 404 `NOT_FOUND` when it returns `null`.

---

_Reviewed: 2026-04-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
