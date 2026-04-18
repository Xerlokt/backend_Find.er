---
phase: 01-foundation
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/01-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-04-17
**Source review:** .planning/phases/01-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (4 Critical, 4 Warning)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: JWT tokens never expire — access tokens are immortal

**Files modified:** `src/shared/plugins/jwt.ts`
**Commit:** f392261
**Applied fix:** Added `sign: { expiresIn: '15m' }` to the `@fastify/jwt` registration options. Also removed the `?? 'dev-secret-change-me'` fallback secret, replacing it with `process.env.JWT_SECRET!` (startup validation in CR-02 guarantees it is set before this code runs).

---

### CR-02: JWT plugin silently falls back to a known weak secret

**Files modified:** `src/server.ts`
**Commit:** a8ae056
**Applied fix:** Added a startup env validation loop before `buildApp()` that checks for all six required variables (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`). If any are missing, the process logs an error and exits with code 1 before any Fastify infrastructure is created.

---

### CR-03: CORS falls back to wildcard `'*'` when ALLOWED_ORIGINS is not set

**Files modified:** `src/shared/plugins/cors.ts`, `.env.example`
**Commit:** b6e2593
**Applied fix:** Replaced the `?? '*'` fallback with a conditional: in development (non-production `NODE_ENV`) the origin defaults to `['http://localhost:3000']`; in production, if `ALLOWED_ORIGINS` is not set, a startup error is thrown immediately. Also added `credentials: true` to the CORS config and added `ALLOWED_ORIGINS=http://localhost:3000` to `.env.example` so developers know the variable exists.

---

### CR-04: Neo4j driver silently accepts undefined env vars — broken driver, no crash

**Files modified:** `src/shared/db/neo4j.ts`
**Commit:** e922a3c
**Applied fix:** Added runtime guards that read `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` into local variables first, then throw a clear `Error` if any are falsy before the driver is ever created. This replaces the TypeScript-only non-null assertions (`!`) that are erased at runtime.

---

### WR-01: Helmet disables Content-Security-Policy globally with no environment guard

**Files modified:** `src/shared/plugins/helmet.ts`
**Commit:** 57286ae
**Applied fix:** Added a `NODE_ENV === 'production'` ternary: `undefined` (helmet defaults, including CSP) in production; `false` (CSP disabled for dev tooling) in all other environments. The previous unconditional `false` disabled CSP even in production.

---

### WR-02: Test setup overrides DATABASE_URL after Prisma client is already instantiated

**Files modified:** `tests/jest.global-setup.ts` (new file), `jest.config.ts`
**Commit:** 7f324fb
**Applied fix:** Created `tests/jest.global-setup.ts` that sets `process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!` in Jest's `globalSetup` phase — which runs before any test module is imported, ensuring the Prisma singleton is instantiated against the test database. Added `globalSetup: '<rootDir>/tests/jest.global-setup.ts'` to `jest.config.ts`.

---

### WR-03: `requireRole` has no type-level enforcement that `authenticate` ran first

**Files modified:** `src/shared/hooks/requireRole.ts`
**Commit:** c776673
**Applied fix:** Changed the `!request.user` guard to throw `AppError('authenticate hook missing before requireRole', 500, 'INTERNAL')` instead of a 401. Added a JSDoc comment above the function explaining that `authenticate` must precede `requireRole` in `preHandler`. This makes misconfigured routes fail with a 500 server error rather than silently masking the programming error as an auth failure.

---

### WR-04: `prisma/schema.prisma` datasource has no `url` field

**Files modified:** `prisma/schema.prisma`, `prisma.config.ts`
**Commit:** 4cd093b
**Applied fix:** Attempted to add `url = env("DATABASE_URL")` to the datasource block, but `npx prisma validate` returned error P1012 — Prisma v7 explicitly removed the `url` property from `schema.prisma` (connection URL must be in `prisma.config.ts`). The change was reverted. Instead, added a clarifying comment to `prisma/schema.prisma` explaining the Prisma v7 pattern, and added a comment to `prisma.config.ts` documenting that `DATABASE_URL` must be set and how it is swapped for tests via the global setup file.

---

## Skipped Issues

None — all 8 in-scope findings were successfully addressed.

---

_Fixed: 2026-04-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
