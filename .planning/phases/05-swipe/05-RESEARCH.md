# Phase 5: Swipe - Research

**Researched:** 2026-04-26
**Domain:** Swipe mechanics, cursor pagination, ranking serialization (Fastify/Prisma/TypeScript)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ranking Endpoint Architecture**
- D-01: Separate endpoint `GET /jobs/:jobId/ranking` registered in the swipe module (NOT in job module). Keeps ARCH-04 module isolation — job module does not import from swipe module.
- D-02: `GET /jobs/:id` in job.routes.ts stays unchanged — continues returning `rankings: [] as RankingItem[]`. The ranking data is served exclusively from the new swipe endpoint.
- D-03: `GET /jobs/:jobId/ranking` is RECRUITER-only AND ownership-checked: the authenticated recruiter must be the owner of the job (`job.recruiterId === recruiterProfile.id`). Any other recruiter → 403 Forbidden.

**Ranking Content & Ordering**
- D-04: Ranking shows ALL candidates who swiped on the job (both LIKE and DISLIKE), ordered by fit score descending. Phase 5: fitScore = 0 for all (placeholder). Secondary sort: swipe date descending.
- D-05: LIKE candidates → full profile visible (name, avatarUrl, bio, skills, profession, modalities, salaryExpectation) + `distanceKm`. Exact lat/lng NOT returned.
- D-06: DISLIKE candidates → censored profile. Visible: fitScore (%), rank position, `distanceKm`. Hidden: name, avatarUrl, bio, skills, professionId, preferredModalities, salaryExpectation, exact lat/lng.
- D-07: `distanceKm` returned for ALL candidates (LIKE and DISLIKE). Haversine formula, rounded to integer. No lat/lng → `distanceKm: null`.

**Swipe Endpoint**
- D-08: `POST /swipes` — CANDIDATE only. Body: `{ jobId: string, direction: 'LIKE' | 'DISLIKE' }`.
- D-09: Duplicate swipe returns 409 with code `DUPLICATE_SWIPE`. Enforced at DB level via `@@unique([candidateId, jobId])`.
- D-10: Swipe creation uses Prisma `$transaction` for atomic write (SEC-03).
- D-11: Rate limiting on `POST /swipes`: 30 req/min per IP.
- D-14: SwipeService validates `job.isActive === true` before persisting. Inactive/expired → 404.

**Candidate Resolution**
- D-12: Service resolves `candidateId` from authenticated user's CandidateProfile. Never accept `candidateId` from request body (IDOR prevention).

**Job Feed for Candidates**
- D-15: `GET /jobs/feed` — CANDIDATE-only. Returns active jobs (`isActive: true`, `expiresAt > now`) not yet swiped by the candidate. Registered in the swipe module, mounted under `/jobs` prefix.
- D-16: Feed is cursor-based (Tinder-style — no going back). Cursor based on `job.createdAt` descending. SwipeRepository queries Job table directly via Prisma relations. Default page size and cursor field name: Claude's discretion.

**Phase 6 Extension Contract**
- D-13: `RankingItem` interface exported from job.routes.ts: `{ candidateId, fitScore, profile }`. Phase 5 returns `fitScore: 0`. Phase 6 replaces with real fit scores — no interface change needed.

### Claude's Discretion
- Rate limit value on swipe (30/min chosen in D-11)
- Haversine implementation (inline utility or shared math helper)
- SwipeRepository method names and internal structure
- Whether SwipeService gets its own findCandidateProfileByUserId or reuses CandidateRepository via injection
- Feed default page size and cursor field name (e.g., `cursor: jobId` or `cursor: createdAt`)

