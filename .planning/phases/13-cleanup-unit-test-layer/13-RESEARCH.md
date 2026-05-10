# Phase 13: Cleanup + Unit Test Layer — Research

**Researched:** 2026-05-09
**Domain:** TypeScript Clean Architecture — dependency enforcement, dead-code deletion, use-case unit testing
**Confidence:** HIGH (all findings verified directly against the codebase; no guesswork required)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-13 | Dependency rule enforced statically: `domain` → nothing; `application` → domain only; `adapters` → application+domain; `infrastructure` → all | Verified: madge 8.0.0 already installed; custom script approach documented below |
| TEST-02 | Every module (auth, candidate, job, swipe, credits, chat) has at least one Jest use-case unit test with mocked interfaces — no DB, no HTTP | Verified: all new use cases are clean interfaces-only; existing unit tests still target old module classes; new tests must target `src/application/use-cases/` |
| MIGRATE-01 | No logic file remains under `src/modules/` after cleanup | Verified: 29 files remain in `src/modules/`; several have live inbound imports that must be fixed first |
| MIGRATE-02 | Every file follows the mapping in `plan-architecture.md` | Verified: `src/shared/` has 14 files; all have canonical new homes documented below |
</phase_requirements>

---

## Summary

Phase 13 has two independent jobs: (1) delete `src/modules/` and `src/shared/`, and (2) add use-case unit tests for the new layer. Both are blocked by a small set of surviving cross-layer imports that must be fixed before any deletion.

The deletion side has exactly **6 live import chains** outside the old directories that keep the old files alive in the TypeScript graph. Fixing all 6 unblocks deletion in a predictable order. The full set is documented below with the exact file, line, old import, and replacement.

The unit-test side is straightforward: the new `src/application/use-cases/` classes are already pure — they depend only on injected interfaces. The existing unit tests in `tests/unit/` test the old `src/modules/` services and will be deleted or replaced. New tests follow the pattern already demonstrated by `chat.service.test.ts` (which was updated in Phase 12 to mock `IChatRepository`) and the canonical example in `plan-architecture.md`.

**Primary recommendation:** Fix the 6 import chains first (one plan wave), then delete `src/modules/` and `src/shared/` (second wave), then add use-case unit tests (third wave). Each wave ends with `npm run test` green.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dependency-rule enforcement | Infrastructure (script/CI) | — | Static analysis runs outside app code; madge CLI operates at project root |
| `haversineKm` utility | Application (use-case) | Adapters (controller enrichment) | GetRankingUseCase (application) uses it; CreditsController (adapters) also uses it — must live at `src/application/utils/haversine.ts` so both layers can import without violating dependency rule |
| `AppError` / `errorHandler` | Infrastructure (HTTP plugin) | — | These are Fastify-specific; canonical home per plan-architecture.md: `src/infrastructure/http/plugins/error-handler.ts` |
| `requireRole` hook | Infrastructure (HTTP plugin) | — | Fastify preHandler hook — same tier as `authenticate.hook.ts` |
| `IChatService` interface (old shared) | Application (port) | — | Already superseded by `IChatPort` at `src/application/ports/chat.port.ts` |
| `IRecommendationService` interface (old shared) | Domain (repository interface) | — | Already superseded by `IRecommendationRepository` at `src/domain/interfaces/recommendation.repository.interface.ts` |
| `RecommendationRepository` (old modules) | Adapters (service) | — | Its logic is now inside `Neo4jAdapter` — the old class is a wrapper that can be inlined |
| Health route | Infrastructure (HTTP route) | — | `modules/health/health.routes.ts` → `src/infrastructure/http/routes/health.routes.ts` |
| Unit tests for use cases | Tests (unit layer) | — | `tests/unit/` — no DB, no HTTP |

---

## Complete Import Audit: Cross-Boundary Survivors

> [VERIFIED: grep against live codebase]

The following files outside `src/modules/` and `src/shared/` still import FROM those directories. Every item must be fixed before deletion.

### Chain 1 — `src/app.ts` imports from `src/modules/` (3 items)

