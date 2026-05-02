---
status: complete
phase: 05-swipe
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md
started: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/Docker containers. Run `docker compose up -d` then `npm run dev` (or `npm start`). Server boots without errors. Run `npx tsc --noEmit` — exits 0. A basic health check or any GET endpoint returns a live response (not ECONNREFUSED).
result: pass

### 2. POST /swipes — Happy Path + Duplicate Guard
expected: Authenticate as a CANDIDATE. POST /swipes with `{ "jobId": "<valid-active-job-uuid>", "direction": "LIKE" }` → 201 Created. Send the exact same request again → 409 with code DUPLICATE_SWIPE. The candidateId in the created swipe matches the authenticated user's candidate profile (not any value from the request body).
result: pass

### 3. POST /swipes — Auth & Role Guards
expected: Send POST /swipes with no Authorization header → 401. Authenticate as a RECRUITER and send the same request → 403. Send an invalid direction value (e.g. "MAYBE") → 400. Send a valid direction against a job with isActive:false → 404.
result: pass

### 4. GET /jobs/feed — Feed Exclusions + Cursor Pagination
expected: Authenticate as a CANDIDATE. GET /jobs/feed → 200 with `{ data: [...], nextCursor }`. Jobs the candidate already swiped on do NOT appear in the feed. If there are more jobs than the page limit, nextCursor is non-null and a second request with ?cursor=<nextCursor> returns the next page with no overlap. A RECRUITER → 403.
result: pass

### 5. GET /jobs/:jobId/ranking — Ranking Response Shape
expected: Authenticate as the RECRUITER who owns a job. GET /jobs/<jobId>/ranking → 200 with an array. Each item has: rank (1-based integer), fitScore (0 for now), distanceKm (number or null). LIKE swipes: item.profile contains name, bio, skills, etc. DISLIKE swipes: item.profile is null (identity censored). No lat or lng field appears anywhere in the response.
result: pass

### 6. GET /jobs/:jobId/ranking — Auth Guards + Ownership
expected: A RECRUITER who does NOT own the job → 403 FORBIDDEN. A CANDIDATE → 403. No Authorization header → 401. A RECRUITER who owns the job but the job has no swipes → 200 with an empty array.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
