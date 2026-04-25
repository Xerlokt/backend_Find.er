# Phase 5: Swipe - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 05-swipe
**Areas discussed:** Ranking endpoint location, DISLIKE censorship scope, Phase 5 ranking order

---

## Ranking Endpoint Location

| Option | Description | Selected |
|--------|-------------|----------|
| Separate ranking endpoint | `GET /jobs/:jobId/ranking` in swipe module. ARCH-04 compliant. | ✓ |
| Extend GET /jobs/:id directly | Modify job.routes.ts to call SwipeRepository inline. Simpler but couples modules. | |

**User's choice:** Separate endpoint — `GET /jobs/:jobId/ranking` in swipe module. Job detail unchanged.

**Notes:** User confirmed URL `/jobs/:jobId/ranking` (not `/swipes/ranking/:jobId`) for semantic clarity.

---

## DISLIKE Censorship Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Só % de fit + posição | Tudo oculto exceto fit score e posição no ranking | |
| Fit + dados profissionais | Nome/foto ocultos, skills/profissão visíveis | |
| Fit + posição + localização aproximada | Nome/foto ocultos, fit %, posição e localização aproximada visíveis | ✓ |

**User's choice:** Fit + posição + localização aproximada.

**Notes:** Localização implementada como distância em km (Haversine) — schema só tem lat/lng brutos, sem cidade/estado. Usuário confirmou distância em km como approach.

---

## Phase 5 Ranking Order

**User's direction (freeform):** Mostrar ranking ordenado por % de fit para todos os candidatos (LIKE e DISLIKE). DISLIKE aparece censurado mas com opção de pagar para desbloquear (Fase 7). Futuro: filtros para mostrar só LIKEs.

**Decision captured:** Ranking ordenado por fitScore descending (0 em todos na Fase 5, substituído pela Fase 6). Sort secundário: swipe date descending.

---

## Claude's Discretion

- Rate limit no swipe: 30 req/min (escolha do Claude — generoso para não bloquear swipers rápidos)
- Implementação Haversine: inline no service ou helper compartilhado
- Estrutura interna do SwipeRepository

## Deferred Ideas

- Filtros no ranking ("só LIKEs") — mencionado pelo usuário, anotado para fase futura
- Chat auto-criado no LIKE — Fase 8
- Unlock com créditos — Fase 7
- Feed de vagas recomendadas — Fase 6
