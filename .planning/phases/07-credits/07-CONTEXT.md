# Phase 7: Credits - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the credit unlock flow: recruiters spend company credits to reveal censored DISLIKE candidates' full profiles in the job ranking view. Every credit spend and admin grant is recorded in the audit log. Credit purchase, subscription renewal, and job posting limits are out of scope for v1.

</domain>

<decisions>
## Implementation Decisions

### Unlock Tracking
- **D-01:** New `Unlock` Prisma model — fields: `id`, `companyId`, `candidateId`, `jobId`, `unlockedAt`, `creditsCost` (Int). Constraint: `@@unique([companyId, candidateId, jobId])` — one unlock record per company per candidate per job. Prevents double-unlock at DB level.
- **D-02:** Unlock is scoped per-job: unlocking candidate X on job A does NOT reveal candidate X on job B. Each unlock is independent.
- **D-03:** Double-unlock (same company + candidate + job) returns **409 `ALREADY_UNLOCKED`**. Credits are NOT charged again.

### Unlock Endpoint
- **D-04:** `POST /jobs/:jobId/candidates/:candidateId/unlock` — RECRUITER only (`requireRole('CANDIDATE')` excluded). Ownership check: authenticated recruiter must be the `recruiterId` of the job (same pattern as ranking in Phase 5).
- **D-05:** On success, returns the **full revealed candidate profile** (name, avatarUrl, bio, skills, profession, modalities, salaryExpectation, distanceKm). The recruiter sees the result immediately without needing to reload the ranking.
- **D-06:** The candidate targeted must have swiped `DISLIKE` on this job. Attempting to unlock a LIKE candidate (who is already visible) is an error — Claude's discretion on status code (422 or 400).

### Credit Cost by Plan
- **D-07:** Cost is configurable by company plan, hardcoded as a constant: `UNLOCK_COST_BY_PLAN = { FREE: 2, PRO: 1 }`. Lives in the credits module (e.g., `src/modules/credits/credits.constants.ts`).
- **D-08:** `Company.plan` field already in schema (String, default `"FREE"`). Phase 7 uses it as-is — no plan migration needed.
- **D-09:** If the company's `plan` value doesn't match a known key, fall back to `FREE` cost (defensive default).

### Atomic Unlock Transaction (SEC-03)
- **D-10:** The full unlock flow runs in a single `prisma.$transaction`: (1) load job + verify ownership, (2) verify candidate swiped DISLIKE on this job, (3) load company + check `credits >= UNLOCK_COST_BY_PLAN[plan]`, (4) deduct credits (`credits: { decrement: cost }`), (5) create `Unlock` record, (6) create `CreditTransaction` (reason: `'candidate_unlock'`). If any step fails, the entire transaction rolls back.
- **D-11:** Insufficient credits → **402 `INSUFFICIENT_CREDITS`**.

### Audit Log
- **D-12:** `CreditTransaction` model already captures every credit change (`companyId`, `amount`, `reason`, `createdAt`). No schema change needed — Phase 7 adds `reason: 'candidate_unlock'` for unlock debits on top of the existing `'admin_grant'`.
- **D-13:** Audit log read endpoint queryability is **Claude's discretion** — admin-only (`GET /admin/companies/:id/transactions`) is the safe default for v1.

### Admin Credit Grant
- **D-14:** `AdminService.adjustCredits` + `PATCH /admin/companies/:id/credits` from Phase 3 already works correctly (atomic, creates CreditTransaction). Phase 7's plan `07-03` should create a proper `CreditService` and refactor the admin to delegate to it — single source of truth for credit mutations. Existing behavior and route URL are preserved.

### Claude's Discretion
- Exact module directory: `src/modules/credits/` (recommended)
- Method names on CreditRepository and CreditService
- Error code for "candidate did not DISLIKE this job" case (422 or 400)
- Audit log read endpoint — admin-only vs. recruiter-readable for v1
- Whether `CreditTransaction` should gain optional `candidateId` + `jobId` fields for richer unlock audit records (useful but not required by CREDIT-03)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Credits — CREDIT-01 through CREDIT-04 (all in Phase 7)
- `.planning/REQUIREMENTS.md` §Security — SEC-03 (atomic transactions for credits and swipes)
- `.planning/REQUIREMENTS.md` §Architecture — ARCH-01, ARCH-04 (module isolation — credits module must not import directly from swipe module)

