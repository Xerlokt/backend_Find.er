# Job Tinder

## What This Is

Backend completo de uma plataforma de match entre candidatos e vagas de emprego, no estilo swipe. Candidatos deslizam pelas vagas, recrutadores veem um ranking de fit dos candidatos com perfis censurados ou visíveis dependendo do swipe, e empresas podem desbloquear candidatos que deram "não" pagando créditos.

## Core Value

O sistema de recomendação via Neo4j que calcula o score de fit entre candidato e vaga — sem isso, o produto não existe.

## Requirements

### Validated

- [x] Empresa pode criar conta, cadastrar vagas com requisitos detalhados — Validated in Phase 4: Jobs (JOB-01, JOB-02, JOB-03, JOB-04)
- [x] Autenticação JWT + OAuth Google — Validated in Phase 2: Authentication (AUTH-01..AUTH-06)
- [x] Candidato pode criar conta, completar perfil (skills, pretensão salarial, localização, modo de trabalho) — Validated in Phase 3: Profiles & Companies (CAND-01, CAND-02)
- [x] Candidato pode dar swipe (sim/não) em vagas recomendadas — Validated in Phase 5: Swipe (SWIPE-01, SWIPE-02)
- [x] Candidatos que deram "sim" aparecem com perfil completo visível — Validated in Phase 5: Swipe (SWIPE-03)
- [x] Candidatos que deram "não" aparecem censurados no ranking (posição visível, identidade não) — Validated in Phase 5: Swipe (SWIPE-04)
- [x] Recrutador vê ranking de candidatos por % de fit na página da vaga — Validated in Phase 6: Recommendation (REC-01, REC-02, REC-03)
- [x] Score de fit calculado via Neo4j: habilidades, cargo, área, localização, modo de trabalho, pretensão salarial — Validated in Phase 6: Recommendation (REC-01)
- [x] Empresa pode desbloquear candidato censurado pagando créditos da plataforma — Validated in Phase 7: Credits (CREDIT-01, CREDIT-02)
- [x] Sistema de créditos da plataforma para desbloqueio de candidatos — Validated in Phase 7: Credits (CREDIT-03, CREDIT-04)
- [x] Chat em tempo real entre candidato e recrutador após match (candidato deu sim) — Validated in Phase 8: Chat (CHAT-01, CHAT-02, CHAT-03, CHAT-04)

### Active

(none — all v1.0 requirements validated)

### Out of Scope

- Candidatos comprando créditos — créditos são exclusivos das empresas
- App mobile — apenas API backend
- Sistema de pagamento integrado na v1 — créditos gerenciados via admin

## Context

- Stack definida: Node.js 20, TypeScript 5, Fastify 4, Prisma ORM, PostgreSQL 16, Neo4j 5, Jest 29, Supertest, Docker Compose
- Arquitetura: monolito modular com Fastify; módulos de recomendação (Neo4j) e chat (WebSocket) isolados para futura extração
- Plano de implementação detalhado em: `docs/superpowers/plans/2026-04-09-backend-api.md`
- Design spec em: `docs/superpowers/specs/2026-04-09-job-tinder-design.md`
- TDD obrigatório: testes unitários por service + testes de integração por módulo contra DB real

## Constraints

- **Tech Stack**: Node.js 20 + Fastify 4 + Prisma + Neo4j — já definido, não negociável
- **TDD**: Cada feature implementada com teste primeiro (Jest + Supertest)
- **DB de Teste**: Testes de integração usam DB real via Docker Compose (sem mocks de banco)
- **Arquitetura**: Monolito modular — módulos isolados mas sem microserviços na v1
- **Clean Architecture + SOLID**: Services desacoplados de infra, repositórios como abstração, inversão de dependência, responsabilidade única por classe/módulo
- **Segurança**: Proteção obrigatória contra OWASP Top 10 — SQL injection (via Prisma ORM), XSS (sanitização de input), race conditions (transações atômicas no DB), autenticação segura (bcrypt, JWT curto), rate limiting em rotas sensíveis

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Neo4j para recomendação | Score de fit requer travessia de grafo de profissões/habilidades | Validated Phase 6 — 5-factor fit score live |
| PostgreSQL via Prisma para dados relacionais | Dados estruturados (usuários, vagas, swipes, créditos) | Validated — atomic $transaction for credits/swipes |
| Fastify em vez de Express | Performance superior, TypeScript nativo, schema validation built-in | Validated — all 7 phases built on Fastify 4 |
| Chat via WebSocket (@fastify/websocket) | Real-time sem overhead de polling | Validated Phase 8 — WS gateway + REST history + auto-create on match/unlock live |
| Créditos apenas para empresas | Candidatos não devem ter barreira financeira para buscar emprego | Validated Phase 7 — unlock economy live |

## Evolution

Este documento evolui a cada transição de fase e marco de milestone.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope com motivo
2. Requirements validados? → Mover para Validated com referência da fase
3. Novos requirements emergiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se divergiu

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditoria de Out of Scope — motivos ainda válidos?
4. Atualizar Context com estado atual

---
*Last updated: 2026-05-03 after Phase 08 completion — v1.0 milestone complete*
