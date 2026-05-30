# Phase 18: Learning System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 18-learning-system
**Areas discussed:** Abordagem de aprendizado, Quais fatores personalizam, Escopo do aprendizado

---

## Abordagem de aprendizado

| Option | Description | Selected |
|--------|-------------|----------|
| EMA dos factor scores | Por LIKE: compute scores de cada fator, aplica EMA com α | ✓ |
| Média direta acumulada | Armazena soma + count, weight = sum/count (sem decaimento) | |
| Claude decide | Claude escolhe o algoritmo | |

**User's choice:** EMA dos factor scores

---

| Option | Description | Selected |
|--------|-------------|----------|
| α = 0.1 | Aprendizado suave, 10% de influência por LIKE | ✓ |
| α = 0.2 | Aprendizado mais rápido, 20% de influência por LIKE | |

**User's choice:** α = 0.1

---

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas pesos atualizados | CandidateWeights armazena apenas os pesos correntes | ✓ |
| Pesos + factor scores de cada LIKE | Histórico completo, auditável, recalculável | |

**User's choice:** Apenas os pesos atualizados (sem histórico por LIKE)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pesos globais atuais do código | profession=0.30, skills=0.35, location=0.20, modality=0.10, salary=0.05 | ✓ |
| Pesos uniformes (0.20 cada) | Todos fatores iguais no cold-start | |

**User's choice:** Pesos globais atuais do código como defaults

---

## Quais fatores personalizam

| Option | Description | Selected |
|--------|-------------|----------|
| Todos os 5 fatores | profissão, skills, localização, modalidade, salário | ✓ |
| Apenas 3 de preferência | profissão, skills, modalidade (sem localização e salário) | |

**User's choice:** Todos os 5 fatores

---

| Option | Description | Selected |
|--------|-------------|----------|
| Substituem diretamente os pesos fixos | CandidateWeights armazena {professionW, skillsW, locationW, modalityW, salaryW} | ✓ |
| Multiplicam os pesos fixos como boosts | Multiplicadores (0.8–1.2) aplicados sobre pesos fixos | |

**User's choice:** Substituem diretamente os pesos fixos

---

| Option | Description | Selected |
|--------|-------------|----------|
| Não — DISC é tratado separadamente | Redistribuição D-05 aplicada sobre pesos personalizados | ✓ |
| Sim — DISC entra no learning | CandidateWeights inclui sexto peso disc | |

**User's choice:** DISC tratado separadamente (redistribuição aplica-se à parte)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dentro do RecordSwipeUseCase | Update via IWeightsRepository no bloco LIKE | ✓ |
| Porta separada ILearningPort | RecordSwipeUseCase delega ao port | |

**User's choice:** Dentro do RecordSwipeUseCase

---

## Escopo do aprendizado

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas o feed do candidato | GetFeedUseCase usa pesos pessoais; GetRankingUseCase usa globais | ✓ |
| Feed + ranking do recrutador | Ambos os use cases recebem pesos personalizados | |

**User's choice:** Apenas o feed do candidato (LEARN-03 literal)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Mesma lógica atual: del feed:{candidateId} | Sem mudança na estratégia de cache | ✓ |
| Cache key inclui hash dos pesos | feed:{candidateId}:{weights_hash} | |

**User's choice:** Mesma lógica atual (sem mudança)

---

## Claude's Discretion

- Estrutura exata de `WeightSet` type (inline vs type alias vs exportado)
- Renormalização dos pesos após EMA (por precision drift)
- Localização do arquivo `IWeightsRepository`
- Estratégia de teste unitário para EMA

## Deferred Ideas

- Pesos personalizados no GetRankingUseCase — fora de escopo desta fase
- Histórico de LIKEs por audit/replay — apenas pesos correntes nesta fase
- Decaimento temporal dos pesos — EMA simples sem fator temporal
- Endpoint de reset de pesos pelo candidato — fora de escopo
