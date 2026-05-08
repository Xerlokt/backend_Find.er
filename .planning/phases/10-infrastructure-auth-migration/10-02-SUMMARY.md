---
phase: 10-infrastructure-auth-migration
plan: 02
subsystem: adapters
tags: [bcrypt, jwt, prisma, clean-architecture, adapters, repository-pattern]

# Dependency graph
requires:
  - phase: 10-infrastructure-auth-migration
    plan: 01
    provides: src/infrastructure/database/prisma.ts canonical singleton, IRefreshTokenRepository.revokeByHash

provides:
  - src/adapters/services/bcrypt.adapter.ts — BcryptAdapter implementing IHashPort (12 salt rounds)
  - src/adapters/services/jwt.adapter.ts — JwtAdapter implementing ITokenPort (FastifyInstance injection, 15m expiry)
  - src/adapters/repositories/user.repository.ts — UserRepository implementing IUserRepository (toDomain maps 7 fields, findOrCreateGoogle transaction)
  - src/adapters/repositories/refresh-token.repository.ts — RefreshTokenRepository implementing IRefreshTokenRepository (revokeByHash returns count)

affects: [10-03, 10-04, auth-use-cases, auth-controller, auth-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Adapter pattern: concrete classes bridge domain contracts (interfaces/ports) to infrastructure (bcryptjs, @fastify/jwt, PrismaClient)
    - toDomain() private method: explicit field-by-field mapping from Prisma row to domain entity (no spreading)
    - Constructor injection for FastifyInstance: JwtAdapter receives FastifyInstance at handler time via request.server
    - revokeByHash count semantics: updateMany returns count; 0 = replay attack, 1 = success

key-files:
  created:
    - src/adapters/services/bcrypt.adapter.ts
    - src/adapters/services/jwt.adapter.ts
    - src/adapters/repositories/user.repository.ts
    - src/adapters/repositories/refresh-token.repository.ts
  modified: []

key-decisions:
  - "BcryptAdapter.compare is unconditional — timing-safe DUMMY_HASH logic belongs in LoginUseCase, not in the adapter"
  - "JwtAdapter constructor takes FastifyInstance (not raw secret string) — @fastify/jwt decorates the FastifyInstance; wrapping it preserves the Fastify plugin secret management"
  - "Role from @prisma/client imported only in UserRepository for cast — the only acceptable @prisma/client import in adapter files"
  - "toDomain() maps all fields explicitly — no Prisma object spreading to prevent accidental field exposure or omission"
  - "findOrCreateGoogle uses prisma.$transaction — atomic Google OAuth user linking/creation, preserving exact semantics from AuthRepository.findOrCreateGoogleUser"

# Metrics
duration: 2min
completed: 2026-05-07
---

# Phase 10 Plan 02: Adapter Implementations Summary

**Four adapter classes bridge domain contracts to infrastructure: BcryptAdapter (IHashPort, 12 rounds), JwtAdapter (ITokenPort, FastifyInstance injection), UserRepository (IUserRepository, toDomain maps all 7 fields), RefreshTokenRepository (IRefreshTokenRepository, revokeByHash returns count for replay detection)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-07T23:58:34Z
- **Completed:** 2026-05-07T24:00:01Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- Created `src/adapters/services/bcrypt.adapter.ts` — BcryptAdapter wraps bcryptjs, implements IHashPort, enforces 12 salt rounds per CLAUDE.md security rule
- Created `src/adapters/services/jwt.adapter.ts` — JwtAdapter wraps FastifyInstance.jwt, implements ITokenPort, enforces expiresIn: '15m' per CLAUDE.md security rule; generateRefreshToken uses crypto.randomBytes(32) + SHA-256
- Created `src/adapters/repositories/user.repository.ts` — UserRepository implements IUserRepository, imports prisma from canonical src/infrastructure/database/prisma path, toDomain() maps all 7 User fields explicitly, findOrCreateGoogle uses prisma.$transaction for atomic Google OAuth linking
- Created `src/adapters/repositories/refresh-token.repository.ts` — RefreshTokenRepository implements IRefreshTokenRepository including revokeByHash() which returns result.count for atomic replay-attack detection without Prisma in use cases
- TypeScript compiles clean (npx tsc --noEmit exits 0) after all four files created

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BcryptAdapter and JwtAdapter** - `91e7e48` (feat)
2. **Task 2: Create UserRepository and RefreshTokenRepository** - `1ed38af` (feat)

## Files Created/Modified

- `src/adapters/services/bcrypt.adapter.ts` — BcryptAdapter implements IHashPort; `bcrypt.hash(plain, 12)` enforces 12 salt rounds
- `src/adapters/services/jwt.adapter.ts` — JwtAdapter implements ITokenPort; constructor takes FastifyInstance; signAccess enforces '15m'; generateRefreshToken uses randomBytes + SHA-256
- `src/adapters/repositories/user.repository.ts` — UserRepository implements IUserRepository; prisma imported from infrastructure/database; toDomain maps id/email/passwordHash/googleId/avatarUrl/role/createdAt; findOrCreateGoogle wraps prisma.$transaction
- `src/adapters/repositories/refresh-token.repository.ts` — RefreshTokenRepository implements IRefreshTokenRepository; revokeByHash returns result.count; toDomain maps all 7 RefreshToken fields; no @prisma/client import needed

## Decisions Made

- `BcryptAdapter.compare` does not implement DUMMY_HASH timing-safe logic — that responsibility belongs to `LoginUseCase` (single responsibility principle; adapter is a pure wrapper)
- `JwtAdapter` receives `FastifyInstance` in constructor (not a raw JWT secret string) — the @fastify/jwt plugin decorates the FastifyInstance with `jwt.sign`/`jwt.verify`; wrapping the instance is the only way to use it without secret duplication
- `Role` from `@prisma/client` is the only acceptable @prisma/client import in adapter files — used only for casting `UserRole` to Prisma's `Role` enum in `user.create` and `tx.user.create`
- `toDomain()` maps every field explicitly — no `{ ...row }` spreading ensures no accidental inclusion of future Prisma-only fields

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both tasks compiled clean on first attempt. All acceptance criteria verified.

## Threat Model Review

All STRIDE threats from plan were mitigated:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-10-02-01 | MITIGATED — `bcrypt.hash(plain, 12)` verified in bcrypt.adapter.ts |
| T-10-02-02 | MITIGATED — `expiresIn: '15m'` verified in jwt.adapter.ts |
| T-10-02-03 | MITIGATED — `passwordHash: row.passwordHash` verified in toDomain() |
| T-10-02-04 | MITIGATED — `return result.count` verified in revokeByHash |
| T-10-02-05 | MITIGATED — `from '../../infrastructure/database/prisma'` verified; no shared/db path present |

## Known Stubs

None — all four adapter files are complete implementations.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `BcryptAdapter` — ready for use in `LoginUseCase` and `RegisterUseCase` (Wave 3)
- `JwtAdapter` — ready for use in all auth use cases via `new JwtAdapter(request.server)` in AuthController
- `UserRepository` — ready for use in `RegisterUseCase`, `LoginUseCase`, `RefreshTokenUseCase`, `LoginWithGoogleUseCase`
- `RefreshTokenRepository` — ready for use in all auth use cases including `revokeByHash` for replay detection in `RefreshTokenUseCase`
- All four adapters import from canonical paths — no shared/ imports in adapters layer

---
*Phase: 10-infrastructure-auth-migration*
*Completed: 2026-05-07*
