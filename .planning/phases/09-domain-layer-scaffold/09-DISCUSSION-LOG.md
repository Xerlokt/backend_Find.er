# Phase 9: Domain Layer Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 09 — Domain Layer Scaffold
**Areas discussed:** Value objects, Profundidade das interfaces, Toque no errorHandler

---

## Value Objects

| Option | Description | Selected |
|--------|-------------|----------|
| Adiar para Fase 12 | Criar só entidades e interfaces na Fase 9. Value objects ficam para as fases que realmente os usam. Evita shape prematuro. | ✓ |
| Incluir agora | Criar fit-score.vo.ts e location.vo.ts já na Fase 9 conforme plan-architecture.md. Scaffold completo e consistente. | |

**User's choice:** Adiar para Fase 12
**Notes:** Preferência por scaffold mínimo e preciso — value objects quando forem necessários.

---

## Profundidade das Interfaces

| Option | Description | Selected |
|--------|-------------|----------|
| Contrato completo agora | Analisar serviços atuais e definir todos os métodos. Scaffold é o contrato definitivo — fases de migração implementam, não inventam. | ✓ |
| Mínimo por fase | Definir só o que a Fase 10 precisa agora; cada fase expande a interface do seu módulo incrementalmente. | |

**User's choice:** Contrato completo agora
**Notes:** Interfaces devem ser derivadas dos repositórios existentes em src/modules/.

---

## Toque no errorHandler

| Option | Description | Selected |
|--------|-------------|----------|
| Zero toque em arquivos existentes | Fase 9 cria apenas arquivos novos. errorHandler.ts usa AppError até a Fase 10. Risco zero de regressão. | ✓ |
| Atualizar errorHandler agora | Adicionar instanceof DomainError no errorHandler.ts já na Fase 9 (sem mudança de comportamento). | |

**User's choice:** Zero toque em arquivos existentes
**Notes:** Máxima segurança — nenhum arquivo existente é tocado.

---

## Claude's Discretion

- Recruiter entity: incluir por consistência com a árvore completa do plan-architecture.md
- Barrel files (index.ts): Claude decide
- recommendation.repository.interface.ts: Claude avalia pela inconsistência no plan-architecture.md
- Campos exatos de cada entity: espelhar modelos Prisma como fonte da verdade

## Deferred Ideas

- fit-score.vo.ts → Fase 12
- location.vo.ts → Fase 11 ou 12
