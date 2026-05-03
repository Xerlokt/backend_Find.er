---
status: passed
phase: 07-credits
source: [07-VERIFICATION.md]
started: 2026-05-02T21:15:00Z
updated: 2026-05-02T21:20:00Z
---

## Current Test

Completed via integration tests against real DB (Docker).

## Tests

### 1. Unlock endpoint end-to-end
expected: Authenticate as RECRUITER, POST /jobs/:jobId/candidates/:candidateId/unlock where candidateId has a DISLIKE swipe and company has credits >= 2 → 201 with body: { id, companyId, candidateId, jobId, unlockedAt, creditsCost: 2, profile: { name, bio, skills, distanceKm } }
result: PASSED — credits.test.ts 11/11 GREEN (happy path, PRO pricing, all 7 error paths)

### 2. Ranking reveal after unlock
expected: After unlocking a DISLIKE candidate, GET /jobs/:jobId/ranking → the previously censored candidate (profile: null) now returns with non-null profile containing name and skills
result: PASSED — swipe.test.ts includes 2 unlock reveal tests, all GREEN

### 3. Admin audit log
expected: As ADMIN, PATCH /admin/companies/:id/credits with { amount: 5 }, then GET /admin/companies/:id/transactions → 200 with array containing entry where reason === 'admin_grant' and amount === 5
result: PASSED — admin.test.ts includes 3 audit log tests, all GREEN

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

Note: npm test full suite — 212/214 tests pass. 2 pre-existing failures in company.service.test.ts (documented in 07-03 SUMMARY, unrelated to Phase 7).
