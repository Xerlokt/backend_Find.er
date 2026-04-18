# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Neo4j recommendation engine that calculates fit score between candidate and job — without it, the product does not exist
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 8 (Foundation)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-04-18 — Plan 01-02 executed (Fastify app factory, plugins, Jest harness)

Progress: [█░░░░░░░░░] 4%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: ~20min
- Total execution time: 0.67 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 1 | ~20min | ~20min |

**Recent Trend:**
- Last 5 plans: 01-01
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization: Neo4j for fit scoring (graph traversal required), PostgreSQL via Prisma for relational data, Fastify over Express, WebSocket for chat, credits only for companies
- 01-01: Prisma v7 datasource URL moved to prisma.config.ts (breaking change — url in schema datasource block is no longer supported)
- 01-01: prisma-client-js generator kept in schema (still works in v7, generates to node_modules/@prisma/client)

### Pending Todos

None yet.

### Blockers/Concerns

- Docker Desktop Linux engine not running at 01-01 execution — migration deferred. User must start Docker Desktop then run: `docker compose up -d && npx prisma migrate dev --name init && npx prisma generate`

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-17
Stopped at: Plan 01-02 complete. Next: 01-03 (Neo4j driver, error handler, health route).
Resume file: .planning/phases/01-foundation/01-02-SUMMARY.md
