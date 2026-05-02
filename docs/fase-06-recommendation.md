# Fase 06 — Recommendation (Neo4j fit-score)

## O que foi construído

Motor de recomendação Neo4j em três planos: infraestrutura e interface ARCH-04 com seed de taxonomia; algoritmo `computeFitScore` de 5 fatores (TDD, 14/14 testes verdes); e injeção do serviço no `SwipeService` substituindo o placeholder `fitScore: 0` por scores reais, com ranking ordenado por score descendente e feed com `fitScore` por vaga.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/shared/db/neo4j.ts` | Driver Neo4j com `disableLosslessIntegers: true` — retorna números JS em vez de `neo4j.Integer` |
| `src/shared/interfaces/recommendation.interface.ts` | `IRecommendationService`, `CandidateData`, `JobData` — boundary ARCH-04 entre o módulo swipe e o módulo recommendation |
| `src/modules/recommendation/recommendation.repository.ts` | `RecommendationRepository` implementando `IRecommendationService`: `seedTaxonomy()` (MERGE idempotente) + `computeFitScore()` (5 fatores, TypeScript puro) |
| `scripts/seed-neo4j.ts` | CLI: conecta ao Neo4j, chama `seedTaxonomy()`, fecha o driver. Rode com `npx ts-node --skip-project --compiler-options '{"lib":["ES2022","dom"],"module":"commonjs","esModuleInterop":true}' scripts/seed-neo4j.ts` |
| `src/modules/swipe/swipe.service.ts` | `IRecommendationService` injetado como 2º arg do constructor; `getRanking` usa `Promise.all` + `computeFitScore` e ordena por `fitScore DESC`; `getFeed` retorna `fitScore` por vaga |
| `src/modules/swipe/swipe.routes.ts` | Ambas as funções de rota injetam `new RecommendationRepository(getNeo4jDriver())` no `SwipeService` |
| `tests/helpers/neo4j-setup.ts` | `setupNeo4j()` — limpa o grafo (`DETACH DELETE n`) e re-seed; chamado no `beforeAll` dos testes de integração |
| `tests/unit/recommendation.service.test.ts` | 14 testes unitários do algoritmo (sem DB, sem Neo4j) |
| `tests/unit/swipe.service.test.ts` | +4 testes (3 getRanking + 1 getFeed) para o mock de `IRecommendationService`; 20 testes total |
| `tests/integration/recommendation.test.ts` | 9 testes de integração: seed de taxonomia, contagem de nós, idempotência, ranking HTTP |
| `tests/integration/swipe.test.ts` | +2 assertions de `fitScore` em feed e ranking |

---

## Por que foi feito assim

### Interface ARCH-04 como boundary entre módulos

`swipe.service.ts` importa `IRecommendationService` via `import type` — importação apenas de tipo, sem acoplamento em runtime. O `RecommendationRepository` concreto é injetado em `swipe.routes.ts`, fora do serviço. Assim o módulo swipe não depende do módulo recommendation; depende de uma interface em `src/shared/interfaces/`. Se o algoritmo de scoring mudar (ex: adicionar traversal no grafo), só `recommendation.repository.ts` muda — o `SwipeService` não sabe.

### `computeFitScore` sem chamadas ao Neo4j (v1)

O algoritmo de scoring é TypeScript puro — não faz queries ao banco de grafos. As habilidades da vaga e do candidato já chegam via PostgreSQL (Prisma), então o Neo4j não é necessário para o matching exato por string. O grafo `RELATED_TO` (skills relacionadas) está seed e pronto para uma versão futura que dê crédito parcial por skills relacionadas (ex: JavaScript → TypeScript). Na v1, o scoring é apenas matching case-insensitive direto.

### `disableLosslessIntegers: true` no driver

Por padrão, o driver Neo4j retorna inteiros do Cypher como `neo4j.Integer` — um objeto especial, não um número JS. Com `disableLosslessIntegers: true`, todos os inteiros viram números JS nativos. Sem isso, qualquer `count(n)` retornado pelo Cypher seria um objeto e a comparação `count === 6` falharia silenciosamente nos testes.

### `seedTaxonomy()` com MERGE, não CREATE

Todos os statements de seed usam `MERGE` em vez de `CREATE`. Rodando o seed duas vezes não duplica nós — a Cypher MERGE age como "create if not exists". Isso é essencial para scripts de inicialização e testes que chamam `setupNeo4j()` repetidamente.

### Injeção de `RecommendationRepository` na rota, não no serviço

`new RecommendationRepository(getNeo4jDriver())` é instanciado dentro de `swipeRoutes` e `swipeJobRoutes`, não dentro do `SwipeService`. O singleton de driver Neo4j (`getNeo4jDriver()`) garante que não sejam abertas conexões duplicadas — o guard `if (!driver)` em `neo4j.ts` retorna sempre o mesmo driver.

### `Promise.all` para scoring paralelo

`getRanking` e `getFeed` usam `Promise.all` para calcular `fitScore` de múltiplos candidatos/vagas em paralelo. Na v1 o custo é negligível (TypeScript puro), mas a estrutura já está pronta para quando `computeFitScore` fizer queries ao grafo — os pedidos ao Neo4j serão disparados em paralelo, não em sequência.

---

## Algoritmo de fit-score

`computeFitScore(candidate, job)` retorna um inteiro de 0 a 100:

```
fitScore = Math.round(
  professionScore * 0.30 +
  skillsScore     * 0.35 +
  locationScore   * 0.20 +
  modalityScore   * 0.10 +
  salaryScore     * 0.05
) * 100
```

| Fator | Peso | Regra |
|-------|------|-------|
| Profissão | 30% | `1.0` se `candidate.professionId === job.professionId` (ambos não-nulos), senão `0.0` |
| Skills | 35% | `matchedSkills / job.requiredSkills.length`; se `requiredSkills` vazio → `1.0` (case-insensitive) |
| Localização | 20% | `Math.max(0, 1 - haversineKm / searchRadiusKm)`; se job sem coords → `1.0`; se candidate sem coords → `0.5` (neutro) |
| Modalidade | 10% | `1.0` se `candidate.preferredModalities.includes(job.modality)`, senão `0.0` |
| Salário | 5% | `1.0` se expectativa dentro da faixa ou se qualquer lado é nulo; `0.0` fora da faixa |

---

## Grafo Neo4j

### Nós seedados

| Label | IDs |
|-------|-----|
| `Profession` (6) | `backend-dev`, `frontend-dev`, `fullstack-dev`, `devops`, `data-scientist`, `mobile-dev` |
| `Skill` (10) | `nodejs`, `typescript`, `javascript`, `react`, `postgresql`, `docker`, `python`, `go`, `kotlin`, `swift` |

### Relacionamentos

| Tipo | Qtd | Descrição |
|------|-----|-----------|
| `REQUIRES` | 8 | Profession → Skill (ex: backend-dev → Node.js, TypeScript) |
| `RELATED_TO` | 6 | Skill ↔ Skill bidirecional, weight 0.8 (TypeScript↔JavaScript, Node.js↔JavaScript, React↔JavaScript) |

### Verificar no Neo4j Browser (`http://localhost:7474`)

