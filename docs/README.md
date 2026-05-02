# Job Tinder — Backend Docs

Documentação técnica por fase. Cada doc explica o que foi construído, por que foi feito assim, e como testar.

## Fases

| Fase | Status | Doc |
|------|--------|-----|
| 01 — Fundação | ✅ Completa | [fase-01-fundacao](fase-01-fundacao.md) |
| 02 — Autenticação | ✅ Completa | [fase-02-autenticacao](fase-02-autenticacao.md) |
| 03 — Perfis & Empresas | ✅ Completa | [fase-03-perfis-empresas](fase-03-perfis-empresas.md) |
| 04 — Vagas | ✅ Completa | [fase-04-vagas](fase-04-vagas.md) |
| 05 — Swipe | ✅ Completa | [fase-05-swipe](fase-05-swipe.md) |
| 06 — Recomendação Neo4j | ✅ Completa | [fase-06-recommendation](fase-06-recommendation.md) |
| 07 — Créditos | 🔜 Pendente | — |
| 08 — Chat | 🔜 Pendente | — |

## Stack

- **Runtime:** Node.js 20 + TypeScript 5
- **Framework:** Fastify 4
- **ORM:** Prisma 7 → PostgreSQL 16
- **Grafo:** Neo4j 5 (fit-score de recomendação)
- **Testes:** Jest 29 + Supertest

## Subir o ambiente

```bash
cp .env.example .env        # configurar variáveis
docker compose up -d        # PostgreSQL + Neo4j
npx prisma migrate dev      # criar tabelas
npm run dev                 # servidor em http://localhost:3000
```

## Seed Neo4j

```bash
npx ts-node --skip-project --compiler-options '{"lib":["ES2022","dom"],"module":"commonjs","esModuleInterop":true}' scripts/seed-neo4j.ts
```