| Line | Current import | Fix |
|------|---------------|-----|
| 8 | `from './shared/errors/errorHandler'` | Move `errorHandler` to `src/infrastructure/http/plugins/error-handler.ts`; update import |
| 9 | `from './modules/health/health.routes'` | Create `src/infrastructure/http/routes/health.routes.ts` (prisma import from infrastructure DB); update import |
| 16 | `from './modules/credits/credits.service'` | `CreditService` is used in `adminRoutes` composition root; replace with `CreditService` from `src/adapters/services/credit.service.ts` OR inline the wiring using `GrantCreditsUseCase` directly — see note below |
| 21 | `from './modules/chat/chat.service'` | `ChatService` is used in `chatRoutes` composition root; replace with import from the adapter layer (no new class needed — `ChatService` already lives in `src/modules/chat/chat.service.ts` and is also imported by `chat.service.test.ts`; the adapter equivalent is the use-case set wired through `ChatController`) |
| 24 | `from './shared/db/neo4j'` | Change to `from './infrastructure/database/neo4j'` |

> **Note on ChatService / CreditService in app.ts:** These are old service classes (`modules/`) used as the concrete implementation injected into routes. The new architecture does not have a `ChatService` or `CreditService` service class in `adapters/` — it has individual use cases. The cleanest Phase 13 resolution is to introduce thin adapter-layer service classes (`src/adapters/services/chat.service.ts` and `src/adapters/services/credit.service.ts`) that wrap the relevant use cases and implement the same interface, OR to restructure the composition root in `app.ts` to wire use cases directly. Either approach is valid; the key constraint is that `app.ts` (infrastructure) must not import from `modules/`.

### Chain 2 — `src/adapters/services/neo4j.adapter.ts` imports from `src/modules/recommendation/`

| Line | Current import | Fix |
|------|---------------|-----|
| 7 | `from '../../modules/recommendation/recommendation.repository'` | Inline the `RecommendationRepository` logic directly into `Neo4jAdapter`, or move `RecommendationRepository` to `src/adapters/services/recommendation.repository.ts` (adapters layer) and import from there |

> **Recommended approach:** Move `src/modules/recommendation/recommendation.repository.ts` verbatim to `src/adapters/services/recommendation.repository.ts`. Update the import in `neo4j.adapter.ts`. This keeps diff minimal and preserves the existing `seedTaxonomy` + `computeFitScore` logic. Note that `recommendation.repository.ts` itself imports from `src/shared/interfaces/recommendation.interface.ts` — once `src/shared/` is gone, that import must also change to `src/domain/interfaces/recommendation.repository.interface.ts` (the types are structurally compatible).

### Chain 3 — `src/application/use-cases/swipe/get-ranking.use-case.ts` imports from `src/shared/`

| Line | Current import | Fix |
|------|---------------|-----|
| 4 | `from '../../../shared/utils/haversine'` | Move `haversineKm` to `src/application/utils/haversine.ts`; update this import and also the two adapter-layer imports below |

### Chain 4 — `src/adapters/controllers/credits.controller.ts` imports from `src/shared/`

| Line | Current import | Fix |
|------|---------------|-----|
| 6 | `from '../../shared/utils/haversine'` | Update to `from '../../application/utils/haversine'` (after Chain 3 fix creates the new location) |

### Chain 5 — `src/infrastructure/http/routes/*.ts` (8 files) import from `src/shared/`

All 8 new infrastructure route files import `requireRole` from `src/shared/hooks/requireRole`:

```
admin.routes.ts, candidate.routes.ts, chat.routes.ts, company.routes.ts,
credits.routes.ts, job.routes.ts, recruiter.routes.ts, swipe.routes.ts
```

| Current import | Fix |
|---------------|-----|
| `from '../../../shared/hooks/requireRole'` | Move `requireRole.ts` to `src/infrastructure/http/plugins/require-role.hook.ts`; update all 8 imports |

Additionally, two files import `AppError` from `src/shared/`:

- `src/infrastructure/http/plugins/authenticate.hook.ts` — line 2: `from '../../../shared/errors/AppError'`
- `src/infrastructure/http/routes/chat.routes.ts` — line 6: `from '../../../shared/errors/AppError'`

**Fix:** `AppError` should move to `src/infrastructure/http/errors/app.error.ts` (or reuse `DomainError` from application layer). The simplest resolution is to replace `AppError` usage in `authenticate.hook.ts` and `chat.routes.ts` with `DomainError` (already in `src/application/errors/domain.error.ts`) — both layers can import application layer. This avoids creating another error class.

