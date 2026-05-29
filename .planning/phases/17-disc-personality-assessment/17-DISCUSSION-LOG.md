# Phase 17: DISC Personality Assessment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 17-disc-personality-assessment
**Areas discussed:** Question bank content, Score → dominant profile, Fit score integration math, Retake policy

---

## Question bank content

| Option | Description | Selected |
|--------|-------------|----------|
| 1 pergunta por dimensão (D/I/S/C) | Cada pergunta testa exclusivamente uma dimensão; dominante = dimensão respondida positivamente | |
| Todas as perguntas testam as 4 dimensões | Forced-choice: cada pergunta tem 4 opções (1 por dimensão); score = contagem de escolhas por dimensão | ✓ |
| Escrever os textos agora | Ditar as perguntas e opções nesta conversa | |

**User's choice:** Todas as perguntas testam as 4 dimensões (forced-choice)

| Sub-opção | Descrição | Selecionada |
|-----------|-----------|-------------|
| Claude sugere, eu aprovo aqui | Propor as 4 perguntas e 16 opções agora para aprovação | |
| Deixo pro Claude decidir | Claude cria o banco durante o planejamento | ✓ |
| Vou escrever agora | Ditar os textos na conversa | |

**User's choice:** Claude's Discretion para conteúdo; PT-BR travado como idioma

---

## Score → dominant profile

| Option | Description | Selected |
|--------|-------------|----------|
| Ordem de prioridade: D > I > S > C | Empate resolve pela dimensão com maior urgência; determinístico | ✓ |
| Co-dominantes (ex: "DI") | Retorna dimensões empatadas como perfil combinado | |
| Claude decide | Claude escolhe a abordagem mais simples | |

**User's choice:** Ordem de prioridade D > I > S > C para tie-breaking

---

## Fit score integration math

| Option | Description | Selected |
|--------|-------------|----------|
| Aditivo simples, capped at 100 | fitScore = round(5 fatores × 100) + discBonus; cap em 100 | |
| Redistribuição proporcional de pesos | Quando vaga tem discProfile: 10% para DISC + 90% redistribuídos nos outros 5 fatores | ✓ |
| Claude decide | Claude escolhe a abordagem mais defensável | |

**User's choice:** Redistribuição proporcional — pesos quando job.discProfile definido: profession=27%, skills=31.5%, location=18%, modality=9%, salary=4.5%, DISC=10%

---

## Retake policy

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — sobrescreve (PUT semantics) | POST sempre atualiza o resultado; retake permitido | ✓ |
| Não — locked após primeira submissão | Segundo POST retorna 409 ALREADY_SUBMITTED | |

**User's choice:** Retake permitido — PUT semantics (upsert)

| Sub-opção (card sem DISC) | Descrição | Selecionada |
|--------------------------|-----------|-------------|
| Campo omitido (discProfile ausente do JSON) | CensoredProfile não inclui discProfile quando null | ✓ |
| discProfile: null explicitamente | CensoredProfile sempre inclui discProfile (pode ser null) | |

**User's choice:** Campo omitido quando candidato não fez DISC

---

## Claude's Discretion

- Conteúdo exato das 4 perguntas e 16 opções (formato PT-BR forced-choice)
- Estrutura do modelo Prisma DiscResult
- Nomes das extensões de FitScoreInput/FitScoreJobInput
- Lógica de autorização da rota POST /candidates/:id/disc
- Se discProfile também aparece em FullProfile

## Deferred Ideas

- DISC com 28 perguntas completas
- Exibição de scores raw (D/I/S/C individuais) ao candidato
- Perfil co-dominante (ex: "DI")
- discProfile em FullProfile no ranking
