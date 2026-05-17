---
phase: 15-redis-caching
plan: "01"
subsystem: cache-infrastructure
tags: [redis, ioredis, ICachePort, tdd-red, prisma-indexes, check-deps, docker]
dependency_graph:
  requires: []
  provides:
    - ICachePort interface at src/application/ports/cache.port.ts
    - RED unit tests for GetFeedUseCase cache injection (4 tests)
    - RED unit tests for GetRankingUseCase cache injection (4 tests)
    - RED unit tests for RecordSwipeUseCase cache invalidation (2 new tests)
    - RED unit tests for UpsertCandidateProfileUseCase cache invalidation (1 new test)
    - check-deps.ts SCALE-03 split rule (4 rules, named infrastructure label)
    - 4 Prisma @@index entries for SCALE-04
    - redis + redis_test Docker Compose services
    - ioredis@5.10.1 + ioredis-mock@8.13.1 installed
  affects:
    - tests/unit/record-swipe.use-case.test.ts (updated constructor arity)
    - tests/unit/upsert-candidate-profile.use-case.test.ts (updated constructor arity)
    - scripts/check-deps.ts (split rule for traceable violations)
    - prisma/schema.prisma (4 new @@index entries, migration needed in Plan 02)
    - docker-compose.yml (2 new Redis services)
tech_stack:
  added:
    - ioredis@5.10.1 (Redis client with bundled TypeScript types)
    - ioredis-mock@8.13.1 (in-memory ioredis drop-in for unit tests)
  patterns:
    - ICachePort follows IHashPort structural pattern (bare interface, no imports, Promise-returning)
    - makeCache() factory pattern mirrors makeChatPort() in record-swipe test
    - RED TDD gate: all 4 use-case test files fail with TS2554 (Expected N args, got N+1)
key_files:
  created:
    - src/application/ports/cache.port.ts
    - tests/unit/get-feed.use-case.test.ts
    - tests/unit/get-ranking.use-case.test.ts
    - tests/unit/check-deps.test.ts
    - tests/integration/indexes.test.ts
  modified:
    - docker-compose.yml
    - package.json
    - package-lock.json
    - scripts/check-deps.ts
    - prisma/schema.prisma
    - tests/unit/record-swipe.use-case.test.ts
    - tests/unit/upsert-candidate-profile.use-case.test.ts
decisions:
  - "ICachePort placed in application/ports/ (not domain/) — use cases are in application/, ports belong with their consumers"
  - "ioredis installed with --legacy-peer-deps due to madge@8.0.0 peer conflict with typescript@6.x via detective-typescript transitive dep"
  - "check-deps.ts RULES split into 4 objects — application rule separated into adapters-rule and infrastructure-rule for named violation messages (SCALE-03)"
  - "Prisma @@index([candidateId]) added to Swipe despite existing @@unique([candidateId, jobId]) — SCALE-04 requires explicit index for intent clarity"
  - "Redis services use no volume mounts — ephemeral is correct for dev and test cache data"
  - "Integration indexes.test.ts is RED until Plan 02 runs migration (EXPLAIN shows Seq Scan before index exists)"
metrics:
  duration: "~20min"
  completed: "2026-05-17"
  tasks_completed: 3
  files_created: 5
  files_modified: 7
---

# Phase 15 Plan 01: Redis Caching — Wave 0 RED Setup Summary

**One-liner:** ICachePort interface + ioredis packages + 4 failing cache-injection unit tests + 4 Prisma @@index entries + check-deps split rule + Redis Docker services.

## What Was Built

Wave 0 (RED phase) establishes the test-first contract for the entire Redis caching feature:

1. **ICachePort interface** (`src/application/ports/cache.port.ts`) — mirrors IHashPort structural pattern. 4 methods: `get`, `set`, `del`, `invalidatePattern`. No ioredis imports — pure abstraction.

2. **ioredis@5.10.1** added to dependencies, **ioredis-mock@8.13.1** to devDependencies. Installed with `--legacy-peer-deps` due to madge peer conflict (see Deviations).

3. **Redis Docker services** — `redis` on port 6379 (dev) and `redis_test` on port 6380 (test isolation), matching the existing `postgres_test` isolation pattern.

