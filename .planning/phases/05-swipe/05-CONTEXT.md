# Phase 5: Swipe - Context

**Gathered:** 2026-04-25 (updated 2026-04-25)
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver swipe recording (LIKE/DISLIKE by candidates), duplicate prevention (409), a job feed for candidates (active jobs, already-swiped excluded), and the recruiter ranking view with censorship rules. No fit scores in Phase 5 — Phase 6 fills those in. No credit unlock in Phase 5 — Phase 7 delivers that.

</domain>

<decisions>
## Implementation Decisions

### Ranking Endpoint Architecture
- **D-01:** Separate endpoint `GET /jobs/:jobId/ranking` registered in the swipe module (NOT in job module). Keeps ARCH-04 module isolation — job module does not import from swipe module.
- **D-02:** `GET /jobs/:id` in job.routes.ts stays unchanged — continues returning `rankings: [] as RankingItem[]`. The ranking data is served exclusively from the new swipe endpoint.
- **D-03:** `GET /jobs/:jobId/ranking` is RECRUITER-only AND ownership-checked: the authenticated recruiter must be the owner of the job (`job.recruiterId === recruiterProfile.id`). Any other recruiter → 403 Forbidden. Same ownership pattern used in job management.

### Ranking Content & Ordering
- **D-04:** Ranking shows ALL candidates who swiped on the job (both LIKE and DISLIKE), ordered by fit score descending. In Phase 5, fitScore = 0 for all (placeholder until Phase 6). Secondary sort: swipe date descending (most recent first) when fit scores are tied.
- **D-05:** LIKE candidates → full profile visible (name, avatarUrl, bio, skills, profession, modalities, salaryExpectation) + `distanceKm`. **Exact lat/lng is NOT returned** — location is shown as distance in km only (same Tinder-style approach as DISLIKE).
- **D-06:** DISLIKE candidates → censored profile. Visible: fitScore (%), rank position, `distanceKm`. Hidden: name, avatarUrl, bio, skills, professionId, preferredModalities, salaryExpectation, exact lat/lng.
- **D-07:** `distanceKm` is returned for ALL candidates (both LIKE and DISLIKE). Calculated via Haversine formula from candidate lat/lng and job lat/lng. Rounded to nearest integer. If candidate or job has no lat/lng → `distanceKm: null`.

