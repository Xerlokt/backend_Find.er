# Job Tinder

## What This Is

Backend completo de uma plataforma de match entre candidatos e vagas de emprego, no estilo swipe. Candidatos deslizam pelas vagas, recrutadores veem um ranking de fit dos candidatos com perfis censurados ou visíveis dependendo do swipe, e empresas podem desbloquear candidatos que deram "não" pagando créditos.

## Current State: v2.0 Shipped — Planning Next Milestone

**Last shipped:** v2.0 Clean Architecture Refactor (2026-05-15)
**All 13 phases complete. 18 v2.0 plans + 27 v1.0 plans. 172 tests pass.**

**Architecture (as of v2.0):**
- `src/domain/` — 11 entity interfaces + 10 repository interfaces + 3 ports (IHashPort, ITokenPort, IGraphPort)
- `src/application/` — use cases by module + DomainError
- `src/adapters/` — controllers + Prisma repositories + BcryptAdapter, JwtAdapter, Neo4jAdapter
- `src/infrastructure/` — Fastify routes, plugins, DB singletons, app.ts, server.ts
- `scripts/check-deps.ts` — mechanical 4-layer dependency rule enforcement (madge)

---

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

- Stack: Node.js 20, TypeScript 5, Fastify 4, Prisma ORM, PostgreSQL 16, Neo4j 5, Jest 29, Supertest, Docker Compose
- Architecture: Clean Architecture 4-layer (domain → application → adapters → infrastructure); layer rule mechanically enforced via `scripts/check-deps.ts`
- ~3,249 LOC TypeScript across 106 files; 172 tests (41 integration against real Docker DB + 131 unit)
- TDD: unit tests via mocked interfaces (no DB); integration tests via real Docker DB (no mocks)
- Design spec: `docs/superpowers/specs/2026-04-09-job-tinder-design.md`

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
| Neo4j para recomendação | Score de fit requer travessia de grafo de profissões/habilidades | ✓ Validated Phase 6 — 5-factor fit score live |
| PostgreSQL via Prisma para dados relacionais | Dados estruturados (usuários, vagas, swipes, créditos) | ✓ Validated — atomic $transaction for credits/swipes |
| Fastify em vez de Express | Performance superior, TypeScript nativo, schema validation built-in | ✓ Validated — all phases built on Fastify 4 |
| Chat via WebSocket (@fastify/websocket) | Real-time sem overhead de polling | ✓ Validated Phase 8 — WS gateway + REST history + auto-create on match/unlock |
| Créditos apenas para empresas | Candidatos não devem ter barreira financeira para buscar emprego | ✓ Validated Phase 7 — unlock economy live |
| Migração módulo-a-módulo (v2.0) | Manter 41 testes de integração verdes em cada fase — rollback seguro | ✓ Validated — zero regressões durante 5 fases de migração |
| Padrão aditivo — não deletar módulos antigos até Phase 13 | Safe coexistence during migration; deletar tudo de uma vez é arriscado | ✓ Validated — tsc clean + testes verdes em todo momento |
| scripts/check-deps.ts (madge) para enforce layer rule | Dependências incorretas detectadas mecanicamente, não via code review | ✓ Validated Phase 13 — npm run check:deps passa no CI |

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
*Last updated: 2026-05-16 after v2.0 milestone close — Clean Architecture Refactor complete*
