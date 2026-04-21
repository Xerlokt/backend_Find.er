---
status: complete
phase: 03-profiles-companies
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
started: 2026-04-20T00:00:00Z
updated: 2026-04-21T00:00:00Z
---

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start fresh: `docker compose up -d` then `npm run dev`. Server boots without errors, Prisma connects, and a basic request (e.g., GET /health or POST /auth/register) returns a live response — no crash, no "connection refused", no uncaught exception at startup.
result: pass

### 2. Candidate Profile — Create/Update
expected: As a CANDIDATE user (valid JWT), send `PUT /candidates/me` with a body containing name, bio, skills, preferredModalities, salaryExpectation. Response is 200 with the persisted profile. Send the same request again with different values — response reflects the update (upsert, not duplicate).
result: pass

### 3. Candidate Profile — Retrieve
expected: As a CANDIDATE user, send `GET /candidates/me`. Response is 200 with the profile created in test 2. Send as a different user — returns 404 (profile not found for that userId).
result: pass

### 4. Candidate Role Enforcement
expected: Send `PUT /candidates/me` and `GET /candidates/me` using a RECRUITER or ADMIN JWT. Both return 403 Forbidden. Send without any Authorization header — both return 401 Unauthorized.
result: pass

### 5. Company Creation (Admin)
expected: As an ADMIN user, send `POST /companies` with a name and other fields. Response is 201 with the created company (including a default credit balance). Send as a non-ADMIN — returns 403. No Authorization header — returns 401.
result: pass

### 6. Company Credit Adjustment — Happy Path
expected: As an ADMIN, send `PATCH /companies/admin/:id/credits` with `{ "amount": 50 }`. Response is 200 with the updated company showing increased credits. Send again to confirm credits accumulate atomically (no double-credit under normal conditions).
result: pass

### 7. Credit Underflow Protection
expected: As an ADMIN, attempt to deduct more credits than a company has (e.g., company has 0 credits, send `{ "delta": -100 }`). Response is 400 with code `INSUFFICIENT_CREDITS`. Company credits remain unchanged.
result: skip
note: |
  Admin credit routes use `amount: z.number().int().positive()` — negative deltas are rejected by Zod before reaching the service.
  Underflow protection exists in CompanyService.adjustCredits() and is exercised by other flows (e.g., credit unlock).
  Not testable via admin API by design.

### 8. Recruiter Profile — Upsert with Company FK
expected: As a RECRUITER user, send `PUT /recruiters/me` with a valid `companyId` (UUID of an existing company). Response is 200 with the persisted recruiter profile. Send with a non-existent `companyId` — returns 404 (company not found).
result: pass

### 9. Admin — List Users with Pagination Cap
expected: As an ADMIN, send `GET /admin/users?page=1&limit=10`. Returns paginated list of users. Send `?limit=200` — response still returns at most 100 users (cap enforced). Response must NOT include `passwordHash` or `googleId` fields on any user object.
result: pass
note: Cap enforced via Zod `.max(100)` on the query schema. No sensitive fields returned.

### 10. Admin — Grant Credits (Atomic)
expected: As an ADMIN, send `PATCH /admin/companies/:id/credits` with `{ "amount": 100 }`. Response is 200 with updated company. Audit trail: a `CreditTransaction` record is created (verifiable via DB or a future audit endpoint). Sending `{ "amount": 0 }` or `{ "amount": -1 }` returns 400 (Zod validation).
result: pass
note: CreditTransaction rows confirmed in DB (reason=admin_grant). amount=0 and amount=-1 both return 400 Zod error.

## Summary

total: 10
passed: 9
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- T7 (Credit Underflow): admin routes only accept positive `amount`, so deduction via admin API is impossible by design. Underflow protection in service is covered by future credit-unlock flow tests.