### Deferred Ideas (OUT OF SCOPE)
- Filtros no ranking (ex: "mostrar só LIKEs") — fase futura
- Chat auto-criado no LIKE — CHAT-02, Fase 8
- Unlock de perfil censurado com créditos — CREDIT-01, Fase 7
- Fit score real no feed — CAND-03 / REC-01, Fase 6 (Neo4j)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SWIPE-01 | Candidato pode dar swipe LIKE ou DISLIKE em uma vaga | POST /swipes endpoint with Prisma transaction write |
| SWIPE-02 | Candidato não pode dar swipe na mesma vaga duas vezes | DB-level `@@unique([candidateId, jobId])` catches P2002 → 409 |
| SWIPE-03 | Ranking: candidatos LIKE com perfil completo visível | Serialization gate in getRanking service method |
| SWIPE-04 | Ranking: candidatos DISLIKE com identidade censurada | `profile: null` for DISLIKE in RankingItem response |
| SEC-03 | Operações de swipe em transações atômicas | Prisma `$transaction` wrapping swipe create |
| SEC-05 | Rate limiting em rotas sensíveis (swipe) | Per-route `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` |
| ARCH-01 | Clean Architecture: routes → service → repository | SwipeService never imports prisma directly |
| ARCH-04 | Módulos não importam diretamente de outros módulos | SwipeRepository queries Job/CandidateProfile via direct Prisma — no cross-module imports |
</phase_requirements>

---

## Summary

Phase 5 delivers three capabilities: (1) recording candidate swipes (POST /swipes), (2) a candidate job feed with cursor pagination (GET /jobs/feed), and (3) a recruiter ranking view with LIKE/DISLIKE censorship rules (GET /jobs/:jobId/ranking). All three live in a new `swipe` module — ARCH-04 forbids the job module from importing swipe module code.

The data model is fully ready: Prisma schema already has the `Swipe` model with `@@unique([candidateId, jobId])`, `SwipeDirection` enum, and relations to `CandidateProfile` and `Job`. No new migration is needed for the core Swipe table. The route mounting strategy requires attention: `GET /jobs/feed` and `GET /jobs/:jobId/ranking` must mount under the `/jobs` prefix from within the swipe plugin, while `POST /swipes` mounts under `/swipes` — one plugin, two prefix registrations in app.ts.

The most complex piece is the ranking serialization: the service must compute Haversine distance for every candidate, apply the LIKE/DISLIKE gate, and assemble the `RankingItem` response shape. All of this is pure TypeScript logic — no new libraries needed.

**Primary recommendation:** Build in three plans: (1) SwipeRepository + SwipeService + unit tests, (2) Swipe/feed routes + integration tests, (3) Ranking endpoint + censorship serialization + integration tests.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Record swipe | API / Backend (SwipeService) | Database (Prisma Swipe table) | Business logic (active job guard, IDOR) + atomic write belong in service/repo |
| Duplicate prevention | Database / Storage | API / Backend | `@@unique` constraint at DB level, P2002 caught in errorHandler → 409 |
| Candidate identity resolution | API / Backend (SwipeService) | — | Never accept candidateId from body; derive from JWT userId via profile lookup |
| Job feed (cursor pagination) | API / Backend (SwipeRepository) | Database | Prisma `NOT: { swipes: { some: { candidateId } } }` filter — logic in repo, not routes |
| Ranking retrieval | API / Backend (SwipeService) | Database | Fetch all swipes + candidate profiles, compute distance, sort in service |
| Distance calculation (Haversine) | API / Backend (shared utility) | — | Pure math, no DB or external service needed |
| LIKE/DISLIKE censorship gate | API / Backend (SwipeService) | — | Serialization logic belongs in service, not routes |
| Rate limiting | API / Backend (Fastify route config) | — | Per-route `config.rateLimit` override on POST /swipes |
| Ownership check (ranking) | API / Backend (SwipeService) | — | `job.recruiterId === recruiterProfile.id` — same pattern as job module |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | ^7.7.0 (already installed) [VERIFIED: package.json] | DB queries for Swipe, Job, CandidateProfile | Project-mandated; no raw SQL allowed |
| Zod | ^4.3.6 (already installed) [VERIFIED: package.json] | Input validation on swipe body and feed query params | SEC-02 compliance; already used in all modules |
| @fastify/rate-limit | ^10.3.0 (already installed) [VERIFIED: package.json] | Per-route rate limit override (30 req/min on POST /swipes) | SEC-05; pattern already established in auth.routes.ts |
| Jest + Supertest | 30.x / 7.x (already installed) [VERIFIED: package.json] | TDD — unit (mocked repo) + integration (real DB) | Project-mandated; existing test infrastructure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-in Math | — | Haversine formula (sin, cos, atan2, sqrt) | Distance calculation for distanceKm in ranking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline Haversine | geolib or haversine npm package | No new dependency justified — formula is 10 lines |
| Cursor on `createdAt` | Cursor on `id` (opaque) | `createdAt` is human-readable and natural for "newest first" feed; id cursor requires additional sort stability guarantee |