```cypher
MATCH (p:Profession)-[:REQUIRES]->(s:Skill) RETURN p.name, s.name ORDER BY p.name
```

```cypher
MATCH (a:Skill)-[r:RELATED_TO]->(b:Skill) RETURN a.name, b.name, r.weight
```

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Seed do grafo Neo4j

```cmd
npx ts-node --skip-project --compiler-options "{\"lib\":[\"ES2022\",\"dom\"],\"module\":\"commonjs\",\"esModuleInterop\":true}" scripts/seed-neo4j.ts
```

Esperado:
```
Seeding Neo4j taxonomy...
Neo4j taxonomy seed complete.
Professions: backend-dev, frontend-dev, fullstack-dev, devops, data-scientist, mobile-dev
Skills: Node.js, TypeScript, JavaScript, React, PostgreSQL, Docker, Python, Go, Kotlin, Swift
```

### 2. Ver ranking com fitScore real

Com um candidato `backend-dev` + skills `Node.js, TypeScript` que deu LIKE em uma vaga `backend-dev`:

```cmd
curl -s http://127.0.0.1:3000/jobs/<JOB_ID>/ranking -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

Esperado: `fitScore` próximo de 100 para candidato com perfil idêntico à vaga.

### 3. Ver fitScore no feed

```cmd
curl -s "http://127.0.0.1:3000/jobs/feed?limit=5" -H "Authorization: Bearer <CANDIDATE_TOKEN>"
```

Esperado: cada item de `data` tem o campo `fitScore` numérico.

---

## Rodar os testes automatizados

```bash
# Unitários do algoritmo (sem Docker, sem Neo4j)
npx jest tests/unit/recommendation.service.test.ts --no-coverage

# Unitários do swipe com mock de recRepo
npx jest tests/unit/swipe.service.test.ts --no-coverage

# Integração Neo4j (requer Docker com Neo4j + seed rodado)
npx jest tests/integration/recommendation.test.ts --runInBand --no-coverage

# Todos de uma vez
npx jest --no-coverage
```

**Resultado esperado:** 14 + 20 unit tests (34 total) + 9 integration tests Neo4j passando.
