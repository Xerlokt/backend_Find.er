---
plan: 01-02
phase: 01-foundation
status: complete
completed: 2026-04-18
---

## Summary

Built the Fastify application factory (`buildApp`), all shared security plugins (Helmet, CORS, JWT), the Prisma singleton with globalThis guard, and the full Jest/Supertest test infrastructure including database setup hooks and test data factories. The health smoke test exists and is intentionally RED (404) until plan 01-03 registers the route.

## Key Files Created

- `src/shared/db/prisma.ts` — PrismaClient singleton with globalThis guard (prevents hot-reload re-instantiation)
- `src/shared/plugins/helmet.ts` — @fastify/helmet registration via fastify-plugin (SEC-07)
- `src/shared/plugins/cors.ts` — CORS plugin with ALLOWED_ORIGINS env support
- `src/shared/plugins/jwt.ts` — JWT plugin with JWT_SECRET from env
- `src/app.ts` — buildApp() factory that registers helmet → cors → jwt in order
- `src/server.ts` — Entry point with dotenv/config and graceful startup
- `tests/helpers/setup.ts` — beforeAll (migrate test DB), afterAll (disconnect), afterEach (FK-safe cleanup)
- `tests/helpers/factories.ts` — createUser, createCandidate, createCompany, createJob (bcrypt salt 12)
- `tests/integration/health.test.ts` — Smoke test: GET /health expects 200 (RED until 01-03)

## Tasks Completed

1. ✓ Task 1: Prisma singleton and shared Fastify plugins (JWT, CORS, Helmet)
2. ✓ Task 2: buildApp factory, server.ts, health.test.ts (TDD RED confirmed)
3. ✓ Task 3: test setup hooks and factories

## Deviations

- `fastify-plugin` installed as runtime dependency (not devDependency) since plugins import it at runtime.
- Integration test (health.test.ts) is RED due to Docker not running — expected until Docker Desktop is started and 01-03 registers the health route.

## Self-Check: PASSED

- [x] buildApp() registers helmet, cors, jwt plugins in correct order (SEC-07 first)
- [x] prisma.ts has globalThis guard
- [x] helmet.ts uses fastify-plugin wrapper
- [x] setup.ts uses DATABASE_URL_TEST, cleans tables in FK-safe order (message → user)
- [x] factories.ts exports createUser, createCandidate, createCompany, createJob with bcrypt salt 12
- [x] npx tsc --noEmit exits 0
