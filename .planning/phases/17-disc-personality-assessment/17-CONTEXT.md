# Phase 17: DISC Personality Assessment - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar um assessment DISC simplificado de 4 perguntas ao fluxo do candidato: o resultado é armazenado no perfil, o perfil dominante (D/I/S/C) aparece no card censurado do ranking para recrutadores, e entra no fit score como fator adicional de até 10% quando a vaga declara um perfil DISC desejado.

**Em escopo:**
- Novo modelo `DiscResult` no Prisma (candidateId, raw scores d/i/s/c, dominant, timestamps)
- Novo campo `discProfile: String?` no modelo `Job`
- Endpoint `POST /candidates/:id/disc` — candidato submete 4 respostas → perfil dominante calculado e armazenado
- Endpoint `GET /candidates/:id/disc` — candidato recupera seu perfil dominante
- Integração em `censorProfile()` — `discProfile` aparece no `CensoredProfile` quando candidato já fez o assessment
- Extensão de `FitScoreInput` e `FitScoreJobInput` com campos DISC
- Extensão de `computeFitScore()` com redistribuição proporcional de pesos quando job tem discProfile
- 2 migrações Prisma: `DiscResult` model + `Job.discProfile` field

**Fora de escopo:**
- DISC com 28 perguntas completas (forced-choice completo) — MVP de 4 perguntas em v3.0
- DISC como filtro ou penalidade — scoring aditivo apenas (nunca penalidade por mismatch)
- DISC no FullProfile no ranking (apenas success criteria para CensoredProfile — DISC-02)
- Visualização de scores raw (D/I/S/C individuais) pelo candidato via API

</domain>

<decisions>
## Implementation Decisions

### D-01: Formato do assessment — forced-choice
Cada uma das 4 perguntas apresenta **4 opções**, uma por dimensão (D, I, S, C). O candidato escolhe a opção que melhor o descreve. Score por dimensão = número de vezes que escolheu aquela dimensão (0–4).

### D-02: Idioma das perguntas
Perguntas e opções de resposta em **PT-BR**.

### D-03: Tie-breaking — ordem de prioridade D > I > S > C
Quando duas ou mais dimensões empatam no score máximo, o perfil dominante é determinado pela ordem de prioridade: D > I > S > C. Deterministico e simples de implementar e testar.

### D-04: Retake — PUT semantics (sobrescreve)
`POST /candidates/:id/disc` sempre atualiza o resultado existente (upsert). O candidato pode refazer o assessment quantas vezes quiser. Não há lock após primeira submissão.

### D-05: Fit score — redistribuição proporcional de pesos
Quando a vaga tem `discProfile` definido:
- profession: **27%** (era 30%)
- skills: **31.5%** (era 35%)
- location: **18%** (era 20%)
- modality: **9%** (era 10%)
- salary: **4.5%** (era 5%)
- DISC: **10%** (novo — só ativo quando vaga tem discProfile)

Quando a vaga **não** tem `discProfile`: pesos originais inalterados (30/35/20/10/5), discWeight = 0.

Match DISC = `candidate.discDominant === job.discProfile` → discScore = 1.0 → contribui 10 pontos.
Mismatch ou candidato sem DISC → discScore = 0.0 → sem penalidade, pesos redistribuídos igualmente aplicados.

### D-06: Card censurado — campo omitido quando candidato não fez DISC
`CensoredProfile` inclui `discProfile: string` **somente** quando o candidato já completou o assessment. Quando não completou, o campo é omitido do JSON (não `discProfile: null`).

### Claude's Discretion
- Conteúdo exato das 4 perguntas e suas 16 opções (PT-BR, formato forced-choice travado por D-01)
- Estrutura exata do modelo Prisma `DiscResult` (campos, índices, relação com CandidateProfile)
- Nomes das extensões em `FitScoreInput` (`discDominant?: string | null`) e `FitScoreJobInput` (`discProfile?: string | null`)
- Lógica de autorização para `POST /candidates/:id/disc` (JWT user deve ser dono do candidateId ou ADMIN)
- Se `discProfile` também aparece em `FullProfile` no ranking (não requerido pelos success criteria — apenas DISC-02 menciona CensoredProfile)
- Nome e localização do arquivo de perguntas/opções no código (constante em use case, enum, ou arquivo separado)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase
- `.planning/REQUIREMENTS.md` — DISC-01, DISC-02, DISC-03, DISC-04
- `.planning/ROADMAP.md` §"Phase 17: DISC Personality Assessment" — goal, success criteria (5 itens)

