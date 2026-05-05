# Phase 9: Domain Layer Scaffold - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar os esqueletos de `src/domain/` e `src/application/` — entidades, interfaces de repositório, ports e DomainError. Nenhuma mudança de comportamento; todos os 41 testes de integração continuam verdes após o scaffold. Nenhum arquivo existente é modificado.

</domain>

<decisions>
## Implementation Decisions

### Value Objects
- **D-01:** `fit-score.vo.ts` e `location.vo.ts` são **adiados** — não fazem parte do escopo da Fase 9. Serão criados nas fases que realmente os usam (Fase 11/12). O diretório `src/domain/value-objects/` não é criado nesta fase.

### Repository Interfaces
- **D-02:** Cada `IXxxRepository` define **todos os métodos** que o módulo atual usa — contrato completo desde o início. O agente de pesquisa/planejador deve analisar os arquivos `*.repository.ts` em `src/modules/` para derivar os métodos necessários por interface. As fases de migração implementam; não inventam novos métodos.
- **D-03:** `IRefreshTokenRepository` deve ser criado em `src/domain/interfaces/` junto com os demais — é necessário pelos use cases de auth conforme o exemplo no `plan-architecture.md`.

### Existing Files
- **D-04:** Zero toque em arquivos existentes. `errorHandler.ts`, `AppError.ts` e todo `src/modules/` e `src/shared/` permanecem inalterados. A Fase 9 cria apenas arquivos novos.

### DomainError
- **D-05:** DomainError coexiste com AppError durante a migração. Assinatura: `new DomainError(message: string, code: string, statusCode: number)` — conforme o exemplo em `plan-architecture.md`. Não estende `AppError`; é uma classe independente que estende `Error`.

### Claude's Discretion
- Ordem exata dos campos em cada entity interface (seguir os modelos Prisma como fonte da verdade para nomes e tipos de campos)
- Se incluir `recruiter.entity.ts` — plan-architecture.md lista na estrutura completa; incluir por consistência
- Barrel files (`index.ts`) por diretório — Claude decide se vale o overhead
- Se `recommendation.repository.interface.ts` deve existir em `src/domain/interfaces/` (está no esboço inicial do plan-architecture.md mas não na árvore completa) — Claude avalia

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture contract
- `plan-architecture.md` — Documento canonical para o refactor. Define shapes de entidades, convenções de nomenclatura, estrutura completa de pastas, exemplos de ports, interfaces de repositório e regra de dependência. **Ler integralmente antes de planejar.**

### Requirements
- `.planning/REQUIREMENTS.md` §v2 — ARCH-05 (entities sem imports externos), ARCH-06 (repository interfaces como portas de saída), ARCH-08 (ports para serviços externos). Critérios de aceite da Fase 9.

### Source of truth for interface method signatures
- `src/modules/auth/auth.repository.ts` — Métodos atuais do repositório de auth (User + RefreshToken)
- `src/modules/candidate/candidate.repository.ts`
- `src/modules/company/company.repository.ts`
- `src/modules/recruiter/recruiter.repository.ts`
- `src/modules/job/job.repository.ts`
- `src/modules/swipe/swipe.repository.ts`
- `src/modules/credits/credits.repository.ts`
- `src/modules/chat/chat.repository.ts`
- `src/modules/recommendation/recommendation.repository.ts`

### Existing error pattern
- `src/shared/errors/AppError.ts` — Shape atual do AppError para referência de comparação; DomainError NÃO estende isso

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/interfaces/chat.interface.ts` — Exemplo de como interfaces ARCH-04 existentes são definidas; padrão de tipos usados (ChatInitiator de @prisma/client). **Atenção:** as interfaces de `src/domain/interfaces/` NÃO podem importar `@prisma/client` — devem usar seus próprios enums/tipos.
- `src/shared/interfaces/recommendation.interface.ts` — Segundo exemplo de interface ARCH-04 existente

### Established Patterns
- Todos os serviços existentes usam `AppError` com shape `(message, statusCode, code?)`. `DomainError` terá ordem diferente de args: `(message, code, statusCode)` per plan-architecture.md
- Entidades Prisma têm campos em camelCase (ex: `passwordHash`, `createdAt`) — as domain entities devem espelhar esses nomes

### Integration Points
- Fase 9 não conecta nada ao código existente — é puro additive
- A Fase 10 será a primeira a importar de `src/domain/` e `src/application/`

</code_context>

<specifics>
## Specific Ideas

- "Contrato completo agora" — o scaffold é definitivo. As fases de migração implementam o que está aqui, não adicionam métodos ad-hoc às interfaces.
- Zero toque em arquivos existentes é um requisito explícito, não uma sugestão — o plano deve ter um checklist verificando que nenhum arquivo fora de `src/domain/` e `src/application/` foi modificado.

</specifics>

<deferred>
## Deferred Ideas

- `src/domain/value-objects/fit-score.vo.ts` — Fase 12 (usado no cálculo de fit score durante migração de recommendation/swipe)
- `src/domain/value-objects/location.vo.ts` — Fase 11 ou 12 (usado em candidate/job com haversine)

</deferred>

---

*Phase: 09-domain-layer-scaffold*
*Context gathered: 2026-05-05*
