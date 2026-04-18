---
status: complete
phase: 02-authentication
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
started: 2026-04-18T00:00:00Z
updated: 2026-04-18T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start Docker if not running (`docker compose up -d`), apply migrations (`npx prisma migrate deploy`), then start the server (`npm run dev` or `npm start`). The server boots without errors. `GET /health` returns HTTP 200 with a live response.
result: pass

### 2. POST /auth/register — success
expected: Send `POST /auth/register` with `{ "email": "test@example.com", "password": "Test1234!", "role": "CANDIDATE" }`. Response is HTTP 201 with `{ "accessToken": "<jwt>", "refreshToken": "<hex>" }`. Both tokens are non-empty strings.
result: pass

### 3. POST /auth/register — duplicate email
expected: Send the same register payload a second time (same email). Response is HTTP 409 with `{ "error": "...", "code": "CONFLICT" }`. No second user is created.
result: pass

### 4. POST /auth/register — rate limit
expected: Send 4 register requests in under 1 minute from the same IP (any payload). The 4th request returns HTTP 429 with a `retryAfter` field in the response body (limit is 3/min).
result: pass

### 5. POST /auth/login — valid credentials
expected: Send `POST /auth/login` with the email/password registered in test 2. Response is HTTP 200 with `{ "accessToken": "<jwt>", "refreshToken": "<hex>" }`.
result: pass

### 6. POST /auth/login — wrong password
expected: Send `POST /auth/login` with the correct email but a wrong password. Response is HTTP 401 with `{ "code": "INVALID_CREDENTIALS" }`. No 500 error.
result: pass

### 7. POST /auth/login — unknown email (timing-safe)
expected: Send `POST /auth/login` with an email that was never registered. Response is HTTP 401 with `{ "code": "INVALID_CREDENTIALS" }`. Response time is comparable to the wrong-password case (no fast-reject that reveals whether the email exists).
result: pass

### 8. POST /auth/refresh — valid token rotation
expected: Use the refreshToken from test 5. Send `POST /auth/refresh` with `{ "refreshToken": "<token>" }`. Response is HTTP 200 with a NEW `accessToken` and a NEW `refreshToken`. The old refreshToken is now invalid.
result: pass

### 9. POST /auth/refresh — replay attack detection
expected: Take the OLD refreshToken that was used in test 8 (the one that was rotated out). Send `POST /auth/refresh` again with that token. Response is HTTP 401 with `{ "code": "TOKEN_EXPIRED" }`. The entire token family is revoked — the NEW token from test 8 is also now invalid.
result: pass

### 10. POST /auth/logout — success
expected: Register a fresh user, obtain a refreshToken. Send `POST /auth/logout` with `{ "refreshToken": "<token>" }`. Response is HTTP 204 (no body). Calling `/auth/refresh` with the same token afterwards returns 401.
result: pass

### 11. POST /auth/google — valid Google ID token
expected: Send `POST /auth/google` with a real Google ID token. Response is HTTP 200 with `{ "accessToken", "refreshToken" }`.
result: skipped
reason: Requires Google Cloud OAuth2 app configured with real GOOGLE_CLIENT_ID — not available in current test environment.

### 12. POST /auth/google — invalid Google ID token
expected: Send `POST /auth/google` with `{ "idToken": "not-a-real-token", "role": "CANDIDATE" }`. Response is HTTP 401 with `{ "code": "INVALID_CREDENTIALS" }`. No 500 error.
result: pass

## Summary

total: 12
passed: 11
issues: 0
pending: 0
skipped: 1

## Gaps

[none]
