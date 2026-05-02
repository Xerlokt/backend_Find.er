---
phase: 5
slug: 05-swipe
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-01
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CANDIDATE → POST /swipes | Candidate-supplied jobId and direction; candidateId must never come from body | jobId (UUID), direction (enum) |
| CANDIDATE → GET /jobs/feed | cursor from query string | cursor (UUID or absent) |
| RECRUITER → GET /jobs/:jobId/ranking | Recruiter-supplied jobId; ownership must be verified before returning any candidate data | jobId (UUID), full candidate profiles for LIKE swipes |
| Ranking response → client | Candidate location must never be revealed; only distanceKm | distanceKm (computed), profile fields (no lat/lng) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Spoofing/Tampering (IDOR) | SwipeService.recordSwipe | mitigate | `candidateId` resolved via `repo.findCandidateProfileByUserId(request.user.id)` — never from request body (D-12); unit test IDOR guard verifies `repo.createSwipe` receives `profile.id`, not user-supplied value | closed |
| T-05-02 | Tampering (race condition) | SwipeRepository.createSwipe | mitigate | `prisma.$transaction()` wraps `swipe.create` (SEC-03); DB-level `@@unique([candidateId, jobId])` is the final atomic guard — verified grep `swipe.repository.ts:6` | closed |
| T-05-03 | Tampering (duplicate swipe) | SwipeService.recordSwipe | mitigate | P2002 `PrismaClientKnownRequestError` caught and re-thrown as `AppError 409 DUPLICATE_SWIPE`; unit test + integration test 409 verify | closed |
| T-05-04 | Tampering (inactive job swipe) | SwipeService.recordSwipe | mitigate | `!job.isActive \|\| job.expiresAt <= new Date()` guard returns 404 before `createSwipe` is called (D-14); unit tests cover isActive:false and expiresAt <= now cases | closed |
| T-05-05 | Denial of Service | POST /swipes route | mitigate | `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` per-route override (SEC-05, D-11); verified grep `swipe.routes.ts:26` | closed |
| T-05-06 | Spoofing (unauthenticated swipe) | POST /swipes route | mitigate | `preHandler: [authenticate, requireRole('CANDIDATE')]` — 401 without JWT, 403 for non-CANDIDATE roles; integration tests cover 401 + 403 RECRUITER | closed |
| T-05-07 | Tampering (invalid feed cursor) | GET /jobs/feed route | mitigate | `cursor: z.string().uuid().optional()` — Zod rejects non-UUID cursors with 400; prevents Prisma cursor injection via malformed input | closed |
| T-05-08 | Information Disclosure (inactive job swipeable) | POST /swipes | mitigate | Delegated to `SwipeService.recordSwipe` which checks `!job.isActive` (T-05-04); integration test 404 for inactive job verifies HTTP-level enforcement | closed |
| T-05-09 | Spoofing/IDOR (ranking access) | GET /jobs/:jobId/ranking | mitigate | `requireRole('RECRUITER')` + `job.recruiterId !== recruiterProfile.id → 403 FORBIDDEN` ownership check (D-03); unit test (ownership mismatch) + integration test 403 non-owner | closed |
| T-05-10 | Information Disclosure (location) | SwipeService.getRanking serialization | mitigate | `haversineKm()` returns `distanceKm` only; `lat`/`lng` fields intentionally excluded from both LIKE profile object and root item (D-05, D-06, D-07); unit test asserts `(item as any).lat` is `undefined` on all items | closed |
| T-05-11 | Information Disclosure (DISLIKE censorship) | SwipeService.getRanking serialization | mitigate | `swipe.direction === 'LIKE' ? fullProfile : null` — DISLIKE candidates expose only `fitScore`, `rank`, `distanceKm`; identity fully censored; unit test + integration test verify `profile: null` for DISLIKE (SWIPE-04) | closed |
| T-05-12 | Spoofing (CANDIDATE accessing ranking) | GET /jobs/:jobId/ranking | mitigate | `requireRole('RECRUITER')` hook returns 403 for CANDIDATE role; integration test verifies 403 response for CANDIDATE token | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-01 | 12 | 12 | 0 | gsd-secure-phase (automated — all mitigations grep-verified + 16/16 integration tests green) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-01
