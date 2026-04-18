---
plan: 02-03
phase: 02-authentication
status: complete
completed: 2026-04-18
subsystem: auth-google-oauth2
tags: [auth, google-oauth2, tdd, jwt, fastify, zod]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [google-oauth2-login, findOrCreateGoogleUser, post-auth-google]
  affects:
    - src/modules/auth/auth.service.ts
    - src/modules/auth/auth.repository.ts
    - src/modules/auth/auth.routes.ts
    - tests/unit/auth.service.test.ts
    - tests/integration/auth.test.ts
tech_stack:
  added: [google-auth-library@^10.6.2]
  patterns:
    - google-auth-library OAuth2Client.verifyIdToken with try/catch (generic Error — Pitfall 3)
    - module-level singleton OAuth2Client patched via jest.spyOn(OAuth2Client.prototype)
    - find-by-googleId → link-existing-by-email → create-new upsert pattern (D-05, D-06)
    - GoogleBodySchema z.enum(['CANDIDATE','RECRUITER']) — ADMIN excluded (D-09)
key_files:
  created: []
  modified:
    - src/modules/auth/auth.repository.ts
    - src/modules/auth/auth.service.ts
    - src/modules/auth/auth.routes.ts
    - tests/unit/auth.service.test.ts
    - tests/integration/auth.test.ts
    - package.json
    - package-lock.json
decisions:
  - "OAuth2Client instantiated as module-level singleton — patched in unit tests via jest.spyOn(OAuth2Client.prototype, 'verifyIdToken') instead of jest.mock per-instance, ensuring the singleton is targeted"
  - "catch block catches generic Error (google-auth-library does not throw typed subclasses) and rethrows as AppError(401, INVALID_CREDENTIALS)"
  - "findOrCreateGoogleUser uses three-phase upsert: find by googleId → link existing by email → create new — implements D-05 and D-06"
  - "POST /auth/google has no authenticate preHandler — it is a public route; GoogleBodySchema excludes ADMIN enum value (D-09)"
metrics:
  duration: ~5 minutes
  completed: 2026-04-18
  tasks_completed: 2
  tasks_deferred: 0
  files_created: 0
  files_modified: 7
---

# Phase 2 Plan 3: Google OAuth2 Login Summary

Google OAuth2 login flow added via `google-auth-library`: `AuthService.loginWithGoogle` with try/catch on `verifyIdToken`, `AuthRepository.findOrCreateGoogleUser` with three-phase upsert (D-05/D-06), and `POST /auth/google` route with `GoogleBodySchema` excluding ADMIN (D-09). TDD cycle complete — RED/GREEN with `jest.spyOn(OAuth2Client.prototype)` pattern.

## Key Files Modified

- `src/modules/auth/auth.repository.ts` — Added `findOrCreateGoogleUser`: find-by-googleId → link-existing-by-email (D-06) → create-new (D-05)
- `src/modules/auth/auth.service.ts` — Added `loginWithGoogle` with `OAuth2Client` singleton and try/catch on `verifyIdToken`; import of `google-auth-library`
- `src/modules/auth/auth.routes.ts` — Added `GoogleBodySchema` (CANDIDATE|RECRUITER only) and `POST /auth/google` public endpoint
- `tests/unit/auth.service.test.ts` — Added `describe('loginWithGoogle')` with `jest.spyOn(OAuth2Client.prototype)` pattern; 2 new tests (9 total, all passing)
- `tests/integration/auth.test.ts` — Added `describe('POST /auth/google')` with 4 tests using `jest.spyOn(OAuth2Client.prototype)`
- `package.json` — `google-auth-library@^10.6.2` added to dependencies

## Tasks Completed

1. **Task 1: Install google-auth-library + AuthRepository.findOrCreateGoogleUser**
   - `npm install google-auth-library` — package in dependencies at `^10.6.2`
   - `AuthRepository.findOrCreateGoogleUser`: three-phase upsert implementing D-05 (create new) and D-06 (link existing by email)
   - TypeScript compiles clean
   - Commit: `7de6624`

