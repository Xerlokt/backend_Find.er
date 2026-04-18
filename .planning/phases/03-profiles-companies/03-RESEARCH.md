# Phase 3: Profiles & Companies - Research

**Researched:** 2026-04-18
**Domain:** Candidate profiles, company management, recruiter profiles, admin user management — Fastify + Prisma + Clean Architecture
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAND-01 | Candidate can create and edit profile (name, bio, location, skills, salary expectation, work modes) | CandidateProfile model already in schema; PATCH upsert via Prisma; Zod validates all fields |
| CAND-02 | Candidate can set search radius in km | `searchRadiusKm: Int @default(50)` already in schema; simple integer field update |
| COMP-01 | Recruiter can create and edit profile linked to a company | RecruiterProfile model already in schema; requires `companyId` FK; guard: role = RECRUITER |
| COMP-02 | Admin can create companies | Company model already in schema; route guarded with `requireRole('ADMIN')` |
| COMP-03 | Company has credit balance managed via admin | `credits: Int @default(0)` in Company model; admin-only PATCH to set/adjust credits |
| ADMIN-01 | Admin can list and manage users | `GET /admin/users` + `GET /admin/users/:id`; Prisma `user.findMany` + `user.findUnique`; guarded |
| ADMIN-02 | Admin can add credits to companies | `PATCH /admin/companies/:id/credits`; atomic `company.update({ credits: { increment: N } })`; guarded |
| ADMIN-03 | Admin routes protected by role ADMIN | `preHandler: [authenticate, requireRole('ADMIN')]` on every admin route |
</phase_requirements>

---

## Summary

Phase 3 builds on the complete authentication foundation delivered in Phase 2. All Prisma models for this phase (`CandidateProfile`, `RecruiterProfile`, `Company`) are **already defined and migrated** in the existing schema — the phase requires NO Prisma schema changes, only service/repository/route implementation.

The phase introduces three new modules following the established `routes → service → repository` pattern:
1. **`candidate`** — profile upsert (create-or-update in one PATCH) for CANDIDATE users
2. **`company`** — company CRUD (admin-only creation) and credit balance management
3. **`recruiter`** — profile upsert for RECRUITER users with company linkage

Admin functionality (user listing, credit grants) is either part of the company module or a thin shared admin module depending on planner choice — both are valid. A fourth thin `admin` module handles `GET /admin/users` and `GET /admin/users/:id` (ADMIN-01).

The `authenticate` and `requireRole` hooks from Phase 1/2 are already implemented and reusable as `preHandler` arrays. No new shared infrastructure is needed.

**Primary recommendation:** Follow the `auth` module pattern exactly — class-based service with injected repository, Zod in-handler validation, `throw new AppError(...)` for all errors, `preHandler: [authenticate, requireRole('ROLE')]` for protected routes.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Candidate profile upsert | API / Backend | — | Server validates, writes to PostgreSQL; location (lat/lng) stored as floats |
| Recruiter profile creation | API / Backend | — | Requires FK validation (companyId must exist); server-side only |
| Company creation | API / Backend | — | Admin-only write; credits are an integer balance on the Company record |
| Credit adjustment (admin) | API / Backend | — | Must be atomic increment/decrement; never client-computed balance |
| User listing (admin) | API / Backend | — | Paginated query over User table; role-guarded |
| Admin route guarding | API / Backend (preHandler) | — | `requireRole('ADMIN')` hook already exists in shared hooks |
| Input validation | API / Backend (Zod) | — | All body/params validated with Zod before reaching service layer |

---

## Standard Stack

### Core (all already installed — NO new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 5.8.5 | HTTP framework | Already in use |
| Prisma ORM | 7.7.0 | DB access — all models defined | Already in use; no raw SQL |
| Zod | 4.3.6 | Input validation | Already in use on all routes |
| `@fastify/jwt` | 10.0.0 | JWT verification via `authenticate` hook | Already registered globally |
| fastify-plugin | 5.1.0 | Plugin encapsulation | Already in use |

> [VERIFIED: codebase grep of package.json] All dependencies listed above are already installed. Phase 3 requires **zero new npm installs**.

### No New Dependencies
Phase 3 is a pure implementation phase. The schema, validation library, ORM, auth hooks, and error infrastructure are all in place from Phases 1 and 2.

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
     |
     v
[Fastify Route Handler]
   preHandler: [authenticate, requireRole('CANDIDATE'|'RECRUITER'|'ADMIN')]
     |
     v
