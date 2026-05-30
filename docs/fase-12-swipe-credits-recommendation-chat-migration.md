# Fase 12 — Swipe, Credits, Recommendation, Chat Migration (v2.0)

## O que foi construído

Migração dos módulos restantes (Swipe, Credits, Recommendation, Chat) para Clean Architecture. `Neo4jAdapter`, `CreditService` e `ChatService` tipados para interfaces em vez de implementações concretas.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/application/use-cases/swipe/` | RecordSwipeUseCase, GetFeedUseCase, GetRankingUseCase |
| `src/application/use-cases/credits/` | UnlockCandidateUseCase, GrantCreditsUseCase |
| `src/application/use-cases/credits/credits.constants.ts` | `UNLOCK_COST_BY_PLAN` — constante de negócio na camada application |
| `src/application/use-cases/chat/` | CreateOrGetChatUseCase, ListChatsUseCase, GetMessagesUseCase, VerifyParticipantUseCase |
| `src/adapters/services/neo4j.adapter.ts` | `Neo4jAdapter` implementando `IGraphPort` |
| `src/adapters/services/credit.service.ts` | `CreditService` tipado para `ICreditRepository` |
| `src/adapters/services/chat.service.ts` | `ChatService` tipado para `IChatRepository` |
| `src/adapters/repositories/swipe.repository.ts` | P2002 tratado dentro de `prisma.$transaction` |
| `src/adapters/repositories/credit.repository.ts` | `executeUnlock` em transação atômica; P2002 swallowed |
| `src/adapters/repositories/chat.repository.ts` | `findParticipants()`, `findByUserId()` retornam tipos domain |

---

## Por que foi feito assim

### `UNLOCK_COST_BY_PLAN` na camada application

A constante que define quantos créditos cada plano gasta para desbloquear candidatos é regra de negócio — pertence a `application/use-cases/credits/`, não a `modules/credits/` nem `infrastructure/`.

### P2002 swallado dentro da transação

Duplicatas de swipe e de unlock são silenciadas dentro do `prisma.$transaction`, antes de chegar ao use case. O use case permanece limpo de imports `@prisma/client` (ARCH-07). Se a transação falha por outro motivo, o erro propaga normalmente.

### `FitScoreInput.id` obrigatório

A interface `FitScoreInput` requer o campo `id` do candidato (adicionado na fase 12-02) para que o `GetRankingUseCase` saiba qual candidato censorar. Use cases usam `satisfies FitScoreInput` para garantir em tempo de compilação.

### Rota `/feed` antes de `/:jobId/ranking`

Assim como `/mine` na fase 11, `/feed` deve ser registrada antes de `/:jobId` em `swipeJobRoutes` para evitar que `'feed'` seja capturado como UUID.

### Censura de DISLIKE em GetRankingUseCase

Candidatos DISLIKE não-desbloqueados retornam `profile: null`. Candidatos LIKE ou desbloqueados retornam perfil completo. Essa decisão está no use case, não no controller.

---

## Rodar os testes

```bash
npm run test:integration  # swipe.test.ts, credits.test.ts, recommendation.test.ts, chat.test.ts
npm run test:unit         # record-swipe.use-case.test.ts, unlock-candidate.use-case.test.ts
```