4. **RED unit tests** — 4 test files fail with `TS2554: Expected N arguments, but got N+1` because use case constructors don't yet accept `ICachePort`:
   - `get-feed.use-case.test.ts` — 4 tests (cache HIT/MISS/cursor skip/Redis error fallthrough)
   - `get-ranking.use-case.test.ts` — 4 tests (cache HIT/MISS/FORBIDDEN 403/NOT_FOUND 404)
   - `record-swipe.use-case.test.ts` — 4 existing + 2 new (cache.del after LIKE/DISLIKE)
   - `upsert-candidate-profile.use-case.test.ts` — 1 existing + 1 new (cache.invalidatePattern)

5. **check-deps.ts SCALE-03** — Rule 2 split into two named rules: `application must not import adapters` and `application must not import infrastructure (including infrastructure/database)`. RULES array now has 4 objects with traceable violation labels.

6. **Prisma @@index entries** (SCALE-04) — 4 new indexes across 3 models:
   - `Swipe @@index([candidateId])` — swipe-by-candidate query pattern
   - `Swipe @@index([jobId])` — findSwipesByJobId pattern
   - `Job @@index([isActive, expiresAt])` — active feed query
   - `CandidateProfile @@index([professionId])` — recommendation filter

7. **Integration test stub** (`tests/integration/indexes.test.ts`) — EXPLAIN-based tests for all 4 index patterns. RED until Plan 02 runs `prisma migrate dev`.

8. **check-deps unit test** (`tests/unit/check-deps.test.ts`) — verifies the SCALE-03 split rule label exists and that `npm run check:deps` exits 0 on the clean codebase.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9defaac | feat(15-01): install ioredis packages, define ICachePort, add Redis Docker services |
| 2 | c88ad94 | test(15-01): RED unit tests for GetFeedUseCase and GetRankingUseCase cache injection |
| 3 | c3f91ec | test(15-01): RED tests for RecordSwipe/UpsertProfile cache; check-deps split; 4 Prisma indexes |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with one deviation requiring note:

**1. [Rule 3 - Blocking] npm install ioredis required --legacy-peer-deps**
- **Found during:** Task 1
- **Issue:** `npm install ioredis` failed with ERESOLVE — madge@8.0.0 has a transitive dependency on detective-typescript which requires `typescript@">=4.8.4 <6.1.0"`, but the project uses `typescript@6.0.3`. Standard `npm install` refuses to resolve.
- **Fix:** Used `npm install ioredis --legacy-peer-deps` and `npm install --save-dev ioredis-mock --legacy-peer-deps`. Packages installed correctly at their intended versions. The peer conflict is in madge (a dev tool), not in ioredis itself — no runtime impact.
- **Files modified:** package.json, package-lock.json
- **Commit:** 9defaac

## Wave 0 Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (exits 0) |
| `get-feed.use-case.test.ts` fails (RED) | PASS — TS2554 Expected 2 args got 3 |
| `get-ranking.use-case.test.ts` fails (RED) | PASS — TS2554 Expected 2 args got 3 |
| `record-swipe.use-case.test.ts` fails (RED) | PASS — TS2554 Expected 2 args got 3 |
| `upsert-candidate-profile.use-case.test.ts` fails (RED) | PASS — TS2554 Expected 1 arg got 2 |
| `grep -c "@@index" prisma/schema.prisma` >= 6 | PASS — returns 6 |
| `grep "redis:" docker-compose.yml` | PASS |
| `grep "ioredis" package.json` | PASS — both packages present |
| `grep -c "label:" scripts/check-deps.ts` | 5 (includes type def line) — 4 rule objects confirmed |
| `check-deps.test.ts` passes | PASS — 2 tests pass |

## Known Stubs

- `tests/integration/indexes.test.ts` — integration tests for Prisma indexes. RED until Plan 02 runs `npx prisma migrate dev --name add_scale04_indexes`. After migration the EXPLAIN queries will show `Index Scan` instead of `Seq Scan`.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes in this plan. ICachePort is a pure TypeScript interface with no runtime surface. check-deps.ts is a dev-time enforcement script.

## Self-Check: PASSED

Files confirmed to exist:
- src/application/ports/cache.port.ts — FOUND
- tests/unit/get-feed.use-case.test.ts — FOUND
- tests/unit/get-ranking.use-case.test.ts — FOUND
- tests/unit/check-deps.test.ts — FOUND
- tests/integration/indexes.test.ts — FOUND

Commits confirmed:
- 9defaac — FOUND
- c88ad94 — FOUND
- c3f91ec — FOUND
