---
status: partial
phase: 15-redis-caching
source: [15-VERIFICATION.md]
started: 2026-05-17T00:00:00Z
updated: 2026-05-17T00:00:00Z
---

## Current Test

Awaiting Docker to run integration test suite.

## Tests

### 1. Cache hit — second feed request within 60s returns identical JSON (SCALE-01)
expected: `docker compose up postgres_test redis_test -d` then `npx jest tests/integration/swipe.test.ts -t "cache" --runInBand --no-coverage` exits 0; `res2.body` equals `res1.body`
result: [pending]

### 2. Swipe invalidation — after swipe, next feed request reflects updated state (SCALE-01)
expected: same test run; swiped job absent from next feed response after POST /swipes
result: [pending]

### 3. Profile update invalidation — ranking reflects new fit score after profile update (SCALE-02)
expected: same test run; ranking response is 200 and reflects updated candidate data after PUT /candidates/me
result: [pending]

### 4. EXPLAIN index verification — 4 query patterns use Index Scan (SCALE-04)
expected: `npx prisma migrate deploy` against test DB then `npx jest tests/integration/indexes.test.ts --runInBand --no-coverage` exits 0; all 4 queries match `/Index/`
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
