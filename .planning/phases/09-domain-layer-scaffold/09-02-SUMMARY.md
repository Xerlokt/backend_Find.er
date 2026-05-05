---
plan: 09-02
phase: 09-domain-layer-scaffold
status: complete
completed: 2026-05-05
requirements_addressed:
  - ARCH-08
---

# Plan 09-02 Summary: Application Layer Ports and DomainError

## What Was Built

Created the application layer skeleton: 4 files across `src/application/errors/` and `src/application/ports/`.

## Key Files Created

- `src/application/errors/domain.error.ts` — DomainError class extending Error directly (not AppError); constructor order: (message, code, statusCode); sets `this.name = 'DomainError'` and restores prototype chain
- `src/application/ports/hash.port.ts` — IHashPort interface with `hash()` and `compare()` methods (bcrypt adapter contract)
- `src/application/ports/token.port.ts` — ITokenPort interface with `signAccess()`, `generateRefreshToken()`, `verifyAccess()` (JWT adapter contract)
- `src/application/ports/graph.port.ts` — IGraphPort interface with `syncCandidate()`, `syncJob()`, `calculateFitScore()`, `getRecommendedJobs()`, `seedTaxonomy()` (Neo4j adapter contract)

## Verification

- `npx tsc --noEmit` exits 0 — zero TypeScript errors
- Zero imports from @prisma/client, fastify, bcrypt, jsonwebtoken
- Zero imports from src/modules/ or src/shared/
- DomainError extends Error (not AppError) — constructor order differs intentionally from AppError(message, statusCode, code?)

## Decisions Captured

- DomainError constructor arg order: (message, code, statusCode) — differs from AppError(message, statusCode, code?) to avoid confusion at call sites
- ITokenPort includes verifyAccess() — needed by authenticate hook in Phase 10; included now so implementations are complete
- IGraphPort includes seedTaxonomy() — existing RecommendationRepository.seedTaxonomy() is a Neo4j operation; belongs in graph port contract

## Self-Check: PASSED

All acceptance criteria met. 4 files created with zero external imports. TypeScript compiles clean. ARCH-08 requirement satisfied.
