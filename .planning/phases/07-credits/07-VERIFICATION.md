---
phase: 07-credits
verified: 2026-05-02T21:15:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the full test suite: npm test"
    expected: "All tests GREEN — unit (credit.service, swipe.service), integration (credits, admin, swipe)"
    why_human: "Cannot execute npm test in this environment. All artifacts exist and are substantively wired, but final pass/fail of all test cases requires the actual test runner against the real DB."
  - test: "POST /jobs/:jobId/candidates/:candidateId/unlock with valid RECRUITER token, DISLIKE swipe, credits >= 2"
    expected: "201 with body containing candidateId, jobId, companyId, creditsCost=2 (FREE plan), and profile.name"
    why_human: "End-to-end HTTP behavior with real DB requires running the server."
  - test: "GET /admin/companies/:id/transactions after a credit grant"
    expected: "200 with array containing at least one record where reason='admin_grant'"
    why_human: "End-to-end HTTP behavior with real DB requires running the server."
---

# Phase 7: Credits Verification Report

**Phase Goal:** Companies can spend credits to unlock censored candidates; every transaction is audited
**Verified:** 2026-05-02T21:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Recruiter can call the unlock endpoint for a DISLIKE candidate and the candidate's full profile becomes visible | VERIFIED | `POST /:jobId/candidates/:candidateId/unlock` in `credits.routes.ts`; guard chain in `CreditService.unlockCandidate` checks swipe.direction === 'DISLIKE'; route returns full profile shape with name, skills, bio, distanceKm; SwipeService.getRanking reveals unlocked DISLIKE profiles via `unlockedCandidateIds.has(swipe.candidateId)` |
| 2 | Unlock deducts the correct credit amount from the company's balance | VERIFIED | `CreditRepository.executeUnlock` runs `$transaction` with `tx.company.update({ data: { credits: { decrement: creditsCost } } })`; cost resolved via `UNLOCK_COST_BY_PLAN[plan] ?? UNLOCK_COST_BY_PLAN['FREE']` (FREE=2, PRO=1); integration test "company.credits decrementado em 2" validates this against real DB |
| 3 | An unlock attempt when the company has insufficient credits is rejected with 402 | VERIFIED | `CreditRepository.executeUnlock` throws `new Error('INSUFFICIENT_CREDITS')` when `company.credits < creditsCost` inside `$transaction`; `CreditService.unlockCandidate` catch block converts it to `AppError(402, 'INSUFFICIENT_CREDITS')`; integration test "402 INSUFFICIENT_CREDITS quando saldo é insuficiente" covers this path |
| 4 | Every credit deduction and admin grant is recorded in the transaction audit log | VERIFIED | `CreditRepository.executeUnlock` creates `tx.creditTransaction({ data: { companyId, amount: -creditsCost, reason: 'candidate_unlock' } })` inside the same atomic transaction; `CreditRepository.grantCredits` creates `tx.creditTransaction({ data: { companyId, amount, reason } })`; `GET /admin/companies/:id/transactions` endpoint in `admin.routes.ts` reads from `prisma.creditTransaction.findMany`; 3 integration tests cover audit log retrieval |
| 5 | Admin can grant credits to a company and the balance updates immediately | VERIFIED | `PATCH /admin/companies/:id/credits` in `admin.routes.ts` calls `service.adjustCredits`; `AdminService.adjustCredits` delegates to `this.creditService.grantCredits(companyId, amount, 'admin_grant')`; `CreditRepository.grantCredits` runs `$transaction` with `tx.company.update({ data: { credits: { increment: amount } } })` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | Unlock model with `@@unique([companyId, candidateId, jobId])` | VERIFIED | Model exists at lines 182-194; `@@unique([companyId, candidateId, jobId])` present; back-references `unlocks Unlock[]` on Company (line 107), CandidateProfile (line 80), Job (line 131) |
| `src/modules/credits/credits.constants.ts` | UNLOCK_COST_BY_PLAN constant | VERIFIED | Exports `UNLOCK_COST_BY_PLAN: Record<string, number>` with FREE=2, PRO=1; 4 lines, substantive |
| `src/modules/credits/credits.repository.ts` | CreditRepository with all DB methods | VERIFIED | 68 lines; exports `CreditRepository`; all required methods present: `findRecruiterByUserId`, `findJobById`, `findSwipe`, `findUnlock`, `findCandidateProfileById`, `executeUnlock`, `grantCredits` |
| `src/modules/credits/credits.service.ts` | CreditService with unlockCandidate and grantCredits | VERIFIED | 45 lines; exports `CreditService`; full 6-step guard chain; P2002 + INSUFFICIENT_CREDITS error mapping; does NOT import prisma directly |
| `src/modules/credits/credits.routes.ts` | creditsJobRoutes with POST unlock endpoint | VERIFIED | 55 lines; exports `creditsJobRoutes`; Zod UUID param validation; `preHandler: [authenticate, requireRole('RECRUITER')]`; builds full D-05 response with distanceKm |
| `src/modules/admin/admin.service.ts` | AdminService with ICreditService injection | VERIFIED | 49 lines; `ICreditService` interface defined; constructor injection; `adjustCredits` delegates to `this.creditService.grantCredits`; no inline `$transaction` |
| `src/modules/admin/admin.routes.ts` | GET /admin/companies/:id/transactions route | VERIFIED | Imports `CreditRepository` and `CreditService`; injects `new AdminService(creditService)`; `GET /companies/:id/transactions` with `requireRole('ADMIN')` guard; queries `prisma.creditTransaction.findMany` |
| `src/modules/swipe/swipe.repository.ts` | findUnlocksByJobAndCompany method | VERIFIED | Method at line 50-58; queries `prisma.unlock.findMany`; returns `Set<string>`; ARCH-04 compliant — no import from credits module |
| `src/modules/swipe/swipe.service.ts` | getRanking reveals unlocked DISLIKE candidates | VERIFIED | `unlockedCandidateIds` at line 98-101; profile ternary at line 129-141 uses `swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)` |
| `src/shared/utils/haversine.ts` | haversineKm shared utility | VERIFIED | Exports `haversineKm`; 17 lines; used by `credits.routes.ts` |
| `tests/unit/credit.service.test.ts` | Unit tests for CreditService | VERIFIED | 140 lines (above 80 minimum); 11 test cases across all guard paths and cost tiers |
| `tests/integration/credits.test.ts` | Integration tests for unlock endpoint | VERIFIED | 226 lines (above 120 minimum); 11 test cases covering happy path + all 7 error paths |
| `tests/helpers/factories.ts` | createUnlock factory function | VERIFIED | `export async function createUnlock(` at line 118 |
| `tests/helpers/setup.ts` | Unlock teardown before creditTransaction | VERIFIED | `prisma.unlock.deleteMany()` at line 23 — before `prisma.creditTransaction.deleteMany()` at line 24 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `credits.service.ts` | `credits.repository.ts` | constructor injection | WIRED | `constructor(private readonly repo: CreditRepository)` — line 7 |
| `credits.service.ts` | `credits.constants.ts` | UNLOCK_COST_BY_PLAN import | WIRED | `import { UNLOCK_COST_BY_PLAN } from './credits.constants'` + used at line 24 |
| `credits.repository.ts executeUnlock` | `prisma.$transaction` | atomic write | WIRED | `prisma.$transaction(async (tx) => { ... })` with balance check as first operation inside callback |
| `src/app.ts` | `credits.routes.ts` | registration under /jobs prefix | WIRED | Import at line 16; `await app.register(creditsJobRoutes, { prefix: '/jobs' })` at line 45 |
| `credits.routes.ts` | `credits.service.ts` | instantiation in route factory | WIRED | `const repo = new CreditRepository(); const service = new CreditService(repo)` |
| `POST /jobs/:jobId/candidates/:candidateId/unlock` | `CreditService.unlockCandidate` | route handler | WIRED | `await service.unlockCandidate(request.user.id, jobId, candidateId)` |
| `admin.routes.ts` | `credits.service.ts` | CreditService injected into AdminService | WIRED | `new AdminService(creditService)` — confirmed at line 22 |
| `swipe.service.ts` | `swipe.repository.ts` | findUnlocksByJobAndCompany call | WIRED | `this.repo.findUnlocksByJobAndCompany(jobId, recruiterProfile.companyId)` at line 98-101 |
| `GET /jobs/:jobId/ranking` | `Unlock table` | SwipeRepository.findUnlocksByJobAndCompany | WIRED | `prisma.unlock.findMany({ where: { jobId, companyId } })` at line 53 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `credits.routes.ts` (POST unlock response) | `unlock` | `CreditRepository.executeUnlock` → `prisma.$transaction` → `tx.unlock.create` | Yes — DB write returning created record | FLOWING |
| `credits.routes.ts` (profile in response) | `candidateProfile` | `repo.findCandidateProfileById(candidateId)` → `prisma.candidateProfile.findUnique` | Yes — real DB query with user join | FLOWING |
| `admin.routes.ts` (GET transactions) | `transactions` | `prisma.creditTransaction.findMany({ where: { companyId: id } })` | Yes — real DB query ordered by createdAt | FLOWING |
| `swipe.service.ts getRanking` (profile reveal) | `unlockedCandidateIds` | `this.repo.findUnlocksByJobAndCompany` → `prisma.unlock.findMany` | Yes — real DB query returning Set<string> | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — cannot start server or run tests against real DB in this verification environment. Items requiring server execution are routed to human verification.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| CREDIT-01 | 07-01, 07-02 | Empresa pode usar créditos para desbloquear perfil de candidato que deu DISLIKE | SATISFIED | POST unlock endpoint with guard chain and DB-backed unlock creation; ranking reveal wired |
| CREDIT-02 | 07-01, 07-02 | Cada desbloqueio desconta créditos do saldo da empresa | SATISFIED | `credits: { decrement: creditsCost }` inside atomic `$transaction` |
| CREDIT-03 | 07-01, 07-03 | Transações de crédito são registradas (audit log) | SATISFIED | `creditTransaction.create` in both `executeUnlock` and `grantCredits`; `GET /admin/companies/:id/transactions` reads log |
| CREDIT-04 | 07-01, 07-03 | Admin pode adicionar créditos a uma empresa | SATISFIED | `PATCH /admin/companies/:id/credits` delegates to `AdminService.adjustCredits` → `CreditService.grantCredits` → atomic `$transaction` |
| SEC-03 | 07-01, 07-02, 07-03 | Operações de crédito e swipe executadas em transações atômicas | SATISFIED | `CreditRepository.executeUnlock` and `grantCredits` both use `prisma.$transaction`; balance check is first op inside callback (TOCTOU mitigated) |
| ARCH-01 | 07-01, 07-02 | Cada módulo segue Clean Architecture — routes → service → repository | SATISFIED | `credits.routes.ts` → `CreditService` → `CreditRepository`; no layer skipping |
| ARCH-04 | 07-01, 07-03 | Módulos não importam diretamente de outros módulos | SATISFIED | `swipe.service.ts` has zero imports from `src/modules/credits/`; `swipe.repository.ts` queries `prisma.unlock` directly without importing credits module; `admin.service.ts` depends on `ICreditService` interface, not concrete `CreditService`; `admin.routes.ts` is the wiring layer and cross-module imports there are the correct injection point |

