# Phase 14: Graph Recommendation - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Substituir o cálculo de skills do fit score de exact-match puro para traversal real via Neo4j (`RELATED_TO*1..2`), com peso decrescente por distância no grafo. Skills adjacentes ao candidato contribuem positivamente para vagas que as exigem, sem que o candidato as possua diretamente. Inclui expansão do seed script (~50 arestas) e criação de índices/unique constraints no Neo4j.

**Em escopo:**
- Novo Cypher query para skill adjacency (retorna `[{skill, hops}]`)
- Mudança no `computeFitScore`: peso por hops (0 = 1.0x, 1 = 0.8x, 2 = 0.6x)
- Atualização de `FitScoreInput` e `FitScoreJobInput` (trocar nomes por IDs)
- Atualização de todos os callers (repositórios + testes)
- Expansão do `seedTaxonomy()` para ~50 RELATED_TO edges (4 domínios)
- Unique constraints + índices Neo4j em `Skill.id` e `Profession.id`

**Fora de escopo:**
- Mudança nos outros fatores do fit score (profissão, localização, modalidade, salário)
- Redis caching (Phase 15)
- Skill preview para recrutadores (Phase 16)
- Integração com taxonomia ESCO/O*NET

</domain>

<decisions>
## Implementation Decisions

### D-01: Traversal approach — Cypher retorna adjacência, TypeScript computa

Cypher faz o que só o grafo pode fazer: dado `skillIds` do candidato e `requiredSkillIds` da vaga, retorna uma lista de matches com hops (`[{skill: string, hops: number}]`). TypeScript aplica os pesos e calcula a fração do skill score:

- 0 hops (match direto): peso 1.0x
- 1 hop: peso 0.8x
- 2 hops: peso 0.6x

A query Cypher deve ser depth-bounded em `*1..2` — sem unbounded traversal.

**Rationale:** Math em TypeScript = testável com mocks; Cypher só faz o que grafo faz = separação clara de responsabilidade. Mantém aderência ao Clean Architecture.

### D-02: Skill matching — IDs, não nomes

Substituir `skills: string[]` (nomes) por `skillIds: string[]` (IDs) em `FitScoreInput`.  
Substituir `requiredSkills: string[]` por `requiredSkillIds: string[]` em `FitScoreJobInput`.

Cypher faz match por ID: `WHERE s.id IN $skillIds`.

**Breaking change controlada:** todos os callers (repositórios que montam FitScoreInput, factories de teste) devem ser atualizados nesta fase.

**Rationale:** IDs são estáveis e indexáveis; nomes são frágeis a capitalização/whitespace. NodeIndexSeek funciona corretamente com match por ID.

### D-03: Domínios da taxonomia (~50 RELATED_TO edges)

Cobrir todos os 4 domínios, bidirecionais (MERGE a→b + MERGE b→a, consistente com seed atual):

- **Backend:** SQL→PostgreSQL→MySQL, Node.js→JavaScript→TypeScript, Python→Django→FastAPI, Java→Spring, Go, Rust
- **Frontend:** React→JavaScript→TypeScript, Vue→JavaScript, Angular→TypeScript, CSS→Sass→Tailwind, Next.js→React
- **DevOps/Infra:** Docker→Kubernetes→DevOps, AWS→Cloud, Terraform→IaC, CI/CD→GitHub Actions
- **Mobile:** Swift→iOS, Kotlin→Android, React Native→React→JavaScript, Flutter→Dart

Nós Skill e Profession precisam ser expandidos no seed script para cobrir esses domínios.

### D-04: Interface limpa — substituir, não acumular

`skills: string[]` é removido de `FitScoreInput` (não mantido como fallback).  
`requiredSkills: string[]` é removido de `FitScoreJobInput`.  
Todos os testes e repositórios que montam essas structs devem ser atualizados.

O objetivo é interface limpa; a breaking change é contida nesta fase.

### Claude's Discretion

- Estrutura exata do Cypher (parâmetros, UNWIND vs WITH, agregação antes/depois de retorno)
- Como os nós Skill são referenciados na query: por `s.id IN $candidateSkillIds` + `j.id IN $jobSkillIds`
- Quantidade exata de skills/nós no seed (o alvo é ~50 edges, não 50 nós)
- Ordem de criação das unique constraints vs execução do seed

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` — GRAPH-01, GRAPH-02, GRAPH-03 (requisitos desta fase)
- `.planning/ROADMAP.md` §"Phase 14: Graph Recommendation" — goal, success criteria (5 itens)

### Interfaces a modificar
- `src/domain/interfaces/recommendation.repository.interface.ts` — `FitScoreInput`, `FitScoreJobInput`, `IRecommendationRepository` (breaking change aqui)

### Adapters a modificar
- `src/adapters/services/recommendation.repository.ts` — `computeFitScore()` + `seedTaxonomy()` (principal arquivo da fase)
- `src/adapters/services/neo4j.adapter.ts` — thin wrapper; provavelmente não muda

### Dependency enforcement
- `scripts/check-deps.ts` — layer rule enforcement; Cypher queries devem ficar em `adapters/`, nunca em `application/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RecommendationRepository.seedTaxonomy()` em `src/adapters/services/recommendation.repository.ts` — já existe, precisa expansão de ~3 para ~50 RELATED_TO edges; padrão MERGE idempotente mantido
- `Neo4jAdapter` em `src/adapters/services/neo4j.adapter.ts` — thin wrapper que delega para `RecommendationRepository`; interface pública não muda (apenas `computeFitScore` + `seedTaxonomy`)
- `haversineKm` utility — não muda; localização continua sendo calculada em TypeScript

### Established Patterns
- **Cypher em adapters:** Queries Neo4j ficam exclusivamente em `src/adapters/services/`; `application/` não importa infra (enforced por `check-deps.ts`)
- **MERGE idempotente:** Seed usa MERGE (não CREATE) para ser re-executável sem duplicar dados
- **disableLosslessIntegers: true** no driver Neo4j — retorno de números como JS number, não neo4j.Integer (decisão Phase 06-01)
- **DomainError:** Erros de domínio usam `DomainError(message, code, statusCode)` — ordem diferente de `AppError`

### Integration Points
- Todos os use cases que chamam `computeFitScore` montam `FitScoreInput` e `FitScoreJobInput` — precisam ser atualizados para passar `skillIds` em vez de `skills`
- Testes de integração de recomendação (`tests/integration/`) e unit tests que mockam `IRecommendationRepository` precisam usar os novos campos

</code_context>

<specifics>
## Specific Ideas

- O Cypher deve usar `MATCH (s:Skill)-[:RELATED_TO*1..2]->(adj:Skill)` para adjacência, garantindo depth limit `*1..2` explícito (success criteria 4)
- Unique constraints devem ser criadas via Cypher `CREATE CONSTRAINT IF NOT EXISTS ON (s:Skill) ASSERT s.id IS UNIQUE` (equivalente para Profession) — parte do seed ou de um passo de inicialização separado
- Skills no seed podem usar o mesmo padrão de IDs já existente: `{id: 'postgresql', name: 'PostgreSQL'}` — sem change de padrão

</specifics>

<deferred>
## Deferred Ideas

- Integração com taxonomia ESCO/O*NET (já registrado em REQUIREMENTS.md como deferred)
- Pesos diferentes por tipo de adjacência (ex: "superset" vs "complementar") — manter 0.8/0.6 simples por ora
- Skill aliasing (ex: "Postgres" = "PostgreSQL") — normalização de nomes fora de escopo; IDs resolvem parcialmente

</deferred>

---

*Phase: 14-graph-recommendation*
*Context gathered: 2026-05-16*