**Installation:** No new packages required. All dependencies already in package.json.

---

## Architecture Patterns

### System Architecture Diagram

```
CANDIDATE                        RECRUITER
    │                                │
    │  POST /swipes                  │  GET /jobs/:jobId/ranking
    │  GET  /jobs/feed               │
    ▼                                ▼
┌─────────────────────────────────────────────────────┐
│                  swipe.routes.ts                    │
│  (mounted at /swipes AND /jobs via two app.register)│
│  preHandler: [authenticate, requireRole]            │
│  config: { rateLimit: { max: 30 } } on POST /swipes │
└──────────────┬──────────────────────────────────────┘
               │ calls
               ▼
┌──────────────────────────────────────────────────────┐
│                  SwipeService                        │
│  recordSwipe(userId, jobId, direction)               │
│  ├─ findCandidateProfileByUserId → candidateId       │
│  ├─ findJobById → isActive guard → 404 if inactive   │
│  └─ repo.createSwipe($transaction)                   │
│                                                      │
│  getFeed(userId, cursor?, limit)                     │
│  ├─ findCandidateProfileByUserId → candidateId       │
│  └─ repo.findFeedJobs(candidateId, cursor, limit)    │
│                                                      │
│  getRanking(userId, jobId)                           │
│  ├─ findRecruiterProfileByUserId                     │
│  ├─ findJobById → ownership check → 403 if mismatch │
│  ├─ repo.findSwipesByJobId(jobId)                    │
│  ├─ computeHaversine(candidate.lat/lng, job.lat/lng) │
│  └─ serialize: LIKE → full profile, DISLIKE → null  │
└──────────────┬───────────────────────────────────────┘
               │ calls
               ▼
┌──────────────────────────────────────────────────────┐
│                 SwipeRepository                      │
│  createSwipe(data) — via $transaction                │
│  findSwipesByJobId(jobId) — with candidate include   │
│  findFeedJobs(candidateId, cursor, limit)            │
│  findCandidateProfileByUserId(userId)                │
│  findRecruiterProfileByUserId(userId)                │
│  findJobById(jobId)                                  │
│  (all via prisma — no cross-module imports)          │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
         PostgreSQL (Prisma)
         Swipe / Job / CandidateProfile tables
```

### Recommended Project Structure
```
src/modules/swipe/
├── swipe.routes.ts       # Fastify plugin — POST /swipes, GET /jobs/feed, GET /jobs/:jobId/ranking
├── swipe.service.ts      # Business logic — recordSwipe, getFeed, getRanking, Haversine
└── swipe.repository.ts   # Prisma queries — no cross-module imports

src/shared/
└── (no new files needed — haversine stays inline in service or swipe module)

tests/unit/
└── swipe.service.test.ts  # Mocked SwipeRepository

tests/integration/
└── swipe.test.ts          # Real DB, Supertest
```

### Pattern 1: Per-Route Rate Limit Override
**What:** `@fastify/rate-limit` v10 supports per-route overrides via `config.rateLimit` in route options.
**When to use:** Any route needing a different limit than the global 60/min (SEC-05).
**Example:**
```typescript
// Source: verified in src/modules/auth/auth.routes.ts [VERIFIED: codebase]
app.post('/register', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
}, async (request, reply) => { ... })
```

### Pattern 2: Prisma $transaction for Single Atomic Write
**What:** Even a single-row write can be wrapped in `$transaction` for platform consistency (D-10).
**When to use:** Any write that must be atomic per SEC-03 standard.
**Example:**
```typescript
// Source: Prisma docs pattern [ASSUMED — but consistent with existing codebase SEC-03 usage]
await prisma.$transaction(async (tx) => {
  return tx.swipe.create({ data: { candidateId, jobId, direction } })
})
```

