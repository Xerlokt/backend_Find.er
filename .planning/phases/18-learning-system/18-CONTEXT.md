# Phase 18: Learning System - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Cada candidato acumula um registro `CandidateWeights` que deriva do histórico de LIKEs via EMA (exponential moving average). Após atingir o cold-start threshold de 5 LIKEs, o feed do candidato usa os pesos personalizados em vez dos globais fixos no cálculo do fit score. O ranking do recrutador não é afetado — usa sempre os pesos globais.

**Em escopo:**
- Novo modelo `CandidateWeights` no Prisma (um registro por candidato)
- Nova `IWeightsRepository` interface em `src/domain/interfaces/`
- Nova `WeightsRepository` adapter em `src/adapters/repositories/`
- Extensão de `RecordSwipeUseCase` para atualizar pesos via EMA quando direction === 'LIKE'
- Extensão de `GetFeedUseCase` para buscar pesos do candidato e passá-los ao computeFitScore
- Extensão de `computeFitScore` (interface + adapter) para receber pesos opcionais como parâmetro
- 1 migração Prisma: `CandidateWeights` model
- Testes unitários e de integração (TDD)

**Fora de escopo:**
- GetRankingUseCase — não usa pesos personalizados (apenas feed do candidato)
- Histórico de LIKEs persistido (apenas pesos correntes, sem audit trail por LIKE)
- DISC como fator aprendido (redistribuição D-05 continua sendo aplicada à parte)
- Recalcular pesos de LIKEs passados (EMA incremental — não precisa de histórico)

</domain>

<decisions>
## Implementation Decisions

### Algoritmo de aprendizado
- **D-01:** Algoritmo é EMA com α = 0.1: `new_w = 0.1 * observed_score + 0.9 * old_w`
- **D-02:** Por LIKE: compute os 5 factor scores da vaga curtida (professionScore, skillsScore, locationScore, modalityScore, salaryScore), aplica EMA para cada um separadamente
- **D-03:** Pesos iniciais (antes do primeiro LIKE) = pesos globais fixos: profession=0.30, skills=0.35, location=0.20, modality=0.10, salary=0.05
- **D-04:** Pesos armazenados como floats normalizados (devem somar ~1.0 após cada update; renormalizar se necessário)

### Cold-start threshold
- **D-05:** Candidatos com < 5 LIKEs recebem feed ordenado pelos pesos globais padrão (comportamento atual inalterado)
- **D-06:** Candidatos com ≥ 5 LIKEs recebem feed ordenado pelos pesos personalizados de `CandidateWeights`
- **D-07:** `likeCount` é rastreado em `CandidateWeights` (ou derivado de query ao Swipe) para aplicar o threshold

### Persistência
- **D-08:** `CandidateWeights` armazena apenas os pesos correntes — sem histórico por LIKE
- **D-09:** Modelo inclui: `candidateId`, `professionWeight`, `skillsWeight`, `locationWeight`, `modalityWeight`, `salaryWeight`, `likeCount`, timestamps
- **D-10:** Upsert pattern: se não existe, cria com defaults; se existe, atualiza via EMA

### Integração arquitetural
- **D-11:** Trigger de update: dentro de `RecordSwipeUseCase` quando `direction === 'LIKE'`, via `IWeightsRepository`
- **D-12:** `GetFeedUseCase` busca `CandidateWeights` via `IWeightsRepository` e passa os pesos ao `computeFitScore` quando `likeCount >= 5`
- **D-13:** `computeFitScore` recebe pesos opcionais como parâmetro separado (não dentro de `FitScoreInput`) — assinatura: `computeFitScore(candidate, job, weights?: WeightSet)`
- **D-14:** DISC redistribuição (D-05 da Phase 17) aplica sobre os pesos personalizados da mesma forma que aplica sobre os globais — `w = hasDiscRequirement ? 0.9 : 1.0` multiplica os pesos recebidos

### Cache
- **D-15:** Sem mudança na estratégia de cache — `RecordSwipeUseCase` já chama `cache.del(feed:{candidateId})` no LIKE; o próximo feed request gera nova cache com os pesos atualizados
- **D-16:** Cache key `feed:{candidateId}` não muda — a invalidação por LIKE já cobre a atualização de pesos

### Escopo do aprendizado
- **D-17:** `GetRankingUseCase` (ranking do recrutador) NÃO usa pesos personalizados — continua com pesos globais fixos
- **D-18:** Somente `GetFeedUseCase` recebe o comportamento personalizado (LEARN-03 literal)

### Claude's Discretion
- Estrutura exata de `WeightSet` type (interface inline vs type alias vs exportado de domain/interfaces/)
- Renormalização dos pesos após EMA: se necessário por precision drift ou não
- Localização de `IWeightsRepository` (arquivo próprio em `src/domain/interfaces/weights.repository.interface.ts`)
- Estratégia de teste unitário para EMA (mock `IWeightsRepository`, verificar que new_w = 0.1*score + 0.9*old_w)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase
- `.planning/REQUIREMENTS.md` — LEARN-01, LEARN-02, LEARN-03
- `.planning/ROADMAP.md` §"Phase 18: Learning System" — goal, success criteria (3 itens)

