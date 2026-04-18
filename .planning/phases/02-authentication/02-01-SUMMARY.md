---
plan: 02-01
phase: 02-authentication
status: complete
completed: 2026-04-18
subsystem: auth-infrastructure
tags: [auth, prisma, rate-limit, bcrypt, jwt, tdd, refresh-token]
dependency_graph:
  requires: [01-01, 01-02, 01-03]
  provides: [refresh-token-schema, rate-limit-plugin, auth-repository, auth-service, token-pair-generation]
  affects: [prisma/schema.prisma, src/shared/errors/errorHandler.ts, tests/helpers/setup.ts, tests/helpers/factories.ts]
tech_stack:
  added: [@fastify/rate-limit]
  patterns: [fp-plugin wrapper, timing-safe bcrypt compare, sha256 token hashing, familyId refresh token rotation scaffold]
key_files:
  created:
    - src/shared/plugins/rate-limit.ts
    - src/modules/auth/auth.repository.ts
    - src/modules/auth/auth.service.ts
    - tests/unit/auth.service.test.ts
  modified:
    - prisma/schema.prisma
    - src/shared/errors/errorHandler.ts
    - tests/helpers/setup.ts
    - tests/helpers/factories.ts
decisions:
  - "DUMMY_HASH constant used in AuthService.login to ensure bcrypt.compare always runs even when user is not found — prevents email enumeration via timing side-channel (T-2-02)"
  - "generateRefreshToken returns rawToken (64-char hex) + tokenHash (sha256) — rawToken sent to client, only hash stored in DB"
  - "familyId passed into generateTokenPair to scaffold refresh token rotation for plan 02-02"
metrics:
  duration: ~5 minutes
  completed: 2026-04-18
  tasks_completed: 2
  tasks_deferred: 1
  files_created: 4
  files_modified: 4
---

# Phase 2 Plan 1: Auth Infrastructure Summary

JWT auth infrastructure base with bcrypt register/login (AuthRepository + AuthService) implemented TDD, RefreshToken Prisma model added, rate-limit fp-plugin created, and errorHandler updated to expose error codes.

## Key Files Created

- `src/shared/plugins/rate-limit.ts` — fp-wrapped @fastify/rate-limit with global:true, 60 req/min, IP-keyed, errorResponseBuilder returning `{ error, retryAfter }` in seconds (D-11)
- `src/modules/auth/auth.repository.ts` — Prisma queries for User and RefreshToken: findUserByEmail, createUser, createRefreshToken, findRefreshTokenByHash, revokeRefreshToken, revokeRefreshTokenFamily
- `src/modules/auth/auth.service.ts` — register (bcrypt 12 rounds), login (timing-safe with DUMMY_HASH), generateTokenPair (JWT 15m + refresh token), generateRefreshToken, hashToken
- `tests/unit/auth.service.test.ts` — 7 unit tests covering register (token pair, bcrypt rounds, 409 conflict), login (token pair, INVALID_CREDENTIALS for wrong password and missing user, accessToken exp)

## Tasks Completed

1. Task 1: Schema RefreshToken + rate-limit plugin + errorHandler update
   - Added RefreshToken model to prisma/schema.prisma with tokenHash, familyId, userId, expiresAt, revokedAt, @@index on familyId and userId
   - Added refreshTokens relation to User model
   - Created src/shared/plugins/rate-limit.ts following fp-wrapper pattern
   - Updated errorHandler AppError branch to send `{ error, code }` (D-14)
   - Added prisma.refreshToken.deleteMany() as first afterEach operation in tests/helpers/setup.ts (FK-safe)
   - Added createRefreshToken factory to tests/helpers/factories.ts returning { stored, rawToken }
   - Commit: 4c348b1

2. Task 2: Prisma migration — DEFERRED (see Deferred Items)
   - prisma generate ran successfully — @prisma/client regenerated with RefreshToken types
   - Migration could not be applied: Docker Desktop Linux engine not running
   - Commit: none (infrastructure blocker, not code blocker)

3. Task 3: TDD — AuthRepository + AuthService (register + login)
   - RED: tests/unit/auth.service.test.ts created — 7 tests failed (module not found) — Commit: f1b018f
   - GREEN: auth.repository.ts + auth.service.ts created — 7 tests pass — Commit: b44a1cf
   - REFACTOR: No structural changes needed (DUMMY_HASH already extracted, generateTokenPair already async)
   - TypeScript compiles clean: npx tsc --noEmit exits 0

## TDD Gate Compliance

- RED gate: commit f1b018f — `test(02-01): add failing tests for AuthService register + login`
- GREEN gate: commit b44a1cf — `feat(02-01): implement AuthRepository + AuthService register/login`
- REFACTOR gate: not needed (no code duplication or structural debt found)

## Deviations from Plan

### Deferred Items

**1. Task 2 — Prisma Migration (infrastructure blocker)**
- Docker Desktop Linux engine not running — `localhost:5432` unreachable
- `npx prisma generate` succeeded — TypeScript types for `prisma.refreshToken.*` are available
- Migration file was NOT created (requires DB connection for `migrate dev`)
- User action required: Start Docker Desktop, run `docker compose up -d && npx prisma migrate dev --name add-refresh-token`
- This is the same pre-existing blocker documented in STATE.md from Phase 1

No other deviations — plan executed exactly as written for the portions that could run without Docker.

## Self-Check

- [x] prisma/schema.prisma has `model RefreshToken` — grep confirmed line 49
- [x] RefreshToken has all required fields: id, tokenHash, familyId, userId, expiresAt, revokedAt, createdAt
- [x] @@index on familyId and userId present — grep confirmed
- [x] refreshTokens relation present in User model — grep confirmed
- [x] src/shared/plugins/rate-limit.ts exists with rateLimitPlugin and errorResponseBuilder
- [x] src/shared/errors/errorHandler.ts has `code: error.code` in AppError branch
- [x] tests/helpers/setup.ts has refreshToken.deleteMany() as first afterEach operation
- [x] tests/helpers/factories.ts exports createRefreshToken returning { stored, rawToken }
- [x] src/modules/auth/auth.repository.ts exports AuthRepository with all 6 methods
- [x] src/modules/auth/auth.service.ts exports AuthService with register, login, generateTokenPair
- [x] DUMMY_HASH present in auth.service.ts (timing-safe login)
- [x] bcrypt.hash(password, 12) in register (SEC-04)
- [x] app.jwt.sign called with expiresIn: '15m' (SEC-06)
- [x] 7 unit tests passing: npx jest tests/unit/auth.service.test.ts
- [x] npx tsc --noEmit exits 0
- [ ] Migration applied — BLOCKED (Docker not running, pre-existing infrastructure issue)

## Self-Check: PASSED (with 1 infrastructure-blocked item)

Migration is blocked by the same Docker issue present since Phase 1. All code artifacts are complete and TypeScript-verified.

## Known Stubs

None — all implemented functionality is fully wired. The rate-limit plugin is created but not yet registered in app.ts (that is plan 02-02's responsibility per the plan structure).

## Threat Flags

No new threat surface beyond the plan's documented threat model:
- T-2-01: bcrypt.hash(12) applied in register ✓
- T-2-02: DUMMY_HASH timing-safe login ✓
- T-2-03: role enum restriction scaffolded (Zod validation in 02-02)
- T-2-04: Prisma ORM queries only, no raw SQL ✓
- T-2-05: error codes intentionally exposed per design ✓
- T-2-06: rate-limit plugin created, registration deferred to 02-02 ✓