### Pattern 3: Cursor-Based Feed Query
**What:** Exclude already-swiped jobs using Prisma relation filter `NOT: { swipes: { some: ... } }`. Cursor pagination using `createdAt` with `cursor` pointing to the last-seen job's createdAt ISO string.
**When to use:** Feed endpoint (GET /jobs/feed) for "no going back" Tinder-style pagination.
**Example:**
```typescript
// Source: derived from Prisma docs + CONTEXT.md D-16 [VERIFIED: Prisma filter pattern confirmed in schema]
const jobs = await prisma.job.findMany({
  where: {
    isActive: true,
    expiresAt: { gt: new Date() },
    NOT: { swipes: { some: { candidateId } } },
  },
  orderBy: { createdAt: 'desc' },
  take: limit + 1,                            // take one extra to detect next page
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
})
```

### Pattern 4: Ranking Serialization with LIKE/DISLIKE Gate
**What:** After fetching all swipes for a job with candidate profile included, loop over results and build `RankingItem[]`. DISLIKE → `profile: null`. LIKE → full profile object (minus lat/lng).
**When to use:** getRanking service method.
**Example:**
```typescript
// Source: CONTEXT.md D-05, D-06, D-13 [VERIFIED: schema confirms all fields exist]
const items: RankingItem[] = swipesWithCandidates.map((swipe, index) => ({
  candidateId: swipe.candidateId,
  fitScore: 0,  // Phase 5 placeholder
  distanceKm: computeHaversine(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng),
  rank: index + 1,
  profile: swipe.direction === 'LIKE'
    ? {
        name: swipe.candidate.name,
        avatarUrl: swipe.candidate.user.avatarUrl,
        bio: swipe.candidate.bio,
        skills: swipe.candidate.skills,
        professionId: swipe.candidate.professionId,
        preferredModalities: swipe.candidate.preferredModalities,
        salaryExpectation: swipe.candidate.salaryExpectation,
      }
    : null,
}))
```

### Pattern 5: Plugin with Two Prefix Registrations (app.ts)
**What:** The swipe plugin mounts routes for two URL namespaces: `/swipes` (for POST) and `/jobs` (for GET feed and GET ranking).
**When to use:** When a module owns routes under multiple prefixes without violating ARCH-04.
**Example:**
```typescript
// Source: app.ts pattern [VERIFIED: codebase] + CONTEXT.md D-15
// In app.ts:
await app.register(swipeRoutes, { prefix: '/swipes' })  // POST /swipes
await app.register(swipeJobRoutes, { prefix: '/jobs' })  // GET /jobs/feed, GET /jobs/:jobId/ranking
// OR: split into two export functions from swipe.routes.ts
```

### Anti-Patterns to Avoid
- **Cross-module import:** Never `import { CandidateRepository }` from the candidate module. Access candidate/recruiter/job data via direct Prisma calls inside SwipeRepository (ARCH-04).
- **candidateId from body:** Never use `request.body.candidateId` — always resolve via `findCandidateProfileByUserId(request.user.id)` (D-12, IDOR prevention).
- **404 on inactive job:** Must check `job.isActive === true` before creating swipe. Return 404 (not 400) — expired jobs are not visible in the feed so they shouldn't be swipeable (D-14).
- **Lat/lng leakage:** Never include `lat` or `lng` in ranking response for ANY candidate — even LIKE. Only return `distanceKm` (D-05, D-06).
- **Ranking in job module:** Never add ranking logic to job.routes.ts or job.service.ts — that would require job module importing swipe data, violating ARCH-04.
- **Route ordering in Fastify:** `GET /jobs/feed` must be registered BEFORE `GET /jobs/:jobId/ranking` to avoid the static segment "feed" being matched as a jobId parameter. Same issue exists in job.routes.ts for `/mine` before `/:id` [VERIFIED: codebase pattern].

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Duplicate swipe prevention | Custom check-then-insert | Prisma `@@unique` constraint → P2002 catch | Race condition window between check and insert; DB constraint is atomic |
| Input validation | Manual type checks | Zod `.parse()` on request body | Already enforced in all prior modules (SEC-02) |
| Rate limiting | Express-style middleware | `@fastify/rate-limit` per-route config | Already installed and wired; 3-line config per route |
| Atomic swipe write | Manual try/catch with rollback | `prisma.$transaction()` | Platform standard per SEC-03 |
| JWT auth / role guard | Custom token parsing | `authenticate` + `requireRole` hooks | Already exists in `src/shared/hooks/` |

