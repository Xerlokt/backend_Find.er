# Job Tinder — Backend

## Project

Backend completo de uma plataforma de match entre candidatos e vagas, estilo swipe. Candidatos deslizam pelas vagas; recrutadores veem ranking de fit; empresas desbloqueiam candidatos com créditos.

**Core value:** Sistema de recomendação Neo4j (fit-score entre candidato e vaga).

## Stack

Node.js 20, TypeScript 5, Fastify 4, Prisma ORM, PostgreSQL 16, Neo4j 5, Jest 29, Supertest, Docker Compose.

## Architecture Rules (enforced)

- **Clean Architecture**: routes → service → repository. Sem pular camadas.
- **SOLID**: SRP por classe/função. Services não importam clientes de DB diretamente.
- **Módulos isolados**: módulos não importam diretamente de outros módulos.

## Security Rules (enforced)

- Todas as queries via Prisma ORM — sem interpolação de strings em SQL raw.
- Inputs validados com Zod em todos os endpoints.
- Transações atômicas para créditos e swipes (race conditions).
- Bcrypt salt ≥ 12 para senhas.
- Rate limiting em login, register, swipe.
- JWT access token ≤ 15min + refresh token com rotação.
- @fastify/helmet em todos os endpoints.

## TDD (obrigatório)

- Teste primeiro, depois implementação.
- Unitários: `tests/unit/` — por service, sem DB.
- Integração: `tests/integration/` — por módulo, contra DB real (Docker).
- Sem mocks de banco nos testes de integração.

## GSD Workflow

Planning docs: `.planning/`
- `PROJECT.md` — contexto do projeto
- `ROADMAP.md` — 8 fases
- `REQUIREMENTS.md` — requirements com REQ-IDs
- `STATE.md` — estado atual

**Fase atual:** Phase 1 — Foundation

Executar: `/gsd-plan-phase 1`