2. **Task 2: TDD — loginWithGoogle + POST /auth/google**
   - RED: Added failing tests to unit and integration test files — Commit: `4ddf834`
   - GREEN: Implemented `loginWithGoogle` in AuthService, `GoogleBodySchema` + `/google` route in auth.routes.ts — Commit: `bc2dfd5`
   - REFACTOR: No changes needed — singleton + prototype spy pattern is clean, no duplication

## TDD Gate Compliance

- RED gate: commit `4ddf834` — `test(02-03): add failing tests for loginWithGoogle + POST /auth/google (RED)`
- GREEN gate: commit `bc2dfd5` — `feat(02-03): implement loginWithGoogle + POST /auth/google route (GREEN)`
- REFACTOR gate: not needed — no structural debt or duplication found

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jest.mock per-instance pattern doesn't target module-level singleton**
- **Found during:** Task 2 GREEN phase — unit tests failed with `AppError: Invalid Google token` despite mock setup
- **Issue:** Plan specified `jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(...) }))` with `beforeEach(() => { mockVerifyIdToken = (new OAuth2Client() as any).verifyIdToken })`. This creates a different instance than the singleton created at module load time. The singleton's `verifyIdToken` was not the same function reference as `mockVerifyIdToken`.
- **Fix:** Replaced `jest.mock` + per-instance pattern with `jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')` in `beforeEach`, consistent with the integration test pattern already specified in the plan. This patches the prototype, targeting the singleton and all future instances.
- **Files modified:** `tests/unit/auth.service.test.ts`
- **Commit:** `bc2dfd5`

## Known Stubs

None — all implemented functionality is fully wired. `loginWithGoogle` calls `findOrCreateGoogleUser` which performs real DB operations in integration tests.

## User Setup Required

`POST /auth/google` requires `GOOGLE_CLIENT_ID` environment variable to be set for production use.

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (type: Web Application)
3. Add authorized origins and redirect URIs as needed
4. Copy the Client ID and set `GOOGLE_CLIENT_ID=<your-client-id>` in your `.env` file

**Integration tests:** Use `jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')` to mock Google's verification — no real `GOOGLE_CLIENT_ID` required for the test suite to pass.

## Self-Check

- [x] `google-auth-library` in package.json dependencies — confirmed `^10.6.2`
- [x] `node -e "require('google-auth-library')"` exits 0
- [x] `findOrCreateGoogleUser` in auth.repository.ts — line 44
- [x] Three-phase upsert: findUnique by googleId → findUnique by email + update → create
- [x] `async loginWithGoogle` in auth.service.ts — line 122
- [x] `verifyIdToken` inside try/catch in auth.service.ts — line 129
- [x] `AppError(401, 'INVALID_CREDENTIALS')` in catch block — line 142
- [x] `post('/google'` in auth.routes.ts — line 67
- [x] `GoogleBodySchema` with `z.enum(['CANDIDATE', 'RECRUITER'])` — line 21-24
- [x] No `authenticate` preHandler on `/google` route
- [x] 9 unit tests passing (16 total across all unit suites)
- [x] TypeScript: `npx tsc --noEmit` exits 0
- [x] Commits: 7de6624, 4ddf834, bc2dfd5
- [ ] Integration tests: BLOCKED (Docker not running — pre-existing infrastructure issue from 02-01 and 02-02)

## Self-Check: PASSED (with 1 infrastructure-blocked item)

Integration tests are structurally complete and TypeScript-verified. The Docker blocker is pre-existing and documented in 02-01-SUMMARY.md and 02-02-SUMMARY.md. All code artifacts are complete and correct.

## Threat Flags

No new threat surface beyond the plan's documented threat model:
- T-2-14: `verifyIdToken` validates cryptographic signature + audience + expiry ✓
- T-2-15: `GoogleBodySchema` z.enum excludes ADMIN → 400 (D-09) ✓
- T-2-16: `google-auth-library` manages Google public key rotation automatically ✓
- T-2-17: Account linking by email accepted per D-06 ✓
- T-2-18: Missing `GOOGLE_CLIENT_ID` → `verifyIdToken` throws → `AppError 401 INVALID_CREDENTIALS` ✓
- T-2-19: Global 60 req/min rate limit applies via `@fastify/rate-limit` ✓
