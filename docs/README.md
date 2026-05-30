# Job Tinder — Backend Docs

Documentação técnica por fase. Cada doc explica o que foi construído, por que foi feito assim, e como testar.

## Fases

| Fase | Milestone | Status | Doc |
|------|-----------|--------|-----|
| 01 — Fundação | v1.0 | ✅ Completa | [fase-01-fundacao](fase-01-fundacao.md) |
| 02 — Autenticação | v1.0 | ✅ Completa | [fase-02-autenticacao](fase-02-autenticacao.md) |
| 03 — Perfis & Empresas | v1.0 | ✅ Completa | [fase-03-perfis-empresas](fase-03-perfis-empresas.md) |
| 04 — Vagas | v1.0 | ✅ Completa | [fase-04-vagas](fase-04-vagas.md) |
| 05 — Swipe | v1.0 | ✅ Completa | [fase-05-swipe](fase-05-swipe.md) |
| 06 — Recomendação Neo4j | v1.0 | ✅ Completa | [fase-06-recommendation](fase-06-recommendation.md) |
| 07 — Créditos | v1.0 | ✅ Completa | [fase-07-creditos](fase-07-creditos.md) |
| 08 — Chat | v1.0 | ✅ Completa | [fase-08-chat](fase-08-chat.md) |
| 09 — Domain Layer Scaffold | v2.0 | ✅ Completa | [fase-09-clean-architecture-scaffold](fase-09-clean-architecture-scaffold.md) |
| 10 — Infrastructure + Auth | v2.0 | ✅ Completa | [fase-10-infrastructure-auth-migration](fase-10-infrastructure-auth-migration.md) |
| 11 — Core Modules Migration | v2.0 | ✅ Completa | [fase-11-core-modules-migration](fase-11-core-modules-migration.md) |
| 12 — Swipe, Credits, Chat Migration | v2.0 | ✅ Completa | [fase-12-swipe-credits-recommendation-chat-migration](fase-12-swipe-credits-recommendation-chat-migration.md) |
| 13 — Cleanup + Unit Tests | v2.0 | ✅ Completa | [fase-13-cleanup-unit-tests](fase-13-cleanup-unit-tests.md) |
| 14 — Graph Recommendation | v3.0 | ✅ Completa | [fase-14-graph-recommendation](fase-14-graph-recommendation.md) |
| 15 — Redis Caching | v3.0 | 🔄 Planejado | — |
| 16 — Recruiter Skill Preview | v3.0 | ✅ Completa | [fase-16-recruiter-skill-preview](fase-16-recruiter-skill-preview.md) |
| 17 — DISC Assessment | v3.0 | ✅ Completa | [fase-17-disc-personality-assessment](fase-17-disc-personality-assessment.md) |
| 18 — Learning System | v3.0 | ⏳ Não iniciado | — |
| 19 — Admin Dashboard + Load Test | v3.0 | ⏳ Não iniciado | — |

## Stack

- **Runtime:** Node.js 20 + TypeScript 5
- **Framework:** Fastify 5
- **ORM:** Prisma 7 → PostgreSQL 16
- **Grafo:** Neo4j 5 (fit-score por traversal)
- **Cache:** Redis 7
- **Testes:** Jest 30 + Supertest

## Subir o ambiente

```bash
cp .env.example .env        # configurar variáveis
docker compose up -d        # PostgreSQL + Neo4j + Redis
npm run db:migrate          # criar tabelas
npm run dev                 # servidor em http://localhost:3000
```

## Seed Neo4j

```bash
npx ts-node --skip-project --compiler-options '{"lib":["ES2022","dom"],"module":"commonjs","esModuleInterop":true}' scripts/seed-neo4j.ts
```