**No orphaned requirements:** REQUIREMENTS.md maps CREDIT-01, CREDIT-02, CREDIT-03, CREDIT-04 to Phase 7; all claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/modules/swipe/swipe.service.ts` | 7-23 | `haversineKm` redefined as local function instead of imported from `src/shared/utils/haversine.ts` | Warning | Duplicate logic — plan intended to extract and import the shared utility. Both implementations are identical. No behavioral impact, but violates DRY and makes future maintenance harder. |

No blockers found. The local `haversineKm` in `swipe.service.ts` is private and produces identical results to the shared utility. `credits.routes.ts` correctly imports from the shared utility. This is a code quality warning, not a goal-blocking failure.

### Human Verification Required

#### 1. Full Test Suite

**Test:** Run `npm test` from the project root
**Expected:** All test suites exit 0 — unit tests (credit.service.test.ts: 11 tests, swipe.service.test.ts including new unlock reveal test), integration tests (credits.test.ts: 11 tests, admin.test.ts including 3 audit log tests, swipe.test.ts including 2 unlock reveal tests)
**Why human:** Cannot execute npm test and confirm all 25+ tests are GREEN in this environment. All source code, wiring, and data flows have been verified statically.

#### 2. Unlock Endpoint End-to-End

**Test:** Authenticate as a RECRUITER, POST to `/jobs/:jobId/candidates/:candidateId/unlock` where candidateId has a DISLIKE swipe on jobId and company has credits >= 2
**Expected:** 201 response with `{ id, companyId, candidateId, jobId, unlockedAt, creditsCost: 2, profile: { name, bio, skills, professionId, preferredModalities, salaryExpectation, distanceKm } }`
**Why human:** Requires live server with real PostgreSQL DB populated by test factories.

#### 3. Ranking Reveal After Unlock

**Test:** After unlocking a DISLIKE candidate, call `GET /jobs/:jobId/ranking` as the same recruiter
**Expected:** The previously censored candidate (profile: null) now returns with a non-null `profile` containing their name and skills
**Why human:** Cross-endpoint state verification requires live server.

#### 4. Admin Audit Log

**Test:** As ADMIN, PATCH `/admin/companies/:id/credits` with `{ amount: 5 }`, then GET `/admin/companies/:id/transactions`
**Expected:** 200 with array containing at least one entry where `reason === 'admin_grant'` and `amount === 5`
**Why human:** Requires live server and admin-role JWT.

### Gaps Summary

No gaps blocking goal achievement. All 5 ROADMAP success criteria are satisfied by the implementation:

- Unlock endpoint wired through all layers with correct authentication and business guards
- Atomic credit deduction with balance check inside `$transaction` (TOCTOU-safe)
- 402 rejection for insufficient credits properly threaded from DB → repo → service → HTTP response
- Both deduction (candidate_unlock) and grant (admin_grant) create CreditTransaction records; audit log accessible via `GET /admin/companies/:id/transactions`
- AdminService fully delegated to ICreditService — no inline `$transaction` in admin module

The one warning — `haversineKm` duplicated as a local function in `swipe.service.ts` rather than imported from `src/shared/utils/haversine.ts` — is a code quality issue, not a goal failure. The shared utility exists and is used by `credits.routes.ts`; the plan's extraction objective is partially met.

Human verification is required to confirm all test cases pass green against the real database.

---

_Verified: 2026-05-02T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