### Swipe Endpoint
- **D-08:** `POST /swipes` — CANDIDATE only (`requireRole('CANDIDATE')`). Body: `{ jobId: string, direction: 'LIKE' | 'DISLIKE' }`.
- **D-09:** Duplicate swipe (same candidate + job) returns 409 with code `DUPLICATE_SWIPE`. Enforced at DB level via `@@unique([candidateId, jobId])` already in schema.
- **D-10:** Swipe creation uses Prisma `$transaction` for atomic write (SEC-03). Single-row write but wrapped in transaction for consistency with platform standard.
- **D-11:** Rate limiting on `POST /swipes`: 30 req/min per IP (Claude's discretion — generous to avoid blocking legitimate fast swipers).
- **D-14:** SwipeService validates `job.isActive === true` before persisting the swipe. Inactive or expired job → **404** (consistent with feed behavior — expired jobs are not visible to candidates, so they shouldn't be swipeable either).

### Candidate Resolution
- **D-12:** Service resolves `candidateId` from the authenticated user's CandidateProfile (same pattern as job module: `findCandidateProfileByUserId`). Never accept `candidateId` from request body — IDOR prevention.

### Job Feed for Candidates
- **D-15:** `GET /jobs/feed` — CANDIDATE-only (`requireRole('CANDIDATE')`). Returns active jobs (`isActive: true`, `expiresAt > now`) that the authenticated candidate has **not yet swiped on**. Registered in the swipe module (swipe plugin mounts it under `/jobs` prefix alongside the ranking endpoint).
- **D-16:** Feed is cursor-based (Tinder-style — no going back). Cursor based on `job.createdAt` descending (newest jobs first). SwipeRepository queries Job table directly via Prisma relations to filter swiped jobs — no module import needed (Prisma is shared infra, not a module dependency). Default page size and cursor field name: Claude's discretion.

### Phase 6 Extension Contract
- **D-13:** `RankingItem` interface (exported from job.routes.ts) is the type contract for ranking items: `{ candidateId, fitScore, profile }`. Phase 5 returns `fitScore: 0` as placeholder. Phase 6 replaces with real fit scores from Neo4j — no interface change needed.

### Claude's Discretion
- Rate limit value on swipe (30/min chosen above)
- Haversine implementation (inline utility or shared math helper)
- SwipeRepository method names and internal structure
- Whether SwipeService gets its own findCandidateProfileByUserId or reuses CandidateRepository via injection
- Feed default page size and cursor field name (e.g., `cursor: jobId` or `cursor: createdAt`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Swipe — SWIPE-01 through SWIPE-04
- `.planning/REQUIREMENTS.md` §Security — SEC-03 (atomic transactions for swipe), SEC-05 (rate limiting on swipe)
- `.planning/REQUIREMENTS.md` §Architecture — ARCH-01, ARCH-04 (module isolation — critical for ranking and feed endpoint placement)

### Existing Infrastructure
- `src/modules/job/job.routes.ts` — `RankingItem` interface exported here (Phase 6 contract). `GET /jobs/:id` returns `rankings: []` — stays unchanged.
- `prisma/schema.prisma` — `Swipe` model already defined with `@@unique([candidateId, jobId])`. `SwipeDirection` enum: LIKE | DISLIKE. No new migration needed for Swipe table.
- `src/shared/hooks/authenticate.ts` — JWT verification hook
- `src/shared/hooks/requireRole.ts` — Role guard hook
- `src/shared/errors/AppError.ts` — Error class for 404/403/409 throws

### Prior Phase Context
- `.planning/phases/02-authentication/02-CONTEXT.md` — JWT payload `{ id, role }`, rate limiting patterns
- `.planning/phases/04-jobs/04-04-SUMMARY.md` — RankingItem contract established, GET /jobs/:id access control decisions, ownership check pattern (job.recruiterId)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/modules/job/job.service.ts` — Pattern for resolving userId → RecruiterProfile + ownership check (`job.recruiterId === recruiterProfile.id`). Same ownership pattern needed for ranking endpoint.
- `src/modules/job/job.repository.ts` — Repository pattern: constructor injection, Prisma calls. SwipeRepository follows same structure.
- `tests/helpers/factories.ts` — `createJob`, `createCompany`, `createUser` helpers available. Need `createSwipe` factory for tests.

### Established Patterns
- Module structure: `src/modules/swipe/swipe.routes.ts`, `swipe.service.ts`, `swipe.repository.ts`
- Ownership/identity resolution: never trust IDs from request body — always resolve from JWT userId via profile lookup
- Ownership validation: compare resource foreign key to authenticated user's profile id → 403 if mismatch
- Error throwing: `throw new AppError(message, statusCode, code)`
- TDD: write failing tests first, then implement

### Integration Points
- `src/app.ts` — register swipe plugin (mounts under both `/swipes` for POST and `/jobs` for GET ranking + GET feed — one plugin, two prefixes or two route registrations)
- `prisma/schema.prisma` — Swipe model ready, no migration needed for core table
- Phase 7 (Credits): will add unlock endpoint that reads Swipe.direction to check DISLIKE status before charging credits

</code_context>

<specifics>
## Specific Ideas

- Distance calculation: Haversine formula inline in SwipeService or shared utility. Return `distanceKm: number | null`. No external geocoding API.
- **Response shapes:**
  - LIKE: `{ candidateId, fitScore: 0, distanceKm, profile: { name, avatarUrl, bio, skills, profession, modalities, salaryExpectation } }` — no lat/lng even for visible profiles
  - DISLIKE: `{ candidateId, fitScore: 0, distanceKm, profile: null }` — identity fully censored
- The `profile: Record<string, unknown> | null` field in RankingItem handles both states — `null` for censored, full object for visible.
- Feed (`GET /jobs/feed`): Prisma query with `where: { isActive: true, expiresAt: { gt: now }, NOT: { swipes: { some: { candidateId } } } }` — no cross-module import needed.

</specifics>

<deferred>
## Deferred Ideas

- **Filtros no ranking** (ex: "mostrar só LIKEs") — fora do escopo da Fase 5. Adicionar como parâmetro query opcional em fase futura.
- **Chat auto-criado no LIKE** — CHAT-02, entregue na Fase 8. Fase 5 apenas persiste o swipe.
- **Unlock de perfil censurado com créditos** — CREDIT-01, entregue na Fase 7.
- **Fit score real no feed** — CAND-03 / REC-01, entregue na Fase 6 (Neo4j). Feed da Fase 5 retorna vagas sem score de fit.

</deferred>

---

*Phase: 05-swipe*
*Context gathered: 2026-04-25 | Updated: 2026-04-25*