### Use cases a modificar
- `src/application/use-cases/swipe/record-swipe.use-case.ts` — adicionar IWeightsRepository ao constructor + update EMA em LIKE (D-11)
- `src/application/use-cases/swipe/get-feed.use-case.ts` — adicionar IWeightsRepository ao constructor + passar pesos ao computeFitScore (D-12)

### Interfaces a criar/modificar
- `src/domain/interfaces/recommendation.repository.interface.ts` — estender `IRecommendationRepository.computeFitScore` com parâmetro `weights?` (D-13)
- `src/domain/interfaces/` — novo `IWeightsRepository` a criar (D-11)

### Adapter a criar/modificar
- `src/adapters/services/recommendation.repository.ts` — `computeFitScore()` recebe pesos opcionais e os usa no lugar dos fixos quando fornecidos (D-13, D-14)
- `src/adapters/repositories/` — novo `WeightsRepository` (Prisma upsert para CandidateWeights) a criar (D-10)

### Schema e migration
- `prisma/schema.prisma` — novo modelo `CandidateWeights` (D-09)

### Rotas existentes (sem mudança de interface HTTP)
- `src/infrastructure/http/routes/swipe.routes.ts` — wiring do RecordSwipeUseCase e GetFeedUseCase; adicionar IWeightsRepository na composição

### Dependency enforcement
- `scripts/check-deps.ts` — layer rule enforcement; IWeightsRepository em `domain/`, WeightsRepository em `adapters/`, uso em `application/` via interface

### Contexto DISC (interação D-14)
- `.planning/phases/17-disc-personality-assessment/17-CONTEXT.md` — D-05 redistribuição de pesos DISC deve ser aplicada SOBRE os pesos personalizados

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RecordSwipeUseCase` em `src/application/use-cases/swipe/record-swipe.use-case.ts` — já trata `direction === 'LIKE'` (cria chat, invalida cache feed); weight update se encaixa aqui como terceira ação no bloco LIKE
- `GetFeedUseCase` em `src/application/use-cases/swipe/get-feed.use-case.ts` — já chama `rec.computeFitScore(...)` com `FitScoreInput satisfies`; adicionar busca de pesos antes do `Promise.all`
- `RecommendationRepository.computeFitScore()` em `src/adapters/services/recommendation.repository.ts` — já tem pesos hardcoded (linhas 107–116); extensão para aceitar `weights?` substitui esses valores quando presente
- `ICachePort` em `src/application/ports/cache.port.ts` — já usado por ambos os use cases (cache.del + cache.get/set); padrão estabelecido para novos ports na application layer
- `DiscRepository` em `src/adapters/repositories/` — padrão de novo repositório Prisma com upsert a seguir

### Established Patterns
- **New repository pair:** domain interface em `src/domain/interfaces/{name}.repository.interface.ts` + adapter em `src/adapters/repositories/{name}.repository.ts` (padrão usado em Phase 17 para DiscRepository)
- **Upsert no Prisma:** `prisma.model.upsert({ where: { candidateId }, create: { ...defaults }, update: { ...ema } })` — mesmo padrão de DiscResult
- **Constructor injection:** ports/repos injetados via constructor; sem `new` dentro de use cases
- **DomainError:** `new DomainError(message, 'CODE', statusCode)` para erros de domínio

### Integration Points
- `RecordSwipeUseCase` constructor atual: `(repo: ISwipeRepository, chat: IChatPort, cache: ICachePort)` → estender para `(repo, chat, cache, weights: IWeightsRepository)`
- `GetFeedUseCase` constructor atual: `(repo: ISwipeRepository, rec: IRecommendationRepository, cache: ICachePort)` → estender para `(repo, rec, cache, weights: IWeightsRepository)`
- `swipe.routes.ts` é o ponto de composição onde os dois use cases são instanciados — `IWeightsRepository` é injetado lá
- `computeFitScore` hardcode em `recommendation.repository.ts` linhas 107–116: `const w = hasDiscRequirement ? 0.9 : 1.0` — pesos fixos 0.30/0.35/0.20/0.10/0.05 são os alvos da parametrização

</code_context>

<specifics>
## Specific Ideas

- `CandidateWeights.likeCount` rastreado como campo inteiro — cold-start threshold verificado com `weights.likeCount >= 5` (não via query extra ao Swipe)
- `WeightSet` type = `{ profession: number; skills: number; location: number; modality: number; salary: number }` — alinhado com os 5 fatores atuais
- A normalização dos pesos personalizados deve garantir que `profession + skills + location + modality + salary === 1.0` antes de aplicar; EMA puro pode sair levemente de 1.0 por float precision — renormalizar dividindo pela soma

</specifics>

<deferred>
## Deferred Ideas

- Pesos personalizados no GetRankingUseCase (ranking do recrutador) — fora de escopo nesta fase (D-17); poderia ser Phase 19 ou posterior
- Histórico de LIKEs para audit/replay — armazenar apenas pesos correntes (D-08); histórico completo seria feature separada
- Decaimento temporal dos pesos (LIKEs antigos pesam menos) — EMA simples sem fator temporal; sofisticação futura
- Reset de pesos quando candidato quiser "começar do zero" — endpoint de reset fora de escopo agora

</deferred>

---

*Phase: 18-learning-system*
*Context gathered: 2026-05-30*