**Key insight:** Every "hard problem" in this phase (duplicate prevention, auth, rate limiting, atomicity) is already solved by existing infrastructure. Phase 5 is primarily wiring and serialization logic.

---

## Runtime State Inventory

> Not applicable — this is a greenfield phase adding new endpoints and a new module. No rename/refactor/migration.

---

## Common Pitfalls

### Pitfall 1: Route Ordering — "feed" Captured as `:jobId`
**What goes wrong:** Fastify registers routes in order. If `GET /jobs/:jobId/ranking` is registered before `GET /jobs/feed`, then a request to `/jobs/feed` will match `:jobId = "feed"` and the ranking handler will execute — resulting in a DB lookup for a non-existent UUID "feed" (400 from Zod UUID parse, or 404).
**Why it happens:** Fastify (and Express) parameterized routes match any string segment.
**How to avoid:** Register static routes (`/feed`) before parameterized routes (`/:jobId/ranking`). This is already the established pattern in job.routes.ts (`/mine` before `/:id`).
**Warning signs:** 400 or unexpected 404 when calling GET /jobs/feed.

### Pitfall 2: Prisma P2002 vs. AppError for Duplicate Swipe
**What goes wrong:** If the swipe `create` is wrapped in `$transaction`, a unique constraint violation throws `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`. The global `errorHandler` already maps P2002 → 409, but with a generic message `{ error: 'Resource already exists' }` — not `DUPLICATE_SWIPE` code.
**Why it happens:** The errorHandler's P2002 branch returns a generic 409 without the custom error code expected by D-09.
**How to avoid:** In `SwipeService.recordSwipe`, catch `PrismaClientKnownRequestError` with `code === 'P2002'` and re-throw `new AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')` before it reaches errorHandler. This gives the custom code while keeping the correct status.
**Warning signs:** Integration test for duplicate swipe gets 409 but response body lacks `code: 'DUPLICATE_SWIPE'`.

### Pitfall 3: $transaction Return Value
**What goes wrong:** `prisma.$transaction(async (tx) => { return tx.swipe.create(...) })` — the transaction callback's return value IS the transaction result. Forgetting to return inside the callback causes the service to return `undefined`.
**Why it happens:** JavaScript closure — the callback must explicitly return the created record.
**How to avoid:** Always `return tx.swipe.create(...)` inside the transaction callback. Unit test should assert the returned swipe object shape.

### Pitfall 4: Feed Cursor Pagination — Off-by-One
**What goes wrong:** Cursor pagination with `take: limit + 1` requires skipping the cursor record with `skip: 1`. Forgetting `skip: 1` when a cursor is provided will re-include the last item from the previous page.
**Why it happens:** Prisma cursor positions BEFORE the cursor record by default.
**How to avoid:** Pattern: `take: limit + 1, cursor: { id: cursor }, skip: 1`. Detect next page by checking if result.length > limit; slice to limit before returning. Integration test with two pages verifies correctness.

### Pitfall 5: Haversine with null Coordinates
**What goes wrong:** If `candidate.lat`, `candidate.lng`, `job.lat`, or `job.lng` is null (optional fields in schema), passing null to Math.sin() returns NaN — `distanceKm: NaN` in the response.
**Why it happens:** Schema fields are optional (Float?). Not all candidates or jobs have location data.
**How to avoid:** Guard at start of Haversine function: if any coordinate is null/undefined, return null. Type signature: `function haversine(lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null): number | null`.
**Warning signs:** Ranking response contains `distanceKm: null` even when coordinates are present (wrong null check), or `distanceKm: NaN` (missing null guard).