[Zod.parse(request.body)]  -- throws ZodError → errorHandler → 400
     |
     v
[XxxService method(validatedInput)]
     |
     v
[XxxRepository method(data)]  -- Prisma ORM only (SEC-01)
     |
     v
[PostgreSQL]
     |
     v
reply.status(N).send(payload)
```

**Error path:** All errors are thrown as `AppError` or `ZodError`. The global `errorHandler` in `src/shared/errors/errorHandler.ts` catches and formats them. Routes never `try/catch` — services and repositories throw, routes just call and reply.

### Recommended Project Structure

```
src/modules/
├── auth/              # Phase 2 — complete
│   ├── auth.routes.ts
│   ├── auth.service.ts
│   └── auth.repository.ts
├── candidate/         # Phase 3 — NEW
│   ├── candidate.routes.ts
│   ├── candidate.service.ts
│   └── candidate.repository.ts
├── company/           # Phase 3 — NEW
│   ├── company.routes.ts
│   ├── company.service.ts
│   └── company.repository.ts
├── recruiter/         # Phase 3 — NEW
│   ├── recruiter.routes.ts
│   ├── recruiter.service.ts
│   └── recruiter.repository.ts
└── admin/             # Phase 3 — NEW (thin, delegates to other repositories)
    ├── admin.routes.ts
    └── admin.service.ts
```

> **Admin module note:** `ADMIN-01` (list users) and `ADMIN-02` (add credits) can share the `admin` module backed by `UserRepository` (re-used, or a thin wrapper). `ADMIN-02` can also live in `company.routes.ts` under the `/admin` prefix — either works. Planner chooses; both are architecturally sound.

### Pattern 1: Route with Role Guard

```typescript
// Source: src/shared/hooks/requireRole.ts + src/modules/auth/auth.routes.ts
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'