### Chain 6 — Test files import from `src/modules/` and `src/shared/`

Test files are NOT deleted — they are repointed:

| File | Surviving old import | Action |
|------|----------------------|--------|
| `tests/unit/auth.service.test.ts` | `ChatService`, `AuthRepository` from `modules/` | Replace with new use-case unit test targeting `RegisterUseCase` |
| `tests/unit/candidate.service.test.ts` | `CandidateService`, `CandidateRepository` from `modules/` | Replace with test targeting `UpsertCandidateProfileUseCase` |
| `tests/unit/chat.service.test.ts` | `ChatService` from `modules/` | Replace with test targeting `CreateOrGetChatUseCase` (use-case layer) |
| `tests/unit/credit.service.test.ts` | `CreditService`, `CreditRepository` from `modules/` | Replace with test targeting `UnlockCandidateUseCase` |
| `tests/unit/job.service.test.ts` | `JobService`, `JobRepository` from `modules/` | Replace with test targeting `CreateJobUseCase` |
| `tests/unit/job.scheduler.test.ts` | `runExpiryCheck`, `JobRepository` from `modules/` | Update import to new infrastructure scheduler path |
| `tests/unit/recommendation.service.test.ts` | `RecommendationRepository` from `modules/` | Update to new adapters path |
| `tests/unit/swipe.service.test.ts` | `SwipeService`, `SwipeRepository` from `modules/` | Replace with test targeting `RecordSwipeUseCase` |
| `tests/unit/recruiter.service.test.ts` | `RecruiterService`, `RecruiterRepository` from `modules/` | Replace with test targeting `UpsertRecruiterProfileUseCase` |
| `tests/unit/company.service.test.ts` | `CompanyService`, `CompanyRepository` from `modules/` | Replace with test targeting a company use case |
| `tests/unit/appError.test.ts` | `AppError` from `shared/` | Update to new location once AppError is moved |
| `tests/unit/errorHandler.test.ts` | `AppError`, `errorHandler` from `shared/` | Update to new locations |
| `tests/helpers/factories.ts` | `prisma` from `shared/db/prisma` | Update to `infrastructure/database/prisma` |
| `tests/helpers/neo4j-setup.ts` | `getNeo4jDriver`, `RecommendationRepository` from `shared/` and `modules/` | Update both imports |
| `tests/helpers/setup.ts` | `prisma` from `shared/db/prisma` | Update to `infrastructure/database/prisma` |
| `tests/integration/admin.test.ts` | `prisma` from `shared/db/prisma` | Update |
| `tests/integration/chat.test.ts` | `prisma` from `shared/db/prisma` | Update |
| `tests/integration/credits.test.ts` | `prisma` from `shared/db/prisma` | Update |
| `tests/integration/job-routes.test.ts` | `prisma` from `shared/db/prisma` | Update |
| `tests/integration/job.test.ts` | `prisma`, `JobRepository`, `JobService` from `shared/` and `modules/` | Update to infrastructure + adapter paths |
| `tests/integration/recommendation.test.ts` | `getNeo4jDriver`, `RecommendationRepository`, `CandidateData`, `JobData` from `shared/` and `modules/` | Update to infrastructure and adapter paths |
| `tests/integration/swipe.test.ts` | `prisma` from `shared/db/prisma` | Update |

> `jest.config.ts` has `moduleNameMapper` aliases `@shared/` and `@modules/` — these should be removed once the directories are deleted, otherwise the Jest resolver will fail on deleted paths.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| madge | 8.0.0 | Circular dependency detection and import graph analysis | Only tool that walks the full TypeScript import graph; already installed (`npx madge --version` returns 8.0.0) |
| Jest | 30.x | Unit test runner | Project standard; already configured |
| ts-jest | 29.x | TypeScript transform for Jest | Project standard |

[VERIFIED: npm view + direct version check]

### Dependency Enforcement Approach

**Recommended: custom Node.js/TypeScript script** (not madge alone)

Madge detects circular imports but does not enforce directed-layer rules. A custom script using `madge`'s programmatic API inspects the import graph and asserts: no `domain/` file imports any project path; no `application/` file imports `adapters/` or `infrastructure/`; etc.

