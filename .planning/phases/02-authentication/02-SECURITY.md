---
phase: 02-authentication
slug: authentication
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-18
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client → POST /auth/register | Unvalidated email, password, role | PII (email), secret (password) |
| Client → POST /auth/login | Untrusted credentials | PII (email), secret (password) |
| Client → POST /auth/refresh | Opaque refresh token in body | Session credential (refresh token hex) |
| Client → POST /auth/logout | Opaque refresh token in body | Session credential (refresh token hex) |
| Client → POST /auth/google | Google idToken in body | Third-party identity token |
| Internet → app.ts | All HTTP requests | Rate-limited before reaching handlers |
| AuthRepository → PostgreSQL | Prisma ORM queries | User credentials, token hashes |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-2-01 | Spoofing | POST /auth/register | mitigate | `bcrypt.hash(password, 12)` (auth.service.ts:44); `z.string().email()` (auth.routes.ts:7) | closed |
| T-2-02 | Tampering | AuthService.login DUMMY_HASH | mitigate | Valid 60-char `$2b$12$` hash at auth.service.ts:20; `?? DUMMY_HASH` ensures full KDF always runs (auth.service.ts:58-61) | closed |
| T-2-03 | Elevation of Privilege | role field in register | mitigate | `z.enum(['CANDIDATE','RECRUITER'])` in RegisterBodySchema — ADMIN excluded (auth.routes.ts:9) | closed |
| T-2-04 | Tampering | AuthRepository SQL injection | accept | All queries via Prisma ORM — no `$queryRaw` or string interpolation (auth.repository.ts:1-84) | closed |
| T-2-05 | Information Disclosure | errorHandler stack leak | accept | `code` exposed intentionally (errorHandler.ts:13); stack suppressed, generic 500 returned (errorHandler.ts:56) | closed |
| T-2-06 | Denial of Service | POST /auth/register rate limit | mitigate | 3 req/min override on /register (auth.routes.ts:32) | closed |
| T-2-07 | Elevation of Privilege | POST /auth/refresh replay | mitigate | `prisma.$transaction` atomic rotation; replay revokes entire family (auth.service.ts:87-99) | closed |
| T-2-08 | Denial of Service | POST /auth/login brute force | mitigate | 5 req/min on /login (auth.routes.ts:41) | closed |
| T-2-09 | Denial of Service | POST /auth/register bulk | mitigate | 3 req/min on /register (auth.routes.ts:32) | closed |
| T-2-10 | Spoofing | POST /auth/refresh fake token | mitigate | SHA-256 hash lookup; not found → 401 UNAUTHORIZED (auth.service.ts:85, 93-94) | closed |
| T-2-11 | Information Disclosure | login timing side-channel | mitigate | `user?.passwordHash ?? DUMMY_HASH` forces full KDF on missing user (auth.service.ts:58-61) | closed |
| T-2-12 | Tampering | rate-limit plugin order | mitigate | `rateLimitPlugin` registered at app.ts:23, before routes at lines 29-30 | closed |
| T-2-13 | Elevation of Privilege | logout another user's token | accept | Logout is idempotent, returns 204 empty — revoking another session has no privilege impact (auth.service.ts:121-132) | closed |
| T-2-14 | Spoofing | POST /auth/google fake idToken | mitigate | `OAuth2Client.verifyIdToken` checks signature + audience + expiry; all failures → 401 (auth.service.ts:141-155) | closed |
| T-2-15 | Elevation of Privilege | POST /auth/google role ADMIN | mitigate | `GoogleBodySchema` `z.enum(['CANDIDATE','RECRUITER'])` — ADMIN excluded (auth.routes.ts:22-25) | closed |
| T-2-16 | Information Disclosure | Google public key rotation | accept | `google-auth-library` manages key rotation automatically; no manual key handling (auth.service.ts:11) | closed |
| T-2-17 | Spoofing | account linking D-06 by email | accept | Linking gated on prior `verifyIdToken` success — Google confirms email ownership (auth.repository.ts:59-68) | closed |
| T-2-18 | Tampering | missing GOOGLE_CLIENT_ID | mitigate | Missing env → `verifyIdToken` throws → caught → AppError 401 INVALID_CREDENTIALS; no bypass (auth.service.ts:141-155) | closed |
| T-2-19 | Denial of Service | POST /auth/google rate limit | mitigate | 5 req/min on /google (auth.routes.ts:67-70) | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-2-01 | T-2-04 | Prisma ORM parameterizes all queries by design — no raw SQL possible via standard API | Claude (gsd-security-auditor) | 2026-04-18 |
| AR-2-02 | T-2-05 | Error codes (INVALID_CREDENTIALS, CONFLICT) are intentional API contracts for clients; stack traces never forwarded | Claude (gsd-security-auditor) | 2026-04-18 |
| AR-2-03 | T-2-13 | Logout idempotency means revoking an unknown token is a no-op; revoking another user's token ends their session with no privilege gain | Claude (gsd-security-auditor) | 2026-04-18 |
| AR-2-04 | T-2-16 | Google key rotation is managed by google-auth-library — outside project scope; library is maintained by Google | Claude (gsd-security-auditor) | 2026-04-18 |
| AR-2-05 | T-2-17 | Email-based account linking (D-06) is accepted per product design; Google certifies email ownership before any linking occurs | Claude (gsd-security-auditor) | 2026-04-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-18 | 19 | 19 | 0 | Claude (gsd-security-auditor) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-18