export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CandidateRepository()
  const service = new CandidateService(repo)

  // PUT /candidates/me — candidate profile upsert (create or update)
  app.put('/me', {
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, async (request, reply) => {
    const body = CandidateProfileSchema.parse(request.body)
    const profile = await service.upsertProfile(request.user.id, body)
    return reply.status(200).send(profile)
  })
}
```

> [VERIFIED: src/shared/hooks/requireRole.ts] `requireRole` is a factory returning an async preHandler. Must follow `authenticate` in the preHandler array.

### Pattern 2: Profile Upsert (Create-or-Update)

The `CandidateProfile` and `RecruiterProfile` are 1:1 with `User` (each `userId` is `@unique`). The idiomatic Prisma pattern for "create if not exists, update if exists" on a unique constraint:

```typescript
// Source: [VERIFIED: Prisma docs — upsert]
// Repository method
async upsertCandidateProfile(userId: string, data: CandidateProfileData) {
  return prisma.candidateProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: { ...data },
  })
}
```

This is the correct approach — avoids a separate GET + conditional create/update, is atomic, and handles the unique constraint correctly.

### Pattern 3: Admin Credit Adjustment

Credits must be adjusted atomically. Use Prisma's `increment`/`decrement` shorthand (not read-then-write):

```typescript
// [VERIFIED: Prisma docs — atomic number operations]
async adjustCredits(companyId: string, delta: number) {
  return prisma.company.update({
    where: { id: companyId },
    data: { credits: { increment: delta } },
  })
}
```

This is atomic at the DB level — prevents race conditions when multiple admin operations fire simultaneously. Never do `credits: existingCredits + delta`.

### Pattern 4: Admin-Only Route

```typescript
// Pattern: preHandler array with authenticate + requireRole('ADMIN')
// Source: [VERIFIED: src/shared/hooks/requireRole.ts]
app.get('/users', {
  preHandler: [authenticate, requireRole('ADMIN')],
}, async (request, reply) => {
  const users = await service.listUsers()
  return reply.status(200).send(users)
})
```

Non-ADMIN users receive `403 FORBIDDEN` from `requireRole`. Non-authenticated users receive `401 UNAUTHORIZED` from `authenticate`. The hook chain handles both cases.

### Pattern 5: Service Without `app` Injection

The `AuthService` required `app: FastifyInstance` to call `app.jwt.sign()`. Profile/company/admin services do NOT need `app` — they only read/write data. Simpler constructor:

```typescript
export class CandidateService {
  constructor(private readonly repo: CandidateRepository) {}
  // No app dependency — cleaner, testable without Fastify instance
}
```

### Pattern 6: Company Not Found Guard

When a recruiter creates their profile linked to a `companyId`, the service must verify the company exists:

```typescript
async createRecruiterProfile(userId: string, data: { companyId: string; ... }) {
  const company = await this.repo.findCompanyById(data.companyId)
  if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
  return this.repo.upsertRecruiterProfile(userId, data)
}
```

### Anti-Patterns to Avoid

- **Skipping Zod validation:** Every route handler must call `Schema.parse(request.body)` before touching the service. Never trust `request.body` directly.
- **Raw SQL / string interpolation:** All queries via Prisma methods — `findUnique`, `upsert`, `update`, `findMany`. No `$queryRaw` with user input (SEC-01).
- **Read-then-write for credits:** `credits: { increment: N }` is atomic; `credits: existingValue + N` is a race condition (SEC-03).
- **Importing across modules:** `candidate.service.ts` must NOT import from `company.repository.ts` directly. If cross-module data is needed, the route handler composes two service calls or a shared service is extracted.
- **Putting business logic in routes:** Routes parse body, call service, send reply. Nothing else. Validation and error-throwing live in service/repository.
- **Omitting `authenticate` before `requireRole`:** `requireRole` will throw `500 INTERNAL` if `request.user` is not populated. Always pair them in the preHandler array.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Create-or-update profile | Manual GET + conditional create/update | `prisma.XxxProfile.upsert({ where: { userId }, create, update })` | Prisma upsert is atomic on unique constraint |
| Atomic credit increment | Read credits, add, write back | `prisma.company.update({ data: { credits: { increment: N } } })` | Prisma atomic operations prevent race conditions |
| Role enforcement | Custom role-checking in every route | `requireRole('ADMIN')` preHandler (already implemented) | DRY; consistent 403 response; tested in Phase 2 |
| JWT verification | Manual token decode in routes | `authenticate` preHandler (already implemented) | Reuse existing tested hook |
| Input sanitization | Custom parsers, manual checks | `Zod.parse()` in route handler | Throws `ZodError` which `errorHandler` formats as 400 |

---

## Common Pitfalls

### Pitfall 1: Missing `authenticate` Before `requireRole`
**What goes wrong:** `requireRole` reads `request.user` which is only populated by `authenticate`. If `authenticate` is absent, the service throws `500 INTERNAL` instead of `401`.
**Why it happens:** Forgetting that `requireRole` is not self-contained — it depends on prior auth state.
**How to avoid:** Always use `preHandler: [authenticate, requireRole('ROLE')]` — never `requireRole` alone.
**Warning signs:** Integration test returns 500 on unauthenticated request instead of 401.

### Pitfall 2: Double Profile Creation Attempt
**What goes wrong:** Calling `prisma.candidateProfile.create()` when a profile already exists throws a Prisma unique constraint error (P2002).
**Why it happens:** Using `create` instead of `upsert` for a 1:1 profile model.
**How to avoid:** Always use `prisma.XxxProfile.upsert({ where: { userId }, create, update })`.
**Warning signs:** Integration test for "update profile" returns 500 instead of 200.

### Pitfall 3: Credits Going Negative
**What goes wrong:** Admin decrements credits below zero — the schema has no constraint preventing negative `Int`.
**Why it happens:** No minimum balance validation in the service.
**How to avoid:** In `adjustCredits` service method, validate that delta would not result in negative balance: `if (company.credits + delta < 0) throw new AppError(...)`. Or restrict admin credit operations to `increment` only (since COMP-03 says "admin can add/set", not deduct in Phase 3).
**Warning signs:** `company.credits` returns negative value after adjustment.

### Pitfall 4: RecruiterProfile FK to Non-Existent Company
**What goes wrong:** Recruiter submits a `companyId` for a company that doesn't exist — Prisma throws a foreign key constraint error (P2003) which surfaces as 500.
**Why it happens:** Missing pre-validation of `companyId` in the service before the `upsert`.
**How to avoid:** `findCompanyById` in service before `upsertRecruiterProfile`; throw `404 NOT_FOUND` if absent.
**Warning signs:** Prisma error `P2003` in logs instead of 404 in response.

### Pitfall 5: Admin List Users — Missing Pagination
**What goes wrong:** `prisma.user.findMany()` without `take`/`skip` returns all users, which becomes a problem as the table grows.
**Why it happens:** Simple list implementation without pagination.
**How to avoid:** Accept `?page=1&limit=20` query params in the admin list route; apply `skip: (page-1)*limit, take: limit` in the repository call.
**Warning signs:** Slow response when test DB grows; no pagination cursor in response.

### Pitfall 6: Exposing `passwordHash` in User Responses
**What goes wrong:** `prisma.user.findMany()` returns all fields including `passwordHash` and `googleId` — sensitive data leaked in admin response.
**Why it happens:** Returning the raw Prisma result without selecting only safe fields.
**How to avoid:** Use Prisma `select: { id: true, email: true, role: true, createdAt: true, avatarUrl: true }` or strip fields in the service before returning.
**Warning signs:** `passwordHash` field visible in `GET /admin/users` response body.

### Pitfall 7: Zod `z.array(z.string())` vs Prisma `String[]`
**What goes wrong:** Candidate `skills` and `preferredModalities` are arrays in Prisma. Sending a non-array value (e.g., a comma-separated string) bypasses Zod if validation is not explicit.
**Why it happens:** Assuming Zod and Prisma arrays are automatically aligned.
**How to avoid:** Zod schema: `skills: z.array(z.string()).min(1)`, `preferredModalities: z.array(z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']))`.
**Warning signs:** Prisma stores `[]` or throws type error for malformed array input.

---

## Code Examples

### Zod Schema — CandidateProfile

```typescript
// [ASSUMED pattern — consistent with auth.routes.ts Zod usage in this codebase]
import { z } from 'zod'

const CandidateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  professionId: z.string().min(1),
  skills: z.array(z.string()).min(1),
  preferredModalities: z.array(z.enum(['REMOTE', 'HYBRID', 'IN_PERSON'])).min(1),
  salaryExpectation: z.number().positive().optional(), // not in schema yet — see Note below
  searchRadiusKm: z.number().int().positive().default(50),
})
```

> **Note on `salaryExpectation`:** The Prisma `CandidateProfile` model in the current schema does NOT have a `salaryExpectation` field — the requirement CAND-01 mentions "pretensão salarial" but the schema only has the job-side `salaryMin`/`salaryMax`. This may need a Prisma migration to add `salaryExpectation Float?` to `CandidateProfile`. [ASSUMED — planner must verify against CAND-01 and decide if schema migration is needed.]

### Zod Schema — Company

```typescript
const CreateCompanySchema = z.object({
  name: z.string().min(1).max(150),
  logoUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
})

const AdjustCreditsSchema = z.object({
  amount: z.number().int().positive(), // admin adds; negative adjustments out of scope Phase 3
})
```

### Zod Schema — RecruiterProfile

```typescript
const RecruiterProfileSchema = z.object({
  companyId: z.string().uuid(),
  // name could come from User.email or a display name field — planner decides
})
```

### Repository — CandidateProfile Upsert

```typescript
// [VERIFIED: Prisma upsert pattern — prisma.io/docs/reference/api-reference/prisma-client-reference#upsert]
export class CandidateRepository {
  async upsertProfile(userId: string, data: CandidateProfileData) {
    return prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
  }

  async findProfileByUserId(userId: string) {
    return prisma.candidateProfile.findUnique({ where: { userId } })
  }
}
```

### Route Registration in app.ts

```typescript
// Pattern from src/app.ts (Phase 2 baseline)
// [VERIFIED: src/app.ts]
await app.register(candidateRoutes, { prefix: '/candidates' })
await app.register(companyRoutes, { prefix: '/companies' })
await app.register(recruiterRoutes, { prefix: '/recruiters' })
await app.register(adminRoutes, { prefix: '/admin' })
```

### Admin User List — Safe Select

```typescript
// [VERIFIED: Prisma select pattern]
async listUsers(page: number, limit: number) {
  return prisma.user.findMany({
    skip: (page - 1) * limit,
    take: limit,
    select: {
      id: true,
      email: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
      // passwordHash: excluded — never expose
      // googleId: excluded — sensitive
    },
    orderBy: { createdAt: 'desc' },
  })
}
```

---

## Schema Assessment

The Prisma schema already contains all models needed for Phase 3. **No new migration is required** for the core functionality, with one potential exception:

| Model | Status | Fields Present |
|-------|--------|----------------|
| `CandidateProfile` | Already migrated | `id`, `userId`, `name`, `bio`, `lat`, `lng`, `professionId`, `skills`, `preferredModalities`, `searchRadiusKm` |
| `RecruiterProfile` | Already migrated | `id`, `userId`, `companyId` |
| `Company` | Already migrated | `id`, `name`, `logoUrl`, `description`, `rating`, `plan`, `planExpiresAt`, `credits`, `createdAt` |

**Potential gap:** CAND-01 requires "pretensão salarial" (salary expectation) for the candidate profile, but the current `CandidateProfile` model has no `salaryExpectation` field. The planner must decide:
- Option A: Add `salaryExpectation Float?` to `CandidateProfile` via a new migration (preferred — schema matches requirement).
- Option B: Defer salary expectation to Phase 6 (Recommendation) since it directly feeds the fit-score algorithm.

[ASSUMED] The planner should choose Option A — Phase 3 is the correct place to establish the candidate's salary expectation as it is part of the profile (CAND-01 explicitly includes it).

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual create-then-update | Prisma `upsert` on unique constraint | Atomic, no race on concurrent first-profile saves |
| Roles checked in service | `requireRole` preHandler on route | DRY; role check before body parsing (fail fast) |
| Password field in all user responses | Prisma `select` to exclude sensitive fields | Never expose `passwordHash`, `googleId` |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.9 + Supertest 7.2.2 |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run test` (--runInBand) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CAND-01 | PUT /candidates/me creates/updates candidate profile | integration | `npm run test:integration -- --testPathPattern=candidate` | No — Wave 0 |
| CAND-01 | PUT /candidates/me rejects non-CANDIDATE role with 403 | integration | same | No — Wave 0 |
| CAND-01 | PUT /candidates/me rejects missing `name` with 400 | integration | same | No — Wave 0 |
| CAND-02 | PUT /candidates/me with searchRadiusKm stores value | integration | same | No — Wave 0 |
| COMP-01 | PUT /recruiters/me creates profile linked to company | integration | `npm run test:integration -- --testPathPattern=recruiter` | No — Wave 0 |
| COMP-01 | PUT /recruiters/me returns 404 when companyId invalid | integration | same | No — Wave 0 |
| COMP-02 | POST /companies creates company (ADMIN only) | integration | `npm run test:integration -- --testPathPattern=company` | No — Wave 0 |
| COMP-02 | POST /companies returns 403 for RECRUITER/CANDIDATE | integration | same | No — Wave 0 |
| COMP-03 | PATCH /admin/companies/:id/credits adjusts balance | integration | `npm run test:integration -- --testPathPattern=admin` | No — Wave 0 |
| ADMIN-01 | GET /admin/users returns paginated user list | integration | same | No — Wave 0 |
| ADMIN-01 | GET /admin/users/:id returns single user | integration | same | No — Wave 0 |
| ADMIN-02 | PATCH /admin/companies/:id/credits adds credits | integration | same | No — Wave 0 |
| ADMIN-03 | All /admin routes return 403 for non-ADMIN | integration | same | No — Wave 0 |
| CandidateService | upsertProfile delegates to repository | unit | `npm run test:unit -- --testPathPattern=candidate` | No — Wave 0 |
| CandidateService | throws 403 if called with wrong userId type | unit | same | No — Wave 0 |
| CompanyService | createCompany persists correctly | unit | `npm run test:unit -- --testPathPattern=company` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --testPathPattern=<module>`
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/candidate.service.test.ts` — covers CAND-01, CAND-02 unit behavior
- [ ] `tests/unit/company.service.test.ts` — covers COMP-02, COMP-03 unit behavior
- [ ] `tests/unit/recruiter.service.test.ts` — covers COMP-01 unit behavior
- [ ] `tests/integration/candidate.test.ts` — covers CAND-01, CAND-02 end-to-end
- [ ] `tests/integration/company.test.ts` — covers COMP-02, COMP-03 end-to-end
- [ ] `tests/integration/recruiter.test.ts` — covers COMP-01 end-to-end
- [ ] `tests/integration/admin.test.ts` — covers ADMIN-01, ADMIN-02, ADMIN-03 end-to-end

*No new framework install needed — Jest + Supertest + ts-jest already configured.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (reuse) | `authenticate` preHandler — already implemented Phase 2 |
| V3 Session Management | no | No new session mechanics in Phase 3 |
| V4 Access Control | yes | `requireRole('ADMIN'/'CANDIDATE'/'RECRUITER')` preHandler |
| V5 Input Validation | yes | Zod schema on every route body |
| V6 Cryptography | no | No new crypto operations in Phase 3 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation (CANDIDATE accessing admin routes) | Elevation of Privilege | `requireRole('ADMIN')` on every `/admin/*` route; returns 403 |
| Mass assignment (sending extra fields to update) | Tampering | Zod `parse()` with explicit schema strips unknown fields |
| SQL injection via `professionId` or `skills` strings | Tampering | Prisma ORM parameterizes all queries (SEC-01) |
| IDOR — accessing another user's profile | Info Disclosure | Service uses `request.user.id` (from verified JWT) as `userId`, never trusts body userId |
| Credits tampering — client sending negative amount | Tampering | Zod validates `amount: z.number().int().positive()` on credit routes |
| Exposing sensitive fields in user list | Info Disclosure | Prisma `select` excluding `passwordHash` and `googleId` from all responses |

**IDOR note:** This is the most common mistake in profile APIs. The candidate profile upsert route must derive `userId` from `request.user.id` (the verified JWT payload), never from the request body. A user should only ever be able to edit their own profile. [VERIFIED: Pattern established in `authenticate.ts` — `request.user.id` is the JWT-verified user ID.]

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 has no external dependencies beyond what is already installed and verified in Phases 1 and 2 (PostgreSQL via Docker, Prisma client, Node.js 20).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `salaryExpectation` field needs a new migration added to `CandidateProfile` | Schema Assessment | If deferred, CAND-01 is partially incomplete; recommendation score in Phase 6 may need retroactive migration |
| A2 | Admin user management (ADMIN-01) is a thin module using User read queries, no new model | Architecture | If users require status flags (banned, active) a schema change is needed — but REQUIREMENTS.md only says "list and manage" which implies read + role changes |
| A3 | `recruiterProfile` has only `companyId` (no display name field beyond User.email) | Schema Assessment | RecruiterProfile in schema has only `userId`, `companyId` — sufficient for Phase 3; if a recruiter display name is needed, migration required |

**If table is empty:** No — three assumptions exist and are called out above.

---

## Open Questions

1. **`salaryExpectation` field on CandidateProfile**
   - What we know: CAND-01 says candidates set salary expectation; the current `CandidateProfile` model does not have this field.
   - What's unclear: Was this intentionally deferred to Phase 6 (where it feeds the fit-score), or is it a schema gap?
   - Recommendation: Add `salaryExpectation Float?` migration in Plan 03-01. The field is needed for CAND-01 completeness and will be used by Phase 6 anyway.

2. **Admin credit operation: `set` vs `increment` only**
   - What we know: COMP-03 says "admin can set and adjust a company's credit balance"; ADMIN-02 says "admin can add credits".
   - What's unclear: Should admin be able to set an absolute value (e.g., reset to 0), or only increment?
   - Recommendation: Implement `PATCH /admin/companies/:id/credits` with `{ amount: number }` that uses `increment` (positive = add, negative = deduct). Guard against going below zero in service.

---

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` — [VERIFIED: all three models present, no migration needed for core fields]
- `src/modules/auth/` — [VERIFIED: complete module as pattern template for Phase 3 modules]
- `src/shared/hooks/requireRole.ts` — [VERIFIED: `requireRole('ADMIN')` is the correct pattern, already tested]
- `src/shared/hooks/authenticate.ts` — [VERIFIED: JWT verification hook, reuse unchanged]
- `tests/helpers/factories.ts` — [VERIFIED: `createUser`, `createCandidate`, `createCompany` factories already defined]
- `tests/helpers/setup.ts` — [VERIFIED: FK-safe teardown order; includes all Phase 3 models]
- `package.json` — [VERIFIED: all dependencies present, no new installs needed]

### Secondary (MEDIUM confidence)
- Prisma `upsert` documentation — [CITED: prisma.io/docs — upsert on unique constraint is the standard pattern for 1:1 profile models]
- Prisma atomic operations (`increment`/`decrement`) — [CITED: prisma.io/docs — atomic number operations for credits]

### Tertiary (LOW confidence)
- None — all claims verified from codebase or official Prisma documentation patterns.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from package.json; no new dependencies
- Architecture: HIGH — pattern established and verified from Phase 2 auth module and shared hooks
- Schema: HIGH — Prisma schema read directly; models confirmed; one potential gap flagged (salaryExpectation)
- Pitfalls: HIGH — derived from actual codebase constraints (FK order in setup.ts, requireRole contract in requireRole.ts)
- Test patterns: HIGH — verified from existing jest.config.ts, auth.test.ts, factories.ts

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable stack — no fast-moving dependencies in this phase)