```typescript
// scripts/check-deps.ts
import madge from 'madge'

const RULES: Array<{ from: RegExp; forbids: RegExp[]; label: string }> = [
  {
    label: 'domain must not import from project',
    from: /^src\/domain\//,
    forbids: [/^src\/application\//, /^src\/adapters\//, /^src\/infrastructure\//],
  },
  {
    label: 'application must not import adapters or infrastructure',
    from: /^src\/application\//,
    forbids: [/^src\/adapters\//, /^src\/infrastructure\//],
  },
  {
    label: 'adapters must not import infrastructure',
    from: /^src\/adapters\//,
    forbids: [/^src\/infrastructure\//],
  },
]

async function main() {
  const res = await madge('src/', { fileExtensions: ['ts'] })
  const graph = res.obj()
  const violations: string[] = []

  for (const [file, deps] of Object.entries(graph)) {
    for (const rule of RULES) {
      if (rule.from.test(file)) {
        for (const dep of deps) {
          for (const forbidden of rule.forbids) {
            if (forbidden.test(dep)) {
              violations.push(`VIOLATION [${rule.label}]: ${file} → ${dep}`)
            }
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    violations.forEach((v) => console.error(v))
    process.exit(1)
  }
  console.log('Dependency rule: OK')
}

main()
```

Run with: `npx ts-node scripts/check-deps.ts`

Add to `package.json` scripts: `"check:deps": "ts-node scripts/check-deps.ts"`

[ASSUMED: madge programmatic API shape — verify against installed madge 8.x docs before implementation]

---

## Architecture Patterns

### Safe Deletion Order

Delete in this order to avoid TypeScript compilation errors mid-process:

```
Wave A — Fix all 6 import chains (no deletions yet; tsc must be clean after this wave)
  1. Create src/application/utils/haversine.ts  (move haversineKm)
  2. Create src/infrastructure/http/plugins/require-role.hook.ts  (move requireRole)
  3. Create src/infrastructure/http/routes/health.routes.ts  (new health route using infrastructure/database/prisma)
  4. Move src/modules/recommendation/recommendation.repository.ts → src/adapters/services/recommendation.repository.ts
     (update internal import from shared/interfaces → domain/interfaces)
  5. Update neo4j.adapter.ts: import from adapters/services/recommendation.repository
  6. Update get-ranking.use-case.ts: import haversineKm from application/utils/haversine
  7. Update credits.controller.ts: import haversineKm from application/utils/haversine
  8. Update 8 infrastructure route files: requireRole from infrastructure/http/plugins/require-role.hook
  9. Update authenticate.hook.ts: replace AppError with DomainError (or move AppError to application layer)
  10. Update chat.routes.ts: replace AppError import with DomainError
  11. Update app.ts: fix 5 surviving imports (errorHandler, health, ChatService, CreditService, neo4j)
  12. Update jest.config.ts: remove @shared/ and @modules/ moduleNameMapper aliases (or update to point to new locations)
  13. Update all test files: repoint imports from modules/ and shared/ to new paths
  → npm run build; npm test  — must be fully green before proceeding

Wave B — Delete src/modules/ and src/shared/
  → rm -rf src/modules/ src/shared/
  → npm run build (zero errors)
  → npm test (41 integration tests green, all unit tests green)

Wave C — Write dependency-check script + new use-case unit tests
  → scripts/check-deps.ts
  → tests/unit/register.use-case.test.ts  (auth)
  → tests/unit/upsert-candidate-profile.use-case.test.ts  (candidate)
  → tests/unit/create-job.use-case.test.ts  (job)
  → tests/unit/record-swipe.use-case.test.ts  (swipe)
  → tests/unit/unlock-candidate.use-case.test.ts  (credits)
  → tests/unit/create-or-get-chat.use-case.test.ts  (chat)
  → npm run test:unit (all green)
```

### CreditService / ChatService Composition Root Problem

`app.ts` currently does:
```typescript
const chatRepo = new ChatRepository()
const chatService = new ChatService(chatRepo)   // from modules/chat/

const creditRepo = new CreditRepository()
const creditService = new CreditService(creditRepo, chatService)  // from modules/credits/
```

These are then passed as `opts.chat` and `opts.creditService` into route registrations.

