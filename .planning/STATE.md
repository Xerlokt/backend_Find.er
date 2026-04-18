# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Neo4j recommendation engine that calculates fit score between candidate and job — without it, the product does not exist
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 8 (Foundation)
Plan: 3 of 3 in current phase (PHASE COMPLETE)
Status: Phase 1 complete — ready for Phase 2
Last activity: 2026-04-18 — Plan 01-03 executed (AppError, errorHandler, Neo4j driver, auth hooks, health route)

Progress: [██░░░░░░░░] 12%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~15min
- Total execution time: ~0.75 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3 | ~45min | ~15min |

**Recent Trend:**
- Last 5 plans: 01-01, 01-02, 01-03
- Trend: steady

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization: Neo4j for fit scoring (graph traversal required), PostgreSQL via Prisma for relational data, Fastify over Express, WebSocket for chat, credits only for companies
- 01-01: Prisma v7 datasource URL moved to prisma.config.ts (breaking change — url in schema datasource block is no longer supported)
- 01-01: prisma-client-js generator kept in schema (still works in v7, generates to node_modules/@prisma/client)
- 01-03: FastifyJWT module augmentation used for request.user typing instead of FastifyRequest directly — avoids conflict with @fastify/jwt's existing user property declaration

### Pending Todos

None yet.

### Blockers/Concerns

- Docker Desktop Linux engine not running — migration deferred. User must start Docker Desktop then run: `docker compose up -d && npx prisma migrate dev --name init && npx prisma generate`. Integration test (health.test.ts) will turn GREEN once Docker is running.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| infra | Docker Desktop not running — integration tests blocked | pending user action | 01-01 |

## Session Continuity

Last session: 2026-04-18
Stopped at: Plan 01-03 complete. Phase 1 Foundation DONE. Next: Phase 2 (Auth module).
Resume file: .planning/phases/01-foundation/01-03-SUMMARY.md