### Pitfall 6: ARCH-04 Violation — Importing from Job/Candidate Modules
**What goes wrong:** Temptation to call `jobService.getJobById()` or `candidateRepository.findProfileByUserId()` from SwipeService/SwipeRepository.
**Why it happens:** Those methods already exist and do exactly what's needed.
**How to avoid:** SwipeRepository must contain its own `findJobById`, `findCandidateProfileByUserId`, and `findRecruiterProfileByUserId` methods implemented directly with Prisma. This is the established pattern — see `job.repository.ts` which has its own `findRecruiterProfileByUserId` for the same reason.

---

## Code Examples

Verified patterns from official sources:

### Haversine Formula (Inline Utility)
```typescript
// Source: standard implementation, verified against math — [ASSUMED formula correctness, standard algorithm]
export function haversineKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
```

### Duplicate Swipe — Custom Error Code
```typescript
// Source: established errorHandler pattern [VERIFIED: src/shared/errors/errorHandler.ts]
import { Prisma } from '@prisma/client'

async recordSwipe(userId: string, jobId: string, direction: SwipeDirection) {
  // ... resolve candidateId, validate job ...
  try {
    return await prisma.$transaction(async (tx) => {
      return tx.swipe.create({ data: { candidateId, jobId, direction } })
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')
    }
    throw err
  }
}
```

### Feed Query with NOT filter
```typescript
// Source: CONTEXT.md D-16, Prisma relation filter [VERIFIED: schema has Swipe[] on CandidateProfile and Job]
async findFeedJobs(candidateId: string, cursor: string | undefined, limit: number) {
  return prisma.job.findMany({
    where: {
      isActive: true,
      expiresAt: { gt: new Date() },
      NOT: { swipes: { some: { candidateId } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor
      ? { cursor: { id: cursor }, skip: 1 }
      : {}),
  })
}
```

### Ranking Query with Candidate Profile Include
```typescript
// Source: Prisma include pattern [VERIFIED: schema relations — Swipe → CandidateProfile → User]
async findSwipesByJobId(jobId: string) {
  return prisma.swipe.findMany({
    where: { jobId },
    orderBy: [
      { direction: 'asc' },   // secondary sort placeholder; primary sort by fitScore in service
      { swipedAt: 'desc' },
    ],
    include: {
      candidate: {
        include: { user: { select: { avatarUrl: true } } },
      },
    },
  })
}
```

### Unit Test Scaffold for SwipeService
```typescript
// Source: job.service.test.ts pattern [VERIFIED: codebase]
const makeRepo = (): jest.Mocked<SwipeRepository> => ({
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findFeedJobs: jest.fn(),
  findCandidateProfileByUserId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
} as unknown as jest.Mocked<SwipeRepository>)
```

---

## Existing Infrastructure — What Phase 5 Can Reuse

| Asset | Location | How Phase 5 Uses It |
|-------|----------|---------------------|
| `authenticate` hook | `src/shared/hooks/authenticate.ts` | preHandler on all three endpoints |
| `requireRole` hook | `src/shared/hooks/requireRole.ts` | `requireRole('CANDIDATE')` and `requireRole('RECRUITER')` |
| `AppError` | `src/shared/errors/AppError.ts` | Throw 404, 403, 409 from service |
| `errorHandler` | `src/shared/errors/errorHandler.ts` | Handles ZodError → 400, P2002 → 409 (generic), AppError → correct code |
| `prisma` singleton | `src/shared/db/prisma.ts` | Direct import in SwipeRepository |
| `RankingItem` interface | `src/modules/job/job.routes.ts` | Import in swipe.routes.ts for response type (read-only — no circular dependency as job does not import swipe) |
| `createJob`, `createCandidate`, `createCompany` factories | `tests/helpers/factories.ts` | Reused in integration tests; need to add `createSwipe` factory |
| Global `afterEach` cleanup | `tests/helpers/setup.ts` | Already deletes `swipe` rows — no changes needed |
| Per-route rate limit pattern | `src/modules/auth/auth.routes.ts` | `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` |

---

## app.ts Integration Points

The swipe plugin must be registered with two prefixes in `app.ts`:

