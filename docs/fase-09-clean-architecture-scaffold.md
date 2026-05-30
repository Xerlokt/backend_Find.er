# Fase 09 — Domain Layer Scaffold (v2.0)

## O que foi construído

Esqueleto completo da Clean Architecture: entidades de domínio puras, interfaces de repositório e ports (IHashPort, ITokenPort, IGraphPort) — tudo sem nenhuma dependência de framework ou banco de dados.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/domain/entities/*.entity.ts` | 11 entidades puras (User, Candidate, Recruiter, Company, Job, Swipe, Chat, Message, CreditTransaction, RefreshToken, Unlock) |
| `src/domain/interfaces/*.repository.interface.ts` | 11 interfaces de repositório — contratos para adapters implementarem |
| `src/application/ports/hash.port.ts` | `IHashPort` — contrato para bcrypt |
| `src/application/ports/token.port.ts` | `ITokenPort` — contrato para JWT |
| `src/application/ports/graph.port.ts` | `IGraphPort` — contrato para Neo4j |
| `src/application/errors/domain.error.ts` | `DomainError` — erro de domínio tipado |

---

## Por que foi feito assim

### Entidades como tipos TypeScript puros

As entidades usam `type` e string union types em vez de `class` e `enum`. Exemplo:

```typescript
export type SwipeDirection = 'LIKE' | 'DISLIKE';

export type Swipe = {
  id: string;
  candidateId: string;
  jobId: string;
  direction: SwipeDirection;
  createdAt: Date;
};
```

Isso segue o plano de arquitetura canônico do projeto. `enum` do TypeScript gera código em runtime e complica a separação de camadas.

### Interfaces derivadas de implementações existentes

Todas as assinaturas das interfaces foram derivadas dos arquivos `src/modules/*/*.repository.ts` existentes (v1.0). Nenhum método foi inventado. Isso garante que a Phase 10 em diante pode implementar os adapters sem surpresas de contrato.

### Zero Prisma em domain/

`src/domain/interfaces/` não importa `@prisma/client`, nem nenhum outro pacote externo. Todos os tipos vêm exclusivamente de `src/domain/entities/`. A regra é verificada por `npm run check:deps`.

### Helper types co-localizados

Types auxiliares necessários pelas interfaces (ex: `SwipeWithCandidateInfo`, `ChatParticipants`, `FitScoreInput`) ficam no mesmo arquivo da interface consumidora, não em um `shared/types/` genérico.

---

## Regra de dependência (enforced)

```
domain/ → importa nada
application/ → importa apenas domain/
adapters/ → importa application/ + domain/
infrastructure/ → importa tudo
```

---

## Rodar os testes

```bash
npm run check:deps   # verifica que nenhum arquivo em domain/ importa framework
```
