---
phase: 04-jobs
plan: "02"
subsystem: job-expiry-scheduler
tags: [node-cron, fastify-plugin, tdd, scheduler, job-expiry]
dependency_graph:
  requires: [04-01-job-data-layer]
  provides: [job-expiry-scheduler]
  affects: [04-03-job-routes]
tech_stack:
  added: []
  patterns: [tdd-red-green, fastify-plugin, cron-scheduler, test-isolation]
key_files:
  created:
    - src/modules/job/job.scheduler.ts
    - src/shared/plugins/scheduler.ts
    - tests/unit/job.scheduler.test.ts
  modified:
    - src/app.ts
decisions:
  - "schedulerPlugin renamed internal function to 'plugin' to avoid duplicate identifier TS2300 — node-cron @types/node-cron v3 types incompatible with v4 runtime (scheduled option absent from TaskOptions)"
  - "{ scheduled: false } option removed from cron.schedule call — types incompatible; task.start() called immediately after schedule() to achieve same effect"
  - "schedulerPlugin registration guarded by !opts.testing in buildApp to prevent Jest open handle warnings and test pollution (T-04-02-04)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 4 Plan 02: Job Expiry Scheduler Summary

node-cron v4 scheduler firing every minute via Fastify plugin, delegating to JobRepository.deactivateExpiredJobs(), with full TDD unit coverage and test-mode isolation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TDD RED: failing unit tests for runExpiryCheck | 448537e | tests/unit/job.scheduler.test.ts |
| 1 | TDD GREEN: implement job.scheduler.ts | b39f0c5 | src/modules/job/job.scheduler.ts |
| 2 | schedulerPlugin + app.ts wiring | 330db74 | src/shared/plugins/scheduler.ts, src/app.ts |

## What Was Built

### job.scheduler.ts (`src/modules/job/job.scheduler.ts`)

Pure function `runExpiryCheck(repo: JobRepository): Promise<number>`:
- Delegates to `repo.deactivateExpiredJobs()`
- Returns count of deactivated jobs
- No direct DB dependency — injectable via constructor (testable)

### scheduler.ts plugin (`src/shared/plugins/scheduler.ts`)

Fastify plugin (via `fastify-plugin`) wrapping node-cron:
- Instantiates `JobRepository` inside the plugin
- Schedules cron expression `'* * * * *'` (every minute)
- Calls `runExpiryCheck(repo)` on each tick
- Logs count > 0 via `app.log.info` (no PII exposed — T-04-02-03)
- `try/catch` in cron callback prevents one failure from crashing the loop (T-04-02-01)
- `task.stop()` registered on `app.addHook('onClose')` for clean shutdown

### app.ts update (`src/app.ts`)

- Added `import { schedulerPlugin } from './shared/plugins/scheduler'`
- Registered `await app.register(schedulerPlugin)` after all routes, guarded by `if (!opts.testing)` (T-04-02-04)

## TDD Gate Compliance

- [x] RED gate: `test(04-02)` commit 448537e — 3 failing tests (module not found)
- [x] GREEN gate: `feat(04-02)` commit b39f0c5 — all 3 tests passing
- [x] No REFACTOR needed — implementation is minimal and clean

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate identifier TS2300 and invalid TaskOptions type**
- **Found during:** Task 2 — `npx tsc --noEmit` returned 2 errors
- **Issue 1:** `schedulerPlugin` identifier used for both the internal async function and the `fp(...)` export — TS2300 duplicate identifier
- **Issue 2:** `{ scheduled: false }` passed to `cron.schedule()` but `@types/node-cron@3.0.11` does not include `scheduled` in `TaskOptions` — TS2353
- **Fix:** Renamed internal function to `plugin`; removed `{ scheduled: false }` option (runtime auto-starts by default; `task.start()` call is sufficient)
- **Files modified:** `src/shared/plugins/scheduler.ts`
- **Commit:** 330db74

## Threat Mitigations Implemented

| Threat ID | Mitigation |
|-----------|------------|
| T-04-02-01 | try/catch in cron callback — errors logged via `app.log.error`, scheduler loop never crashes |
| T-04-02-02 | `deactivateExpiredJobs` uses hardcoded `{ lt: new Date() }` — no user input, Prisma ORM prevents injection |
| T-04-02-03 | Log output contains only integer count, no PII or job content |
| T-04-02-04 | `schedulerPlugin` registration guarded by `!opts.testing` — no background timers in Jest |

## Known Stubs

None.

## Threat Flags

None — scheduler introduces no new network endpoints, auth paths, or trust boundary changes. Internal process only.

## Self-Check: PASSED

- [x] `src/modules/job/job.scheduler.ts` — exists, exports `runExpiryCheck`
- [x] `src/shared/plugins/scheduler.ts` — exists, exports `schedulerPlugin`
- [x] `tests/unit/job.scheduler.test.ts` — exists, 3 tests
- [x] `src/app.ts` — updated with import + conditional register
- [x] Commit 448537e (test RED) — exists
- [x] Commit b39f0c5 (feat GREEN) — exists
- [x] Commit 330db74 (feat plugin+wiring) — exists
- [x] `npx jest tests/unit/job.scheduler.test.ts --no-coverage` — 3/3 passing
- [x] `npx tsc --noEmit` — 0 errors
