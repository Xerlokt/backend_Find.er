# Phase 2: Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 02-authentication
**Areas discussed:** Refresh token storage, Google OAuth2 flow, Registration role assignment, Rate limiting scope

---

## Refresh Token Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Prisma — RefreshToken table | New model in schema.prisma, revocation by userId, no new infra | ✓ |
| Redis — separate store | Fast lookups, TTL-based, adds new infra dependency | |
| Stateless — no storage | No revocation possible, doesn't satisfy AUTH-05 | |

**User's choice:** Prisma — RefreshToken table
**Notes:** n/a

---

## Token Rotation

| Option | Description | Selected |
|--------|-------------|----------|
| Rotation — single-use | Each exchange revokes old token, issues new one. Detects replay. Satisfies SEC-06. | ✓ |
| Multi-use until expiry | Same token works until expiresAt. Doesn't satisfy SEC-06. | |

**User's choice:** Rotation — single-use

---

## Refresh Token TTL

| Option | Description | Selected |
|--------|-------------|----------|
| 7 days | Standard for mobile apps, rotating tokens reset clock | ✓ |
| 30 days | Wider attack surface | |
| 1 day | Aggressive, forces frequent re-login | |

**User's choice:** 7 days

---

## Google OAuth2 Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Token exchange | Frontend gets Google ID token, POSTs to backend. Works on mobile. | ✓ |
| Redirect flow | Server-side redirect. Hard to implement on React Native. | |

**User's choice:** Token exchange (POST /auth/google with idToken in body)

---

## Google — New User Creation

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-create on first Google login | Creates User record immediately, role required in body | ✓ |
| Return 404 / require email registration first | Must register first, then link Google | |

**User's choice:** Auto-create on first Google login

---

## Registration Role Assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Single endpoint, role in body | POST /auth/register with role: 'CANDIDATE' \| 'RECRUITER' | ✓ |
| Separate endpoints per role | POST /auth/register/candidate and /recruiter | |

**User's choice:** Single endpoint, role in body

---

## ADMIN Self-Registration

| Option | Description | Selected |
|--------|-------------|----------|
| ADMIN blocked on register (422) | Zod rejects role: ADMIN. ADMINs seeded/granted separately. | ✓ |
| ADMIN allowed on register | Security vulnerability — rejected | |

**User's choice:** ADMIN blocked on register

---

## Rate Limiting Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per-endpoint, tighter on auth | login: 5/min, register: 3/min, refresh: 10/min, global: 60/min | ✓ |
| Global limit only | Single 60/min limit on all routes | |

**User's choice:** Per-endpoint with tighter auth limits

---

## Claude's Discretion

- Token generation mechanism (crypto.randomBytes vs uuid)
- Whether to use bcrypt or SHA-256 for refresh token storage
- google-auth-library vs manual decode for Google ID token validation
- Exact Prisma migration naming

## Deferred Ideas

- Password reset / forgot password flow — future phase
- Account linking UI (connect Google to existing email account) — v2
- Multi-device session management — v2
