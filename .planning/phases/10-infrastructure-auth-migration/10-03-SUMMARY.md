---
phase: 10-infrastructure-auth-migration
plan: 03
subsystem: application/use-cases
tags: [clean-architecture, use-cases, auth, domain-error, timing-safe, replay-detection, google-oauth]

# Dependency graph
requires:
  - phase: 10-infrastructure-auth-migration
    plan: 02
    provides: BcryptAdapter (IHashPort), JwtAdapter (ITokenPort), UserRepository (IUserRepository), RefreshTokenRepository (IRefreshTokenRepository)
  - phase: 10-infrastructure-auth-migration
    plan: 01
    provides: IRefreshTokenRepository.revokeByHash, domain.error.ts, hash.port.ts, token.port.ts

provides:
  - src/application/use-cases/auth/register.use-case.ts — RegisterUseCase (email uniqueness, hash, create user, issue token pair)
  - src/application/use-cases/auth/login.use-case.ts — LoginUseCase (DUMMY_HASH timing-safe comparison, issue token pair)
  - src/application/use-cases/auth/logout.use-case.ts — LogoutUseCase (idempotent revokeFamily, no error on already-revoked)
  - src/application/use-cases/auth/refresh-token.use-case.ts — RefreshTokenUseCase (revokeByHash count replay detection, token rotation)
  - src/application/use-cases/auth/login-with-google.use-case.ts — LoginWithGoogleUseCase (OAuth2Client.verifyIdToken, findOrCreateGoogle, token pair)