### Existing Infrastructure
- `prisma/schema.prisma` — Company (credits, plan fields), Swipe (direction), CreditTransaction (existing audit model), Chat (ChatInitiator.CREDIT for Phase 8 hook)
- `src/modules/company/company.service.ts` — `adjustCredits` pattern: atomic $transaction with balance check, credit update, CreditTransaction creation. Reference implementation for CreditService.
- `src/modules/admin/admin.service.ts` — `adjustCredits` for admin grants (no balance check). Phase 7 refactors this to delegate to CreditService.
- `src/modules/admin/admin.routes.ts` — existing `PATCH /admin/companies/:id/credits` route. URL and behavior preserved.
- `src/modules/swipe/swipe.service.ts` — `getRanking` ownership check pattern (recruiter must own job). Unlock endpoint uses same ownership check.
- `src/shared/hooks/authenticate.ts` — JWT verification preHandler
- `src/shared/hooks/requireRole.ts` — role guard preHandler
- `src/shared/errors/AppError.ts` — error class for all throws

### Prior Phase Context
- `.planning/phases/05-swipe/05-CONTEXT.md` — D-03 (ranking ownership check), D-05/D-06 (LIKE = visible, DISLIKE = censored). Unlock changes a DISLIKE candidate to visible for that company.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CompanyService.adjustCredits` (`src/modules/company/company.service.ts`): Complete atomic credit mutation pattern — copy and adapt as CreditService. Already handles balance check, decrement, and CreditTransaction creation.
- `src/shared/hooks/authenticate.ts` + `src/shared/hooks/requireRole.ts`: Reuse as preHandlers on unlock route.
- `tests/helpers/factories.ts`: `createCompany`, `createJob`, `createUser` factories available. Need `createSwipe` (direction: DISLIKE) and `createUnlock` factories for tests.

### Established Patterns
- Atomic transactions: `prisma.$transaction(async (tx) => { ... })` — use for all credit mutations
- Ownership check: load recruiterProfile by userId, compare to `job.recruiterId` — same as Phase 5 ranking
- Error throwing: `throw new AppError(message, statusCode, code)`
- Module structure: `src/modules/credits/credits.routes.ts`, `credits.service.ts`, `credits.repository.ts`
- Never accept candidateId from request body as authoritative — validate against actual Swipe record

### Integration Points
- `src/app.ts` — register credits plugin (mounts under `/jobs` prefix for the unlock route, or its own `/credits` prefix — Claude's discretion on how to split)
- `prisma/schema.prisma` — needs new Unlock model + migration
- Phase 8 (Chat): `Chat.initiatedBy = ChatInitiator.CREDIT` — the unlock event triggers auto-chat creation. Phase 7 should emit the unlock result so Phase 8 can hook into it, but does NOT implement the chat creation itself.
- Ranking endpoint (`GET /jobs/:jobId/ranking` in swipe module): after Phase 7, must check Unlock table to determine if a DISLIKE candidate should be shown as revealed for the requesting company.

</code_context>

<specifics>
## Specific Ideas

- The `Unlock` model bridges credits and the ranking: when the ranking endpoint loads DISLIKE candidates, it also queries `Unlock` WHERE `companyId = recruiter.companyId AND jobId = job.id` — any match flips that candidate's profile from censored to visible.
- `UNLOCK_COST_BY_PLAN = { FREE: 2, PRO: 1 }` as a typed constant in the credits module. TypeScript type: `Record<string, number>`.
- The Phase 8 Chat hook needs to know an unlock happened — the unlock endpoint or service should return enough context (companyId, candidateId, jobId) for the chat module to react. Keep this in mind when designing the return shape of CreditService.unlockCandidate.

</specifics>

<deferred>
## Deferred Ideas

- **Compra de créditos com pagamento** (Stripe, etc.) — v2. PROJECT.md marca sistema de pagamento como out of scope na v1.
- **Renovação mensal de créditos por plano** — v2. Requer sistema de assinatura.
- **Limite de postagens de vagas por plano** — nova capacidade, fase separada.
- **Audit log acessível ao recrutador da empresa** (`GET /credits/transactions`) — Claude's discretion na Fase 7; se não implementado, adicionar como backlog para v1.5.
- **CreditTransaction com candidateId + jobId** para rastreio mais rico no audit — Claude's discretion; não é exigido por CREDIT-03 mas aumenta utilidade do log.

</deferred>

---

*Phase: 07-credits*
*Context gathered: 2026-05-02*
