# Fase 14 — Graph Recommendation (v3.0)

## O que foi construído

Motor de fit score atualizado para usar traversal real no grafo Neo4j: skills adjacentes (`RELATED_TO*1..2`) contribuem ao score com decay de 0.8×, substituindo o matching exato da v1.0. Seed expandido com 50+ arestas. Constraints únicos em `Skill` e `Profession`.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/adapters/services/neo4j.adapter.ts` | `Neo4jAdapter.computeFitScore()` — Cypher com `RELATED_TO*1..2` e `reduce()` para decay |
| `src/application/ports/graph.port.ts` | `IGraphPort.computeFitScore()` — contrato do adapter |
| `scripts/seed-neo4j.ts` | Seed expandido: ~50 `RELATED_TO` edges cobrindo adjacências comuns |
| `tests/unit/recommendation.service.test.ts` | Testes unitários do algoritmo com mock do driver |
| `tests/integration/recommendation.test.ts` | Testes de integração: traversal real, contagem de nós, idempotência |

---

## Por que foi feito assim

### Adjacência com decay, não exclusão

Na v1.0, um candidato sem a skill exata "PostgreSQL" recebia 0 nessa dimensão, mesmo dominando "SQL". Com o grafo:

- Skills diretas valem `1.0`
- Skills a 1 hop (`RELATED_TO`) valem `0.8`
- Skills a 2 hops valem `0.64`

A query Cypher usa `RELATED_TO*1..2` com profundidade limitada — sem traversal não-limitado que poderia conectar qualquer skill a qualquer outra por caminhos longos.

### Unique constraints em Neo4j

Antes dos constraints, cada chamada `computeFitScore` usava `NodeByLabelScan` (full scan). Com os constraints em `Skill.id` e `Profession.id`, o plano passa a usar `NodeIndexSeek`. Isso é verificado por `EXPLAIN` nas queries de integração.

### Seed com `MERGE`, não `CREATE`

Todo o seed usa `MERGE` (idempotente). Rodar o script duas vezes não duplica nós. Isso é essencial para o `setupNeo4j()` nos testes, que chama o seed no `beforeAll`.

### Exemplos de adjacências seedadas

| Skill | Adjacente | Hop | Decay |
|-------|-----------|-----|-------|
| SQL | PostgreSQL | 1 | 0.8× |
| JavaScript | TypeScript | 1 | 0.8× |
| JavaScript | React | 1 | 0.8× |
| Docker | Kubernetes | 1 | 0.8× |
| Python | Machine Learning | 1 | 0.8× |
| TypeScript | React | 2 (via JS) | 0.64× |

---

## Grafo após seed

| Label | Qtd | IDs representativos |
|-------|-----|---------------------|
| `Profession` | 6 | backend-dev, frontend-dev, fullstack-dev, devops, data-scientist, mobile-dev |
| `Skill` | 20+ | nodejs, typescript, javascript, react, postgresql, docker, python, go, kotlin, swift... |
| `REQUIRES` | 12+ | Profession → Skill |
| `RELATED_TO` | 50+ | Skill ↔ Skill (bidirecional, weight 0.8) |

---

## Como testar manualmente

```bash
# Subir ambiente
docker compose up -d
npm run dev

# Verificar grafo no Neo4j Browser (http://localhost:7474)
# Adjacências:
MATCH (a:Skill)-[r:RELATED_TO]->(b:Skill) RETURN a.name, b.name, r.weight LIMIT 20

# Candidate com "SQL" recebe score > 0 em vaga que pede "PostgreSQL"
curl -s "http://localhost:3000/jobs/feed" -H "Authorization: Bearer <CANDIDATE_TOKEN>"
```

---

## Rodar os testes

```bash
npm run test:unit         # testes unitários do algoritmo (sem Docker)
npm run test:integration  # tests/integration/recommendation.test.ts (requer Neo4j)
```