### Interfaces a criar/modificar
- `src/domain/interfaces/recommendation.repository.interface.ts` — `FitScoreInput`, `FitScoreJobInput` (adicionar campos DISC)
- `src/domain/interfaces/` — novo `IDiscRepository` a criar

### Adapters a criar/modificar
- `src/adapters/services/recommendation.repository.ts` — `computeFitScore()` (integrar redistribuição de pesos DISC, D-05)
- `src/adapters/repositories/` — novo `DiscRepository` a criar (CRUD de DiscResult)

### Lógica de censura (DISC-02 integration)
- `src/application/use-cases/swipe/get-ranking.use-case.ts` — `censorProfile()`, `CensoredProfile`, `FullProfile` (adicionar discProfile ao CensoredProfile conforme D-06)

### Schema e migrations
- `prisma/schema.prisma` — modelo `Job` (add `discProfile String?`) + novo modelo `DiscResult`

### Rotas e controller existentes (padrão a seguir)
- `src/infrastructure/http/routes/candidate.routes.ts` — padrão de rotas autenticadas com requireRole('CANDIDATE')
- `src/adapters/controllers/candidate.controller.ts` — padrão de controller com Zod + DomainError

### Dependency enforcement
- `scripts/check-deps.ts` — layer rule enforcement; DISC logic fica em `application/`, Prisma em `adapters/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `censorProfile()` em `src/application/use-cases/swipe/get-ranking.use-case.ts` — single code path para reveal/conceal; DISC-02 integra aqui adicionando `discProfile` ao retorno de `CensoredProfile`
- `CandidateController` em `src/adapters/controllers/candidate.controller.ts` — padrão de controller para novas rotas DISC; novos métodos `submitDisc` e `getDisc` seguem o mesmo shape (Zod parse → use case → DomainError handler)
- `candidateRoutes` em `src/infrastructure/http/routes/candidate.routes.ts` — novo arquivo de rotas DISC segue o mesmo padrão (authenticate + requireRole + controller bind)
- `RecommendationRepository.computeFitScore()` — recebe `FitScoreInput` e `FitScoreJobInput`; extensão com campos DISC deve ser backward-compatible via optional fields

### Established Patterns
- **Upsert no Prisma:** `prisma.model.upsert({ where: ..., create: ..., update: ... })` — padrão já usado em CandidateProfile; DiscResult segue o mesmo
- **Clean Architecture:** domain entity + interface em `src/domain/`, use case em `src/application/use-cases/`, repository adapter em `src/adapters/repositories/`, routes em `src/infrastructure/http/routes/`
- **DomainError:** `new DomainError(message, 'CODE', statusCode)` — ordem dos args; mesmo padrão para erros DISC (ex: NOT_FOUND para GET sem resultado)
- **JWT candidateId:** candidatos acessam próprios recursos via `request.user.id` (userId) → lookup de `CandidateProfile` pelo `userId`; rota `:id` deve verificar que o candidateId do JWT bate com o parâmetro

### Integration Points
- `GetRankingUseCase` precisa receber `discDominant` do candidato (via `ISwipeRepository.findSwipesByJobId` que retorna `SwipeWithCandidateInfo`) para montar `FitScoreInput`
- `FitScoreJobInput` em `GetRankingUseCase` já monta campos do Job; adicionar `discProfile` aqui
- Ambas as migrações Prisma (DiscResult + Job.discProfile) devem ser additive — sem destruir dados existentes

</code_context>

<specifics>
## Specific Ideas

- Score por dimensão armazenado como campos separados no `DiscResult` (ex: `scoreD Int, scoreI Int, scoreS Int, scoreC Int`) para auditoria futura, mesmo que a API exponha só o dominante
- A constante de perguntas/opções deve ser um objeto JSON tipado em TypeScript (não enum), para facilitar serialização no endpoint `GET /candidates/:id/disc` caso o frontend precise renderizar o formulário
- O campo `discProfile` no `CensoredProfile` deve ser do tipo `string` (D/I/S/C) — omitido quando null (D-06), sem campo `discProfile?: null` explícito

</specifics>

<deferred>
## Deferred Ideas

- DISC com 28 perguntas forced-choice completo — já registrado em REQUIREMENTS.md Future Requirements
- Exibir scores raw (D/I/S/C individuais) ao candidato — apenas dominante em v3.0
- Perfil DISC co-dominante (ex: "DI") quando empate — substituído pela ordem D>I>S>C (D-03)
- discProfile em FullProfile no ranking — não requerido pelos success criteria desta fase

</deferred>

---

*Phase: 17-disc-personality-assessment*
*Context gathered: 2026-05-29*
