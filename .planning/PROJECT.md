# Job Tinder

## What This Is

Backend completo de uma plataforma de match entre candidatos e vagas de emprego, no estilo swipe. Candidatos deslizam pelas vagas, recrutadores veem um ranking de fit dos candidatos com perfis censurados ou visíveis dependendo do swipe, e empresas podem desbloquear candidatos que deram "não" pagando créditos.

## Core Value

O sistema de recomendação via Neo4j que calcula o score de fit entre candidato e vaga — sem isso, o produto não existe.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Candidato pode criar conta, completar perfil (skills, pretensão salarial, localização, modo de trabalho)
- [ ] Empresa pode criar conta, cadastrar vagas com requisitos detalhados
- [ ] Candidato pode dar swipe (sim/não) em vagas recomendadas
- [ ] Recrutador vê ranking de candidatos por % de fit na página da vaga
- [ ] Candidatos que deram "sim" aparecem com perfil completo visível
- [ ] Candidatos que deram "não" aparecem censurados no ranking (posição visível, identidade não)
- [ ] Empresa pode desbloquear candidato censurado pagando créditos da plataforma
- [ ] Score de fit calculado via Neo4j: habilidades, cargo, área, localização, modo de trabalho, pretensão salarial
- [ ] Chat em tempo real entre candidato e recrutador após match (candidato deu sim)
- [ ] Sistema de créditos da plataforma para desbloqueio de candidatos
- [ ] Autenticação JWT + OAuth Google

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

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Neo4j para recomendação | Score de fit requer travessia de grafo de profissões/habilidades | — Pending |
| PostgreSQL via Prisma para dados relacionais | Dados estruturados (usuários, vagas, swipes, créditos) | — Pending |
| Fastify em vez de Express | Performance superior, TypeScript nativo, schema validation built-in | — Pending |
| Chat via WebSocket (@fastify/websocket) | Real-time sem overhead de polling | — Pending |
| Créditos apenas para empresas | Candidatos não devem ter barreira financeira para buscar emprego | — Pending |

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
*Last updated: 2026-04-17 after initialization*