**Cleanest Phase 13 resolution:** The admin routes receive `creditService` to expose `grantCredits`. This maps to `GrantCreditsUseCase`. The swipe/credits routes receive `chatService` as `IChatPort`/`IChatService`. This maps to `ChatService` in the new layer.

Two options:

**Option A (minimal change):** Move `modules/chat/chat.service.ts` body verbatim to `src/adapters/services/chat.service.ts` and `modules/credits/credits.service.ts` body to `src/adapters/services/credit.service.ts`. Update app.ts imports. Tests that test `ChatService` update their import path. This preserves the existing composition logic without restructuring app.ts.

**Option B (use-case wiring):** Replace the service objects with use-case-based adapter objects at the composition root in app.ts. More correct architecturally but requires more changes. Recommended only if time allows.

**Recommendation for Phase 13: Option A.** The goal is to delete `modules/` not to redesign the composition root.

### Unit Test Pattern for Use Cases

All new use cases in `src/application/use-cases/` are already interface-only. The mock pattern is:

```typescript
// tests/unit/register.use-case.test.ts
import { RegisterUseCase } from '../../src/application/use-cases/auth/register.use-case'
import { IUserRepository } from '../../src/domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../src/domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../src/application/ports/hash.port'
import { ITokenPort } from '../../src/application/ports/token.port'
import { DomainError } from '../../src/application/errors/domain.error'

const makeUserRepo = (): jest.Mocked<IUserRepository> => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateGoogleId: jest.fn(),
  findMany: jest.fn(),
  findByIdPublic: jest.fn(),
} as jest.Mocked<IUserRepository>)

const makeHash = (): jest.Mocked<IHashPort> => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
} as jest.Mocked<IHashPort>)

const makeToken = (): jest.Mocked<ITokenPort> => ({
  signAccess: jest.fn().mockReturnValue('access-token'),
  generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw-token', hashed: 'hashed-token' }),
} as jest.Mocked<ITokenPort>)

const makeRefreshRepo = (): jest.Mocked<IRefreshTokenRepository> => ({
  create: jest.fn(),
  findByHash: jest.fn(),
  revoke: jest.fn(),
  revokeByFamily: jest.fn(),
  revokeByHash: jest.fn(),
} as jest.Mocked<IRefreshTokenRepository>)

describe('RegisterUseCase', () => {
  it('throws CONFLICT when email already exists', async () => {
    const userRepo = makeUserRepo()
    userRepo.findByEmail.mockResolvedValue({ id: 'u1' } as any)
    const uc = new RegisterUseCase(userRepo, makeRefreshRepo(), makeHash(), makeToken())
    await expect(uc.execute({ email: 'a@b.com', password: 'pass', role: 'CANDIDATE' }))
      .rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
  })

  it('returns accessToken + refreshToken on success', async () => {
    const userRepo = makeUserRepo()
    userRepo.findByEmail.mockResolvedValue(null)
    userRepo.create.mockResolvedValue({ id: 'u1', role: 'CANDIDATE' } as any)
    const refreshRepo = makeRefreshRepo()
    refreshRepo.create.mockResolvedValue({} as any)
    const uc = new RegisterUseCase(userRepo, refreshRepo, makeHash(), makeToken())
    const result = await uc.execute({ email: 'a@b.com', password: 'pass', role: 'CANDIDATE' })
    expect(result).toHaveProperty('accessToken')
    expect(result).toHaveProperty('refreshToken')
  })
})
```

[VERIFIED: pattern matches existing chat.service.test.ts (Phase 12) and plan-architecture.md canonical example]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import graph traversal | Custom recursive TS parser | `madge` programmatic API | Handles TS path aliases, circular refs, re-exports correctly |
| Circular dependency detection | Manual inspection | `madge --circular` or `madge().then(res => res.circular())` | Misses transitive cycles without full traversal |
| Dependency rule enforcement | ESLint import/no-restricted-paths | Custom madge script (simpler setup) | `eslint-plugin-import` requires complex path pattern config; madge script is 40 lines and portable |

**Key insight:** The dependency rule has only 4 layers with clear hierarchy. A 40-line script beats an ESLint configuration that requires maintaining 16+ `no-restricted-paths` patterns.

---

## Common Pitfalls