affects: [10-04, auth-controller, auth-routes, phase-13-unit-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Use case pattern: each auth operation is a separate class with constructor-injected interfaces only (zero framework imports)
    - Timing-safe login: DUMMY_HASH ensures bcrypt.compare always runs full computation even when user not found
    - Atomic replay detection: revokeByHash returns count; count=0 triggers revokeFamily without Prisma.$transaction in use case
    - Token family continuation: RefreshTokenUseCase reuses stored.familyId (not a new familyId) for the rotated token
    - Idempotent logout: LogoutUseCase returns silently when token not found or revokedAt !== null

key-files:
  created:
    - src/application/use-cases/auth/register.use-case.ts
    - src/application/use-cases/auth/login.use-case.ts
    - src/application/use-cases/auth/logout.use-case.ts
    - src/application/use-cases/auth/refresh-token.use-case.ts
    - src/application/use-cases/auth/login-with-google.use-case.ts
  modified: []

key-decisions:
  - "LoginUseCase.DUMMY_HASH prevents timing oracle — IHashPort.compare always runs full bcrypt computation; timing-safe logic belongs in use case, not in BcryptAdapter"
  - "RefreshTokenUseCase uses revokeByHash+count pattern (no prisma.$transaction in use case) — atomicity comes from updateMany being a single SQL UPDATE; count=0 means concurrent replay"
  - "LoginWithGoogleUseCase uses OAuth2Client directly — IGoogleAuthPort port deferred to Phase 13 cleanup; acceptable ARCH-07 approximation per RESEARCH.md Assumption A3"
  - "LogoutUseCase is idempotent — silently returns on not-found or already-revoked token; caller never sees an error from double-logout"
  - "Token family continuation in RefreshTokenUseCase uses stored.familyId (not randomBytes) — new token joins existing family for full family revocation to work"

# Metrics
duration: 2min
completed: 2026-05-07
---

# Phase 10 Plan 03: Auth Use Cases Summary

**Five auth use cases implement the business layer with zero Prisma/bcrypt/Fastify imports: RegisterUseCase (CONFLICT 409 on duplicate email), LoginUseCase (DUMMY_HASH timing-safe comparison), LogoutUseCase (idempotent revokeFamily), RefreshTokenUseCase (revokeByHash count replay detection without prisma.$transaction), LoginWithGoogleUseCase (OAuth2Client.verifyIdToken + findOrCreateGoogle)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-07T00:02:10Z
- **Completed:** 2026-05-07T00:04:04Z
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments

- Created `src/application/use-cases/auth/register.use-case.ts` — RegisterUseCase injects IUserRepository, IRefreshTokenRepository, IHashPort, ITokenPort; throws DomainError('Email already in use', 'CONFLICT', 409) on duplicate; generates 7-day refresh token with randomBytes(16) familyId
- Created `src/application/use-cases/auth/login.use-case.ts` — LoginUseCase uses DUMMY_HASH constant for timing-safe IHashPort.compare even when user not found; throws DomainError('Invalid credentials', 'INVALID_CREDENTIALS', 401) on mismatch; imports zero bcrypt
- Created `src/application/use-cases/auth/logout.use-case.ts` — LogoutUseCase hashes rawToken via SHA-256, checks revokedAt !== null for idempotency, calls revokeFamily on stored.familyId; injects only IRefreshTokenRepository
- Created `src/application/use-cases/auth/refresh-token.use-case.ts` — RefreshTokenUseCase calls revokeByHash first (atomic SQL UPDATE), then findByHash for metadata; count=0 triggers revokeFamily + TOKEN_EXPIRED; reuses stored.familyId for new token; no prisma.$transaction
- Created `src/application/use-cases/auth/login-with-google.use-case.ts` — LoginWithGoogleUseCase calls OAuth2Client.verifyIdToken with audience validation, catches any error as INVALID_CREDENTIALS, delegates user creation to userRepo.findOrCreateGoogle, issues token pair
- TypeScript compiles clean (npx tsc --noEmit exits 0) with all 5 files present

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RegisterUseCase, LoginUseCase, LogoutUseCase** - `fcdbb18` (feat)
2. **Task 2: Create RefreshTokenUseCase and LoginWithGoogleUseCase** - `fb74bb8` (feat)

## Files Created/Modified

- `src/application/use-cases/auth/register.use-case.ts` — RegisterUseCase; DomainError('Email already in use', 'CONFLICT', 409); IHashPort.hash; ITokenPort.signAccess + generateRefreshToken; randomBytes(16) for familyId
- `src/application/use-cases/auth/login.use-case.ts` — LoginUseCase; DUMMY_HASH timing-safe pattern; IHashPort.compare with user?.passwordHash ?? DUMMY_HASH; DomainError('Invalid credentials', 'INVALID_CREDENTIALS', 401)
- `src/application/use-cases/auth/logout.use-case.ts` — LogoutUseCase; SHA-256 token hash; idempotent check for !stored || stored.revokedAt !== null; revokeFamily call
- `src/application/use-cases/auth/refresh-token.use-case.ts` — RefreshTokenUseCase; revokeByHash before findByHash; count===0 replay detection + revokeFamily; stored.familyId continuation; expiresAt validation
- `src/application/use-cases/auth/login-with-google.use-case.ts` — LoginWithGoogleUseCase; OAuth2Client module-level singleton; verifyIdToken + getPayload; findOrCreateGoogle; token pair generation

## Decisions Made

- `LoginUseCase.DUMMY_HASH` implements timing-safe login — IHashPort.compare always runs a full bcrypt computation; prevents timing oracle attack (T-10-03-01)
- `RefreshTokenUseCase` uses revokeByHash + count=0 pattern — no prisma.$transaction wrapper in use case; atomicity comes from the single SQL UPDATE in revokeByHash; two concurrent requests both call updateMany but only one gets count=1 (T-10-03-02)
- `LoginWithGoogleUseCase` uses OAuth2Client directly — IGoogleAuthPort is a future concern; acceptable ARCH-07 approximation per RESEARCH.md Assumption A3 (T-10-03-03)
- All five use cases import DomainError (not AppError) — controller layer handles DomainError→HTTP mapping via errorHandler.ts (updated in Plan 10-04)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — both tasks compiled clean on first attempt. All acceptance criteria verified.

## Threat Model Review

All STRIDE threats from plan were mitigated:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-10-03-01 | MITIGATED — `user?.passwordHash ?? DUMMY_HASH` verified in login.use-case.ts; IHashPort.compare always runs |
| T-10-03-02 | MITIGATED — `revokeByHash` + `count === 0` + `revokeFamily` verified in refresh-token.use-case.ts |
| T-10-03-03 | MITIGATED — `googleClient.verifyIdToken({ audience: process.env.GOOGLE_CLIENT_ID })` verified in login-with-google.use-case.ts |
| T-10-03-04 | MITIGATED — all DomainError calls use (message, code, statusCode) order verified by grep in acceptance criteria |
| T-10-03-05 | MITIGATED — `grep -r "import.*@prisma" src/application/use-cases/` returns 0 matches |

## Known Stubs

None — all five use case files are complete implementations.

## Next Phase Readiness

- All 5 auth use cases ready for Wave 4 (Plan 10-04): AuthController + auth.routes.ts
- Use cases require concrete adapters at instantiation: `new RegisterUseCase(new UserRepository(), new RefreshTokenRepository(), new BcryptAdapter(), new JwtAdapter(request.server))`
- `LogoutUseCase` only needs `new LogoutUseCase(new RefreshTokenRepository())` — no hash/token ports needed
- `RefreshTokenUseCase` and `LoginWithGoogleUseCase` do not need IHashPort (no password hashing in refresh or Google flow)

## Self-Check

- [x] `src/application/use-cases/auth/register.use-case.ts` — exists
- [x] `src/application/use-cases/auth/login.use-case.ts` — exists
- [x] `src/application/use-cases/auth/logout.use-case.ts` — exists
- [x] `src/application/use-cases/auth/refresh-token.use-case.ts` — exists
- [x] `src/application/use-cases/auth/login-with-google.use-case.ts` — exists
- [x] Commit `fcdbb18` — Task 1 (register, login, logout)
- [x] Commit `fb74bb8` — Task 2 (refresh-token, login-with-google)
- [x] `npx tsc --noEmit` exits 0

## Self-Check: PASSED

---
*Phase: 10-infrastructure-auth-migration*
*Completed: 2026-05-07*
