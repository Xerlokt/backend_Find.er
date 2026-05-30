# Fase 13 — Cleanup + Unit Test Layer (v2.0)

## O que foi construído

Remoção de todos os arquivos `src/modules/` (v1.0 legacy), validação automatizada de regras de dependência entre camadas com `check-deps.ts`, e camada de testes unitários completa para os use cases.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `scripts/check-deps.ts` | Usa `madge` para verificar que nenhuma camada importa outra proibida |
| `tests/unit/` | 53 testes unitários — use cases com mocks de interfaces (sem DB) |
| `tests/unit/check-deps.test.ts` | Testa que `check-deps.ts` falha corretamente em violações de camada |
| `src/modules/` | **Deletado** — todo código migrado para domain/application/adapters/infrastructure |

---

## Por que foi feito assim

### `check-deps.ts` com `madge`

`madge` analisa o grafo de imports do TypeScript e detecta imports entre camadas proibidas. O script é executado com `ts-node --transpile-only` (scripts/ fica fora de `src/`, então `--transpile-only` ignora a restrição de `rootDir`).

Regra mais sutil descoberta nessa fase: `adapters/` pode importar `infrastructure/database/` (Prisma/Neo4j clients), porque repositórios são os adapters para o banco. O que é proibido é `adapters/` importar `infrastructure/http/`.

### Por que 53 testes unitários?

Testes de integração provam que o HTTP endpoint funciona contra um banco real, mas não exercem cada path de erro do use case (ex: usuário não encontrado, senha errada, créditos insuficientes). Os unit tests cobrem esses caminhos mockando as interfaces de repositório, sem precisar subir Docker.

### Estratégia de mock

Mocks apontam para interfaces do domínio (ex: `IUserRepository`), nunca para implementações concretas (`UserRepository`). Se o contrato da interface mudar, os mocks quebram e forçam atualização dos testes.

---

## Estado final da v2.0

- `src/modules/` removido completamente
- `src/shared/` removido completamente
- 94 testes (53 unit + 41 integration) — todos verdes
- `npm run check:deps` passa sem violações
- Clean Architecture 4 camadas plenamente estabelecida

---

## Rodar os testes

```bash
npm test              # todos os 94 testes
npm run check:deps    # valida regras de dependência entre camadas
```
