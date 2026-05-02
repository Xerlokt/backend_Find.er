---
phase: 06-recommendation
plan: 01
subsystem: recommendation
tags: [neo4j, recommendation, interface, tdd, seed, wave0]
dependency_graph:
  requires: []
  provides:
    - src/shared/interfaces/recommendation.interface.ts (IRecommendationService, CandidateData, JobData)
    - src/modules/recommendation/recommendation.repository.ts (RecommendationRepository skeleton)
    - scripts/seed-neo4j.ts (CLI seed entry point)
    - tests/helpers/neo4j-setup.ts (setupNeo4j test helper)
    - tests/unit/recommendation.service.test.ts (12 RED unit test stubs)
    - tests/integration/recommendation.test.ts (7 RED integration test stubs)
  affects:
    - src/shared/db/neo4j.ts (disableLosslessIntegers config)
tech_stack:
  added: []
  patterns:
    - Neo4j session lifecycle with try/finally
    - ARCH-04 interface boundary (IRecommendationService in shared/interfaces/)
    - TDD Wave 0 stubs (RED state before implementation in Plan 06-02)
    - Idempotent Cypher MERGE for taxonomy seed
key_files:
  created:
    - src/shared/interfaces/recommendation.interface.ts
    - src/modules/recommendation/recommendation.repository.ts
    - scripts/seed-neo4j.ts
    - tests/helpers/neo4j-setup.ts
    - tests/unit/recommendation.service.test.ts
    - tests/integration/recommendation.test.ts
  modified:
    - src/shared/db/neo4j.ts
decisions:
  - "IRecommendationService placed in src/shared/interfaces/ to satisfy ARCH-04 module isolation (swipe module depends on interface, not concrete repository)"
  - "RecommendationRepository.computeFitScore() is a stub returning 0 in 06-01 — full 5-factor algorithm implemented in Plan 06-02"
  - "seedTaxonomy() uses MERGE statements to ensure idempotency — safe to run multiple times"
  - "disableLosslessIntegers:true added to neo4j.ts driver config to ensure all Cypher integers return as JS number, not neo4j.Integer objects"
  - "neo4j-setup.ts exports a function (not global hooks) to keep Neo4j cleanup isolated to recommendation integration tests only"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-02"
  tasks_completed: 2
  files_created: 6
  files_modified: 1
---

# Phase 06 Plan 01: Neo4j Seed + RecommendationRepository Skeleton + Wave 0 Test Stubs Summary

**One-liner:** Neo4j driver config fixed with disableLosslessIntegers, IRecommendationService ARCH-04 interface established, RecommendationRepository skeleton with idempotent MERGE-based taxonomy seed, and 19 RED test stubs created for TDD Wave 0.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Driver config fix + interface + repository skeleton + seed script | c2469cc | neo4j.ts, recommendation.interface.ts, recommendation.repository.ts, seed-neo4j.ts |
| 2 | Wave 0 test stubs — unit + integration + neo4j-setup helper | 4b08fa3 | recommendation.service.test.ts, recommendation.test.ts, neo4j-setup.ts |

## What Was Built

### Task 1: Foundation Files

**src/shared/db/neo4j.ts** — Single-line fix: added `{ disableLosslessIntegers: true }` as third argument to `neo4j.driver()`. This ensures Cypher integer results are returned as native JS `number`, not `neo4j.Integer` objects, which is critical for the fit score computation in Plan 06-02.

**src/shared/interfaces/recommendation.interface.ts** — New directory `src/shared/interfaces/` created. Exports `CandidateData`, `JobData`, and `IRecommendationService` as the ARCH-04 boundary. The swipe module will depend on this interface, not directly on `RecommendationRepository`.

**src/modules/recommendation/recommendation.repository.ts** — New module directory created. `RecommendationRepository` implements `IRecommendationService` and exposes:
- `computeFitScore()` — stub returning 0 (GREEN in Plan 06-02)
- `seedTaxonomy()` — seeds 6 Profession nodes, 10 Skill nodes, 8 REQUIRES relationships, and 3 bidirectional RELATED_TO relationships using idempotent MERGE statements. All Cypher uses parameterized queries (`$id`, `$name`, `$profId`, `$skillId`). Uses `try/finally` pattern for session lifecycle (T-06-03 mitigation).

**scripts/seed-neo4j.ts** — CLI entry point for seeding Neo4j taxonomy. Calls `repo.seedTaxonomy()`, logs completion, closes the driver in a `finally` block.

### Task 2: Wave 0 Test Stubs

**tests/helpers/neo4j-setup.ts** — Exports `setupNeo4j()` function (not global hooks). Clears all graph nodes with `MATCH (n) DETACH DELETE n`, then re-seeds via `RecommendationRepository.seedTaxonomy()`. Uses `try/finally` for session lifecycle.

**tests/unit/recommendation.service.test.ts** — 14 test cases across 6 describe blocks (profession, skills, location, work mode, salary, composite). 12 tests are RED (failing because stub returns 0). 2 tests pass trivially (`score >= 0 <= 100`). This is the correct TDD RED state — Plan 06-02 implements the algorithm to turn these GREEN.

**tests/integration/recommendation.test.ts** — 7 integration test cases for `seedTaxonomy` (4 cases: Profession count, Skill count, idempotency, REQUIRES relationships) and `computeFitScore` (3 cases: range check, perfect match=100, zero match=0, partial match). Blocked by Docker (pre-existing constraint).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `computeFitScore` returns `0` | src/modules/recommendation/recommendation.repository.ts | Intentional — Plan 06-02 implements the 5-factor scoring algorithm. This is Wave 0 TDD RED state. |

These stubs are intentional and documented. Plan 06-02 (Wave 1) resolves them.

## Threat Surface Scan

All mitigations from the plan's threat model were applied:

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-06-01 (Cypher injection) | Mitigated | All Cypher in seedTaxonomy() uses `$id`, `$name`, `$profId`, `$skillId` parameters — no string interpolation |
| T-06-02 (disableLosslessIntegers) | Accepted | Config change only; no data exposure |
| T-06-03 (Session leak) | Mitigated | `try/finally { await session.close() }` in both recommendation.repository.ts and neo4j-setup.ts |
| T-06-04 (Credentials) | Accepted | Credentials sourced from `.env` via `dotenv/config`, not CLI args |

No new threat surface detected beyond what the plan's threat model covers.

## Self-Check

---

### File Existence

- [x] src/shared/db/neo4j.ts — modified (exists)
- [x] src/shared/interfaces/recommendation.interface.ts — created
- [x] src/modules/recommendation/recommendation.repository.ts — created
- [x] scripts/seed-neo4j.ts — created
- [x] tests/helpers/neo4j-setup.ts — created
- [x] tests/unit/recommendation.service.test.ts — created
- [x] tests/integration/recommendation.test.ts — created

### Commit Existence

- [x] c2469cc — feat(06-01): Task 1
- [x] 4b08fa3 — test(06-01): Task 2

### Test State

- Unit tests: 12/14 FAILING (RED — correct, stub returns 0)
- tsc --noEmit: exits 0

## Self-Check: PASSED
