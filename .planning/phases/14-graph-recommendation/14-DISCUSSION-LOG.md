# Phase 14: Graph Recommendation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 14-graph-recommendation
**Areas discussed:** Traversal approach, Skill matching in Neo4j, Taxonomy scope

---

## Traversal approach

| Option | Description | Selected |
|--------|-------------|----------|
| Cypher faz o math completo | Query Cypher retorna skill score (float) pronto | |
| Cypher retorna adjacência, TypeScript computa | Cypher retorna `[{skill, hops}]`; TypeScript aplica pesos | ✓ |
| Cypher expande skill set, TypeScript faz intersecção | Cypher retorna skills expandidas; TypeScript conta matches | |

**User's choice:** Cypher retorna `[{skill: string, hops: number}]` para cada skill da vaga que o candidato alcança. TypeScript aplica: 0 hops = 1.0x, 1 hop = 0.8x, 2 hops = 0.6x.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Lista de matches com hops: [{skill, hops}] | Cypher retorna cada match com número de hops | ✓ |
| Número de matches por nível: {direct, oneHop, twoHop} | Cypher agrega em 3 contagens | |

**User's choice:** Lista granular `[{skill, hops}]` — mais flexível para ajustar pesos no futuro.

---

## Skill matching in Neo4j

| Option | Description | Selected |
|--------|-------------|----------|
| Comparar por nome no Cypher (case-insensitive) | WHERE toLower(s.name) IN $skillNames | |
| Adicionar skillIds em FitScoreInput, comparar por ID | skillIds: string[]; WHERE s.id IN $skillIds | ✓ |
| Converter nome para ID no adapter antes da query | Normalização no adapter | |

**User's choice:** Adicionar `skillIds: string[]` em `FitScoreInput`; `requiredSkillIds: string[]` em `FitScoreJobInput`. Match por ID no Cypher.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — adicionar requiredSkillIds em FitScoreJobInput também | Mudança simétrica | ✓ |
| Não — vagas ficam com requiredSkills por nome | Minimiza mudanças na interface de vagas | |

**User's choice:** Mudança simétrica em ambas as interfaces.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Manter ambos: skills (nomes) + skillIds (IDs) | Backward compatible; sem breaking change nos callers | |
| Substituir skills por skillIds — atualizar todos os callers | Interface limpa; breaking change controlada | ✓ |

**User's choice:** Substituir — interface limpa. Todos os callers (repositórios + testes) devem ser atualizados nesta fase.

---

## Taxonomy scope (50 edges)

| Option | Description | Selected |
|--------|-------------|----------|
| Backend | SQL→PostgreSQL, Node.js→JavaScript→TypeScript, Python→Django etc | ✓ |
| Frontend | React→JavaScript→TypeScript, Vue, Angular, Next.js etc | ✓ |
| DevOps / Infra | Docker→Kubernetes, AWS, Terraform, CI/CD | ✓ |
| Mobile | Swift→iOS, Kotlin→Android, React Native, Flutter | ✓ |

**User's choice:** Todos os 4 domínios cobertos. ~50 RELATED_TO edges bidirecionais.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Bidirecionais — MERGE a→b e b→a | Consistente com seed atual; mais generoso no match | ✓ |
| Direcionadas — apenas a→b | Mais específico; exige curadoria das direções | |

**User's choice:** Bidirecionais — consistente com padrão já estabelecido no seed.

---

## Deferred Ideas

- Integração com taxonomia ESCO/O*NET — já marcada como deferred no REQUIREMENTS.md
- Pesos diferentes por tipo de adjacência — simplificar com 0.8/0.6 por ora
- Skill aliasing para nomes alternativos — parcialmente resolvido pelo uso de IDs
