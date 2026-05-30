---
status: partial
phase: 17-disc-personality-assessment
source: [17-VERIFICATION.md]
started: 2026-05-29T00:00:00.000Z
updated: 2026-05-29T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. DISC field visible in ranking censored card

Verify that when a candidate has completed the DISC assessment and the job has `discProfile` set, the censored candidate card returned by `GET /jobs/:id/ranking` includes `discProfile` in the profile object. Conversely, a candidate without a DISC result should have the `discProfile` key absent (not null) from their card.

**Steps:**
1. Register two candidates and create their profiles
2. One candidate POSTs to `/candidates/:id/disc` with answers (e.g. `['D','D','D','D']`)
3. The other candidate does not submit DISC
4. Create a job with `discProfile: 'D'` set
5. Both candidates swipe right (LIKE) on the job (or use a recruiter to see their ranking)
6. Recruiter calls `GET /jobs/:id/ranking`
7. For the DISC candidate's card: verify `profile.discProfile === 'D'`
8. For the no-DISC candidate's card: verify `'discProfile' in card.profile === false`

expected: Candidate with DISC data shows `discProfile: 'D'` in censored card; candidate without DISC has `discProfile` key absent from the card object.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
