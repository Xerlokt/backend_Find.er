# Job Tinder — Backend Docs

Documentação técnica por fase. Cada doc explica o que foi construído, por que foi feito assim, e como testar.

## Fases

| Fase | Status | Doc |
|------|--------|-----|
| 01 — Fundação | ✅ Completa | [[fase-01-fundacao]] |
| 02 — Autenticação | ✅ Completa | [[fase-02-autenticacao]] |
| 03 — Perfis | 🔜 Pendente | — |
| 04 — Vagas | 🔜 Pendente | — |
| 05 — Swipe | 🔜 Pendente | — |
| 06 — Recomendação Neo4j | 🔜 Pendente | — |
| 07 — Chat | 🔜 Pendente | — |
| 08 — Créditos | 🔜 Pendente | — |

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
