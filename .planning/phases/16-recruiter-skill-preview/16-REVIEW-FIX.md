---
phase: 16-recruiter-skill-preview
fixed_at: 2026-05-17T00:00:00Z
review_path: .planning/phases/16-recruiter-skill-preview/16-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-05-17T00:00:00Z
**Source review:** .planning/phases/16-recruiter-skill-preview/16-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `candidateId` exposed for DISLIKE-locked (censored) candidates — privacy bypass

**Files modified:** `src/application/use-cases/swipe/get-ranking.use-case.ts`, `src/infrastructure/http/routes/swipe.routes.ts`
**Commit:** 2776d10
**Applied fix:** In the `map` callback of `GetRankingUseCase.execute`, `candidateId` is now conditionally spread into the return object only when `isRevealed` is true (LIKE direction or explicitly unlocked via `unlockedCandidateIds`). DISLIKE-locked candidates return without a `candidateId` field. `RankingItem.candidateId` in `swipe.routes.ts` updated from `string` to `string?` (optional) with a comment referencing REC-03.

---

### WR-01: `profile: null` can escape via stale cache — type contract violation at runtime

**Files modified:** `src/application/use-cases/swipe/get-ranking.use-case.ts`, `tests/unit/get-ranking.use-case.test.ts`
**Commit:** 32ab3d6
**Applied fix:** Option A (preferred) from REVIEW.md. After `JSON.parse(cached)`, a guard checks `parsed.every((item: any) => item.profile != null)` before returning the cached result. Stale entries with `profile: null` are silently discarded and the system falls through to recompute. The cache-HIT test fixture was updated to use a valid `FullProfile` object (non-null profile). A new test `'stale cache with profile: null is discarded — falls through to repo (WR-01 guard)'` was added to assert that `repo.findSwipesByJobId` is called when the guard discards the stale entry.

---

### WR-02: `buildFitReasons` emits misleading `"0/0 skills match"` when `job.requiredSkills` is empty

**Files modified:** `src/application/use-cases/swipe/get-ranking.use-case.ts`
**Commit:** 9afa6c9
**Applied fix:** The unconditional `reasons.push(...)` on line 44 was replaced with an `if/else` guard. When `job.requiredSkills.length > 0`, the canonical `"N/M skills match"` string is emitted as before. When the array is empty, the fallback `'no required skills listed'` is emitted instead, which is accurate and informative for recruiters.

---

### WR-03: GET `/:jobId/ranking` route has no Fastify route-level schema — raw Zod errors can leak

**Files modified:** `src/adapters/controllers/swipe.controller.ts`
**Commit:** a03b81b
**Applied fix:** `JobIdParamsSchema.parse(request.params)` in `SwipeController.getRanking` is now wrapped in a dedicated `try/catch` block. When a `z.ZodError` is caught, the handler immediately sends `reply.status(400).send({ error: 'Invalid job ID format', code: 'VALIDATION_ERROR' })` and returns. Non-Zod errors are re-thrown. This prevents raw Zod error objects (which expose internal schema structure) from reaching the client, in compliance with the project security rules ("Inputs validados com Zod em todos os endpoints").

---

_Fixed: 2026-05-17T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
