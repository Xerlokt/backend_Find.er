# Phase 5: Swipe - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25 (updated 2026-04-25)
**Phase:** 05-swipe
**Areas discussed:** Ranking endpoint location, DISLIKE censorship scope, Phase 5 ranking order, Job active validation, Ranking ownership, Location privacy (LIKE profile), Candidate job feed

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
**Notes:** Localização implementada como distância em km (Haversine) — schema só tem lat/lng brutos. Confirmado em sessão posterior que distanceKm se aplica a AMBOS LIKE e DISLIKE.

---

## Phase 5 Ranking Order

**User's direction (freeform):** Mostrar ranking ordenado por % de fit para todos os candidatos (LIKE e DISLIKE). DISLIKE aparece censurado mas com opção de pagar para desbloquear (Fase 7). Futuro: filtros para mostrar só LIKEs.

**Decision captured:** Ranking ordenado por fitScore descending (0 em todos na Fase 5, substituído pela Fase 6). Sort secundário: swipe date descending.

---

## Job Active Validation (D-14 — nova decisão)

| Option | Description | Selected |
|--------|-------------|----------|
| 404 on inactive job | Job not found / not visible — consistente com o feed | ✓ |
| 422 Unprocessable | Explicit "cannot swipe inactive job" | |

**User's choice:** 404 — vagas expiradas/inativas não aparecem no feed, então tratá-las como "not found" é consistente.
**Notes:** "o usuario não vai mais poder dar swipes não vai aparecer recomendação para os candidatos" — feed filtra vagas inativas; swipe em vaga inativa → 404.

---

## Ranking Ownership (D-03 update)

| Option | Description | Selected |
|--------|-------------|----------|
| Any authenticated recruiter | Qualquer RECRUITER autenticado | |
| Job owner only | Só o recruiter que criou a vaga | ✓ |
| Any recruiter in same company | Visibilidade por empresa | |

**User's choice:** Só o dono da conta / recruiter que postou a vaga pode ver o ranking. Outros → 403.
**Notes:** "só o dono da conta vulgo a empresa que fez a postagem" — interpretado como ownership check no recruiterId do job.

---

## Location Privacy in LIKE Profile (D-05 update)

| Option | Description | Selected |
|--------|-------------|----------|
| Exact lat/lng | Coordenadas exatas expostas para matched candidates | |
| City/region only | Label de localização aproximada | |
| Distance in km only | Estilo Tinder — igual ao DISLIKE | ✓ |

**User's choice:** distanceKm para TODOS os candidatos no ranking (LIKE e DISLIKE). Lat/lng nunca retornado.
**Notes:** "mostrar a distancia em km como o tinder" — confirmado para ambos LIKE e DISLIKE.

---

## Candidate Job Feed (D-15, D-16 — novo escopo)

| Option | Description | Selected |
|--------|-------------|----------|
| GET /jobs/feed | Endpoint dedicado no módulo swipe | ✓ |
| GET /jobs (com filtros) | Reutilizar endpoint do módulo job | |

**User's choice:** `GET /jobs/feed` — endpoint dedicado, candidato vê só vagas não swipadas. Cursor-based (Tinder-style).
**Notes:** "deixa na fase 5" — feed incluído no escopo da Fase 5. SwipeRepository consulta tabela Job via Prisma sem import cross-module.

---

## Claude's Discretion

- Rate limit no swipe: 30 req/min
- Implementação Haversine (inline ou helper compartilhado)
- Estrutura interna do SwipeRepository
- Page size padrão e nome do campo cursor no feed

## Deferred Ideas

- Filtros no ranking ("só LIKEs") — fase futura
- Chat auto-criado no LIKE — Fase 8 (CHAT-02)
- Unlock com créditos — Fase 7 (CREDIT-01)
- Fit score no feed — Fase 6 (Neo4j)