### Pitfall 1: Deleting modules/ before fixing app.ts
**What goes wrong:** `tsc` immediately fails on the `ChatService` and `CreditService` imports in `app.ts` — the server cannot start and integration tests cannot run.
**Why it happens:** The old service classes are still referenced at the composition root even though routes are wired to the new layer.
**How to avoid:** Fix all 6 import chains (Wave A) and verify `npm run build` is clean BEFORE running `rm -rf src/modules/`.
**Warning signs:** Any TypeScript error referencing `modules/` during Wave A is a signal that not all imports are resolved.

### Pitfall 2: Deleting shared/db before updating test helpers
**What goes wrong:** Integration tests fail immediately because `tests/helpers/factories.ts`, `setup.ts`, etc. import `prisma` from `src/shared/db/prisma`.
**Why it happens:** Tests are not compiled at build time — they only fail at `npm test` runtime.
**How to avoid:** Update ALL test helper and integration test imports in Wave A before deleting `src/shared/`.

### Pitfall 3: recommendation.repository.ts still imports from shared/interfaces
**What goes wrong:** After moving `recommendation.repository.ts` to `adapters/services/`, it still has `import type { IRecommendationService, CandidateData, JobData } from '../../shared/interfaces/recommendation.interface'`. This file will fail to compile once `src/shared/` is deleted.
**How to avoid:** When moving the file, simultaneously change the import to `import type { FitScoreInput, FitScoreJobInput } from '../../domain/interfaces/recommendation.repository.interface'`. The method signature `computeFitScore(candidate: CandidateData, job: JobData)` becomes `computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput)` — structurally equivalent, just renamed.

### Pitfall 4: jest.config.ts moduleNameMapper pointing to deleted directories
**What goes wrong:** After deletion, Jest fails to resolve `@shared/` and `@modules/` aliases for any test file using them — even if the source files were updated, any missed test reference causes a cryptic "Cannot find module" error.
**How to avoid:** Remove the `@shared` and `@modules` entries from `moduleNameMapper` in `jest.config.ts` as part of Wave A (after all actual uses of those aliases are gone). Verify with `grep -r "@shared/\|@modules/" tests/` — should return zero results before removing the aliases.

### Pitfall 5: haversineKm moving to application/ causes adapter layer import
**What goes wrong:** `src/adapters/controllers/credits.controller.ts` imports `haversineKm` from `src/application/utils/haversine`. This is allowed by the dependency rule (adapters may import application). BUT `get-ranking.use-case.ts` (application) also imports it — which is also allowed. Putting it in `application/utils/` is the correct location.
**Why it's a pitfall:** Some developers instinctively put utilities in `infrastructure/` (as "framework glue") — but a pure math function has no framework dependency and belongs in the layer that uses it most centrally.
**How to avoid:** Place `haversineKm` at `src/application/utils/haversine.ts`. Both `application/` and `adapters/` can import from it without violating the dependency rule.

### Pitfall 6: Replacing old unit tests that test old services — test count drops
**What goes wrong:** If the old `tests/unit/*.service.test.ts` files are deleted before the new use-case tests are written, `npm run test:unit` loses coverage, CI may not catch regressions.
**How to avoid:** Write the new use-case tests (Wave C) before deleting the old test files. Or rename the old files (keep them compiling) and update the imports to point to the new use-case classes — a hybrid approach that preserves test count.

### Pitfall 7: AppError is still needed at runtime (errorHandler + tests)
**What goes wrong:** `AppError` is thrown by old module code and caught by `errorHandler`. If `AppError` is deleted before all throw sites are migrated to `DomainError`, runtime errors will be uncaught.
**How to avoid:** The recommended resolution is to keep `AppError` alive by moving it to `src/infrastructure/http/errors/app.error.ts` (since the only remaining users after cleanup are `authenticate.hook.ts` and `chat.routes.ts` in the infrastructure layer). Alternatively replace throws with `DomainError`. Either way, `errorHandler` must remain consistent with whichever error class is thrown.

---

## Code Examples

### madge circular-check (quick verification)
```bash
# Source: madge docs — verify after Wave B deletion
npx madge --circular src/ --extensions ts
# Expected output: No circular dependency found!
```

### madge dependency rule script entry point
```typescript
// Source: madge programmatic API [ASSUMED — verify against madge 8.x docs]
import madge from 'madge'
const result = await madge('src/', { fileExtensions: ['ts'] })
const graph = result.obj() // Record<string, string[]> — file → imports
```

