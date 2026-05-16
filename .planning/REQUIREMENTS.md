# Requirements — v3.0 Intelligence, Growth & Scale

**Milestone:** v3.0
**Status:** Active
**Created:** 2026-05-16
**Phase numbering:** continues from v2.0 (phases 14+)

---

## Requirements

### GRAPH — Graph Recommendation (Neo4j Real)

- [ ] **GRAPH-01**: Candidato recebe vagas recomendadas com fit score calculado via traversal Neo4j `RELATED_TO*1..2` (skills adjacentes pontuam com decaimento: 1-hop = 0.8x, 2-hop = 0.6x)
- [ ] **GRAPH-02**: Seed script corrigido com ~50 relações tech `RELATED_TO` (SQL→PostgreSQL, React→JavaScript, Docker→DevOps etc)
- [ ] **GRAPH-03**: Neo4j indexes criados em nós `Skill` e `Profession` antes de qualquer traversal de produção

### REC — Recruiter Skill Preview

- [ ] **REC-01**: Recrutador vê, para candidatos DISLIKE/não-desbloqueados, lista das skills que batem com a vaga (não identidade)
- [ ] **REC-02**: Resposta do ranking inclui `fitReasons[]` (ex: "4/6 skills ✓", "salário fora da faixa ✗") para candidatos censurados
- [ ] **REC-03**: Preview nunca expõe nome, email, foto ou localização — apenas skills e razões de fit

### DISC — Personalidade DISC

- [ ] **DISC-01**: Candidato pode completar assessment DISC simplificado (4 perguntas, 1 por dimensão D/I/S/C)
- [ ] **DISC-02**: Resultado DISC (perfil dominante: D/I/S/C) salvo no perfil do candidato e visível no card censurado
- [ ] **DISC-03**: Vaga pode ter perfil DISC desejado (campo opcional; default = sem preferência)
- [ ] **DISC-04**: DISC entra no fit score como fator adicional de 10% apenas quando a vaga tem perfil definido

### LEARN — Learning System

- [ ] **LEARN-01**: Cada LIKE do candidato atualiza imediatamente seus pesos de fit score personalizados (`CandidateWeights`)
- [ ] **LEARN-02**: Sistema usa pesos padrão globais até o candidato atingir 5 LIKEs (cold start threshold)
- [ ] **LEARN-03**: Feed de recomendações aplica pesos personalizados do candidato no cálculo do fit score

### ADMIN — Admin Dashboard API

- [ ] **ADMIN-01**: `GET /admin/metrics/users` — total por role (CANDIDATE, RECRUITER), DAU últimos 7 dias
- [ ] **ADMIN-02**: `GET /admin/metrics/revenue` — créditos comprados, créditos usados em unlocks
- [ ] **ADMIN-03**: `GET /admin/metrics/engagement` — swipe funnel: swipes → likes → matches → unlocks → chats
- [ ] **ADMIN-04**: `GET /admin/metrics/health` — total de requests (via fastify-metrics), uptime do servidor

### SCALE — Escala Horizontal

- [ ] **SCALE-01**: Feed de candidatos cacheado no Redis (TTL 60s), invalidado após swipe do candidato
- [ ] **SCALE-02**: Ranking de candidatos por vaga cacheado no Redis (TTL 30s), invalidado após update de perfil
- [ ] **SCALE-03**: `check-deps.ts` atualizado para bloquear imports de `infrastructure/*` em `application/` (gap de segurança arquitetural)
- [ ] **SCALE-04**: 4 indexes PostgreSQL adicionados (Swipe por candidateId, Swipe por jobId, Job por isActive/expiresAt, CandidateProfile por professionId)
- [ ] **SCALE-05**: Scripts k6 em `tests/load/` cobrindo: feed, ranking, login

---

## Future Requirements (Deferred)

- DISC com 28 perguntas completas (forced-choice) — simplificado para MVP de 4 perguntas em v3.0
- Taxonomia ESCO/O*NET para skill graph — hand-crafted em v3.0
- Collaborative filtering (comportamento agregado de outros candidatos) — apenas pesos individuais em v3.0
- Admin UI (frontend) — apenas API REST em v3.0
- Redis Cluster — single node suficiente na escala atual

---

## Out of Scope

- DISC como filtro ou requisito obrigatório de vaga — risco legal; scoring apenas aditivo (nunca penalidade)
- ML models (ALS, matrix factorization) para learning — exponential moving average é suficiente
- Sessão JWT armazenada no Redis — JWT é stateless, cache é apenas para dados de leitura
- Dados comportamentais individuais no admin dashboard — métricas agregadas apenas (privacy)
- APM / distributed tracing — fora de escopo na escala atual

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRAPH-01 | — | Pending |
| GRAPH-02 | — | Pending |
| GRAPH-03 | — | Pending |
| REC-01 | — | Pending |
| REC-02 | — | Pending |
| REC-03 | — | Pending |
| DISC-01 | — | Pending |
| DISC-02 | — | Pending |
| DISC-03 | — | Pending |
| DISC-04 | — | Pending |
| LEARN-01 | — | Pending |
| LEARN-02 | — | Pending |
| LEARN-03 | — | Pending |
| ADMIN-01 | — | Pending |
| ADMIN-02 | — | Pending |
| ADMIN-03 | — | Pending |
| ADMIN-04 | — | Pending |
| SCALE-01 | — | Pending |
| SCALE-02 | — | Pending |
| SCALE-03 | — | Pending |
| SCALE-04 | — | Pending |
| SCALE-05 | — | Pending |

---

*Last updated: 2026-05-16 — v3.0 milestone requirements defined*