```typescript
// In app.ts — two registrations for one plugin (or two exports)
import { swipeRoutes } from './modules/swipe/swipe.routes'
import { swipeJobRoutes } from './modules/swipe/swipe.routes'

await app.register(swipeRoutes, { prefix: '/swipes' })     // POST /swipes
await app.register(swipeJobRoutes, { prefix: '/jobs' })    // GET /jobs/feed, GET /jobs/:jobId/ranking
```

Alternative: export two separate plugin functions from `swipe.routes.ts` to keep the file's responsibilities clear.

The ranking route `GET /jobs/:jobId/ranking` sits under `/jobs` prefix — this prefix is also used by `jobRoutes`. Fastify allows multiple plugins registered at the same prefix; routes from each plugin are merged. No conflict as the path segments are distinct (`/jobs/feed` vs `/jobs/:id`, `/jobs/mine`, etc.), provided route ordering is correct (feed before :jobId/ranking).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination (`page`, `skip`) | Cursor-based pagination | — | Consistent feed — no items shift when new jobs added between requests |
| Global rate limit only | Per-route rate limit override | @fastify/rate-limit v8+ | Fine-grained control without middleware proliferation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Haversine formula correctness (standard 6371km radius, atan2 variant) | Code Examples | Distance calculations off by small margin — acceptable for UX approximation |
| A2 | `prisma.$transaction` single-write pattern is acceptable for SEC-03 compliance | Pattern 2 | None — single-row transactions are valid; the requirement is about atomicity not multi-step |
| A3 | Two `app.register` calls for same swipe plugin at different prefixes works in Fastify 5 | app.ts Integration Points | Routing conflicts if Fastify 5 changed behavior — verify at implementation time |

---

## Open Questions