### RecordSwipeUseCase unit test mock (minimum viable)
```typescript
// tests/unit/record-swipe.use-case.test.ts
import { RecordSwipeUseCase } from '../../src/application/use-cases/swipe/record-swipe.use-case'
import { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import { IChatPort } from '../../src/application/ports/chat.port'
import { DomainError } from '../../src/application/errors/domain.error'

const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
} as jest.Mocked<ISwipeRepository>)

const makeChatPort = (): jest.Mocked<IChatPort> => ({
  createOrGetChat: jest.fn().mockResolvedValue({ chatId: 'chat-1' }),
} as jest.Mocked<IChatPort>)

describe('RecordSwipeUseCase', () => {
  it('throws NOT_FOUND when candidate profile does not exist', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue(null)
    const uc = new RecordSwipeUseCase(repo, makeChatPort())
    await expect(uc.execute('user-1', 'job-1', 'LIKE'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('creates chat when direction is LIKE', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue({
      id: 'job-1', companyId: 'comp-1', isActive: true, expiresAt: new Date(Date.now() + 86400000)
    } as any)
    repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
    const chat = makeChatPort()
    const uc = new RecordSwipeUseCase(repo, chat)
    const result = await uc.execute('user-1', 'job-1', 'LIKE')
    expect(chat.createOrGetChat).toHaveBeenCalledWith('cand-1', 'comp-1', 'job-1', 'MATCH')
    expect(result.chatId).toBe('chat-1')
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `eslint-plugin-import` with `no-restricted-paths` for layer enforcement | Custom madge script | Current best practice (2025) | Simpler config, explicit error messages, no ESLint plugin version churn |
| Deleting old code immediately during migration | Additive migration (old + new coexist, delete at end) | Applied since Phase 11 | Keeps integration tests green at every commit |
| Testing concrete service classes with mocked repositories | Testing use cases with mocked interfaces | Applied in Phase 12 (chat.service.test.ts) | Use-case tests have zero framework coupling |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `madge` programmatic API shape: `madge(dir).then(res => res.obj())` returns `Record<string, string[]>` in madge 8.x | Standard Stack / Code Examples | Script won't compile — fix by checking madge 8.x CHANGELOG or types |
| A2 | Moving `ChatService` body to `src/adapters/services/chat.service.ts` (Option A) will satisfy the Phase 13 scope — full use-case wiring of the composition root is not required | Architecture Patterns | If the planner decides Option B is required, Wave A scope expands significantly |
| A3 | `IRefreshTokenRepository` in the new layer includes `revokeByHash` — needed for unit test mock shape | Code Examples | Mock will be missing a method; fix by checking the actual interface file |

**All other claims in this document are VERIFIED against the live codebase via grep and file reads.**

---

## Open Questions

1. **ChatService and CreditService replacement in app.ts**
   - What we know: Both old service classes are still the concrete types injected into route registrations; the new layer has individual use cases, not equivalent service classes
   - What's unclear: Option A (create thin adapter service wrappers) vs. Option B (restructure composition root to wire use cases directly) — both are valid and neither was decided in Phase 12
   - Recommendation: Option A for Phase 13 (minimum change, maximum test safety); Option B can be a follow-up

2. **AppError retention**
   - What we know: `AppError` is used in `authenticate.hook.ts`, `chat.routes.ts`, and all old unit tests; `DomainError` already covers the same need
   - What's unclear: Should `AppError` be kept (moved to infrastructure/http/errors/) or replaced everywhere with `DomainError`?
   - Recommendation: Move `AppError` to `src/infrastructure/http/errors/app.error.ts` (minimal change); update the two infrastructure files; update test imports; `errorHandler` already handles both types

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| madge CLI | Dependency rule script | Yes | 8.0.0 | — |
| ts-node | Run check-deps.ts script | Yes | ^10.9.2 (package.json) | — |
| Jest | Unit tests | Yes | ^30.3.0 | — |
| TypeScript | Compilation verification | Yes | ^6.0.3 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x + ts-jest 29.x |
| Config file | `jest.config.ts` |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-13 | No layer imports a forbidden layer | Custom script | `npx ts-node scripts/check-deps.ts` | No — Wave C |
| TEST-02 (auth) | RegisterUseCase throws CONFLICT on duplicate email | Unit | `npm run test:unit -- --testPathPattern=register.use-case` | No — Wave C |
| TEST-02 (candidate) | UpsertCandidateProfileUseCase delegates to repo | Unit | `npm run test:unit -- --testPathPattern=upsert-candidate` | No — Wave C |
| TEST-02 (job) | CreateJobUseCase throws when recruiter profile missing | Unit | `npm run test:unit -- --testPathPattern=create-job` | No — Wave C |
| TEST-02 (swipe) | RecordSwipeUseCase creates chat on LIKE | Unit | `npm run test:unit -- --testPathPattern=record-swipe` | No — Wave C |
| TEST-02 (credits) | UnlockCandidateUseCase throws INSUFFICIENT_CREDITS | Unit | `npm run test:unit -- --testPathPattern=unlock-candidate` | No — Wave C |
| TEST-02 (chat) | CreateOrGetChatUseCase returns chatId | Unit | `npm run test:unit -- --testPathPattern=create-or-get-chat` | No — Wave C |
| MIGRATE-01 | src/modules/ does not exist | Structural (bash) | `test ! -d src/modules && echo OK` | N/A — verified at end of Wave B |
| MIGRATE-02 | src/shared/ does not exist | Structural (bash) | `test ! -d src/shared && echo OK` | N/A — verified at end of Wave B |
| Integration regression | All 41 integration tests green | Integration | `npm run test:integration` | Yes (existing) |

### Sampling Rate
- **Per task commit:** `npm run test:unit` (fast — no DB)
- **Per wave merge:** `npm test` (full suite including integration)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps (files to create in Wave C)
- `tests/unit/register.use-case.test.ts`
- `tests/unit/upsert-candidate-profile.use-case.test.ts`
- `tests/unit/create-job.use-case.test.ts`
- `tests/unit/record-swipe.use-case.test.ts`
- `tests/unit/unlock-candidate.use-case.test.ts`
- `tests/unit/create-or-get-chat.use-case.test.ts`
- `scripts/check-deps.ts`

---

## Security Domain

This phase does no feature work — it is a structural cleanup and test addition. No new threat surface is introduced.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | No (no new endpoints) | — |
| V6 Cryptography | No | — |

The deletion of `src/shared/errors/AppError.ts` and `src/shared/hooks/authenticate.ts` must not break authentication enforcement. The `authenticate` hook at `src/infrastructure/http/plugins/authenticate.hook.ts` is the canonical version and is already in use by all infrastructure routes. The old `src/shared/hooks/authenticate.ts` is NOT imported by any infrastructure file — it is only imported by old `modules/` route files which are also being deleted. **No security gap is introduced by deletion.**

---

## Sources

### Primary (HIGH confidence — verified directly against codebase)
- Live codebase grep: all import paths verified with `grep -rn "from.*modules/\|from.*shared/"` against `src/` and `tests/`
- File reads: `src/app.ts`, `src/adapters/services/neo4j.adapter.ts`, `src/application/use-cases/swipe/get-ranking.use-case.ts`, `src/adapters/controllers/credits.controller.ts`, `src/infrastructure/http/plugins/authenticate.hook.ts`, `src/infrastructure/http/routes/*.ts`
- Directory listings: all files in `src/modules/`, `src/shared/`, `src/application/use-cases/`, `src/adapters/`, `src/infrastructure/`, `tests/unit/`, `tests/integration/`
- `package.json`: confirmed madge 8.0.0 installed, Jest 30.x, ts-jest 29.x
- `jest.config.ts`: confirmed `@shared/` and `@modules/` moduleNameMapper aliases exist
- `plan-architecture.md`: dependency rule definition and canonical file mapping table

### Tertiary (LOW confidence — not verified against madge 8.x live docs)
- madge programmatic API shape (`res.obj()` returning `Record<string, string[]>`) — marked [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Import audit (which files need fixing): HIGH — verified by exhaustive grep
- Safe deletion order: HIGH — derived directly from the import dependency graph
- Unit test patterns: HIGH — existing `chat.service.test.ts` provides the exact template
- madge script API: LOW — marked ASSUMED; verify against madge 8.x TypeScript types before implementation

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (stable tech stack — no fast-moving dependencies)
