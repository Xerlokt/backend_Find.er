---
status: partial
phase: 07-credits
source: [07-VERIFICATION.md]
started: 2026-05-02T21:15:00Z
updated: 2026-05-02T21:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Unlock endpoint end-to-end
expected: Authenticate as RECRUITER, POST /jobs/:jobId/candidates/:candidateId/unlock where candidateId has a DISLIKE swipe and company has credits >= 2 → 201 with body: { id, companyId, candidateId, jobId, unlockedAt, creditsCost: 2, profile: { name, bio, skills, distanceKm } }
result: [pending]

### 2. Ranking reveal after unlock
expected: After unlocking a DISLIKE candidate, GET /jobs/:jobId/ranking → the previously censored candidate (profile: null) now returns with non-null profile containing name and skills
result: [pending]

### 3. Admin audit log
expected: As ADMIN, PATCH /admin/companies/:id/credits with { amount: 5 }, then GET /admin/companies/:id/transactions → 200 with array containing entry where reason === 'admin_grant' and amount === 5
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

Note: npm test was run during execute-phase — 212/214 tests pass. 2 pre-existing failures in company.service.test.ts (documented in 07-03 SUMMARY as pre-existing, unrelated to Phase 7).