1. **Feed cursor field: `id` vs `createdAt`**
   - What we know: D-16 says cursor based on `job.createdAt` descending; Claude's discretion on cursor field name
   - What's unclear: Using `createdAt` as cursor has stability issues if multiple jobs share identical timestamps (millisecond precision)
   - Recommendation: Use `id` as the Prisma cursor field (UUID, guaranteed unique) while sorting by `createdAt` desc. Query: `orderBy: { createdAt: 'desc' }, cursor: { id: lastJobId }, skip: 1`. Expose as `nextCursor: string` (last job's id) in response.

2. **RankingItem import from job.routes.ts**
   - What we know: Interface is exported from job.routes.ts; swipe.routes.ts needs to import it for response typing
   - What's unclear: Whether this constitutes a "module import" violating ARCH-04
   - Recommendation: Importing a TypeScript interface (type-only import) from job.routes.ts is acceptable — it's erased at compile time, no runtime coupling. Use `import type { RankingItem } from '../job/job.routes'`. Alternatively, redeclare locally in swipe.routes.ts.

---

## Environment Availability

Step 2.6: SKIPPED for new-code capabilities. No new external dependencies — all libraries already in package.json. Note: Docker Desktop must be running for integration tests (existing blocker documented in STATE.md).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (via Docker) | Integration tests | Blocked (Docker not running) | 16 | Run unit tests only until Docker started |
| Jest | Unit + integration tests | ✓ | 30.x | — |
| Prisma CLI | Migration (none needed this phase) | ✓ | 7.7.0 | — |

**Missing dependencies with no fallback:** None for code implementation. Integration tests require Docker Desktop (existing known blocker).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x + ts-jest + Supertest 7.x |
| Config file | jest.config.js (or package.json jest field) |
| Quick run command | `npm run test:unit -- --testPathPattern=swipe` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SWIPE-01 | POST /swipes creates swipe record | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ Wave 0 |
| SWIPE-01 | SwipeService.recordSwipe resolves candidateId from userId | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ Wave 0 |
| SWIPE-01 | SwipeService throws 404 when job isActive=false | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ Wave 0 |
| SWIPE-02 | Duplicate swipe returns 409 DUPLICATE_SWIPE | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ Wave 0 |
| SWIPE-03 | LIKE candidate has full profile in ranking response | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ Wave 0 |
| SWIPE-04 | DISLIKE candidate has profile: null in ranking response | integration | `npm run test:integration -- --testPathPattern=swipe` | ❌ Wave 0 |
| SEC-03 | Swipe write is wrapped in $transaction | unit | `npm run test:unit -- --testPathPattern=swipe.service` | ❌ Wave 0 |
| SEC-05 | POST /swipes rejects >30 req/min | integration (config check) | manual-only (rate limit not easily tested with Supertest in CI) | N/A |
| ARCH-01 | SwipeRoutes → SwipeService → SwipeRepository chain | code review | n/a | N/A |
| ARCH-04 | No cross-module imports in SwipeRepository | code review | n/a | N/A |

### Sampling Rate
- **Per task commit:** `npm run test:unit -- --testPathPattern=swipe.service`
- **Per wave merge:** `npm run test:unit`
- **Phase gate:** `npm run test` full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/swipe.service.test.ts` — covers SWIPE-01, SWIPE-02, SWIPE-03, SWIPE-04, SEC-03 (unit)
- [ ] `tests/integration/swipe.test.ts` — covers SWIPE-01, SWIPE-02, SWIPE-03, SWIPE-04 (integration)
- [ ] Add `createSwipe` factory to `tests/helpers/factories.ts` — needed by swipe integration tests

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authenticate` hook (JWT verify) on all three endpoints |
| V3 Session Management | no | JWT stateless; session managed by auth module |
| V4 Access Control | yes | `requireRole('CANDIDATE')` / `requireRole('RECRUITER')` + ownership check |
| V5 Input Validation | yes | Zod on POST /swipes body and GET /jobs/feed query params |
| V6 Cryptography | no | No new crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR — candidate swipes as another user | Spoofing/Tampering | Resolve `candidateId` from JWT userId, never from body (D-12) |
| IDOR — recruiter reads ranking for job they don't own | Spoofing | `job.recruiterId === recruiterProfile.id` ownership check (D-03) |
| Race condition — duplicate swipe via concurrent requests | Tampering | DB-level `@@unique` constraint + `$transaction` (SEC-03) |
| Excessive swipe rate (bot/scraping) | DoS | `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` (SEC-05) |
| Location data leakage | Information Disclosure | Never include `lat`/`lng` in any response — only `distanceKm` (D-05, D-06, D-07) |

---

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` — Swipe model, SwipeDirection enum, relations, `@@unique` constraint [VERIFIED: codebase]
- `src/modules/job/job.routes.ts` — RankingItem interface, route patterns [VERIFIED: codebase]
- `src/modules/job/job.service.ts` — ownership check and profile resolution patterns [VERIFIED: codebase]
- `src/modules/job/job.repository.ts` — ARCH-04 pattern: own findRecruiterProfileByUserId [VERIFIED: codebase]
- `src/shared/hooks/authenticate.ts` — JWT payload shape `{ id, role }` [VERIFIED: codebase]
- `src/shared/hooks/requireRole.ts` — requireRole usage [VERIFIED: codebase]
- `src/shared/errors/AppError.ts` — Error class shape [VERIFIED: codebase]
- `src/shared/errors/errorHandler.ts` — P2002 → 409 mapping [VERIFIED: codebase]
- `src/shared/plugins/rate-limit.ts` — Global 60/min; per-route override pattern [VERIFIED: codebase]
- `src/modules/auth/auth.routes.ts` — Per-route rate limit config pattern [VERIFIED: codebase]
- `tests/helpers/factories.ts` — createJob, createCandidate, createCompany factories [VERIFIED: codebase]
- `tests/helpers/setup.ts` — afterEach cleanup already includes swipe.deleteMany() [VERIFIED: codebase]
- `package.json` — all dependencies already present [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- Prisma cursor pagination pattern — standard Prisma docs approach for cursor-based pagination [CITED: prisma.io/docs/concepts/components/prisma-client/pagination]

### Tertiary (LOW confidence)
- None — all claims verified against codebase or are standard algorithms (Haversine)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and verified in package.json
- Architecture: HIGH — all patterns verified against existing codebase modules
- Pitfalls: HIGH — derived from verifiable code patterns and Prisma/Fastify behaviors
- Haversine formula: MEDIUM — standard algorithm, implementation needs runtime test

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (stable stack — 30 days)
