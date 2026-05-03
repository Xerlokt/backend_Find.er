# Fase 07 — Créditos (unlock, audit log)

## O que foi construído

Economia de créditos completa em três planos: fundação (modelo Unlock, `CreditRepository` com `$transaction` atômico, `CreditService` com cadeia de guards); endpoint HTTP de desbloqueio (`POST /jobs/:jobId/candidates/:candidateId/unlock`) com 11 testes de integração verdes; e integração admin/swipe — refactor do `AdminService` para injeção de `ICreditService` (ARCH-04), endpoint de audit log e revelação de DISLIKE desbloqueado no ranking.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `prisma/schema.prisma` | Modelo `Unlock` com `@@unique([companyId, candidateId, jobId])` — evita unlock duplo no nível do banco |
| `src/modules/credits/credits.constants.ts` | `UNLOCK_COST_BY_PLAN` — custo por plano: `FREE=2`, `PRO=1` |
| `src/modules/credits/credits.repository.ts` | `CreditRepository` — camada DB: `executeUnlock` (transação atômica) e `grantCredits` |
| `src/modules/credits/credits.service.ts` | `CreditService` — cadeia de 6 guards + tratamento de erros do `$transaction` |
| `src/modules/credits/credits.routes.ts` | `creditsJobRoutes` — `POST /:jobId/candidates/:candidateId/unlock`, RECRUITER only |
| `src/shared/utils/haversine.ts` | `haversineKm(lat1, lng1, lat2, lng2)` — utilitário compartilhado extraído do módulo swipe |
| `src/modules/admin/admin.service.ts` | `ICreditService` interface (ARCH-04) + `AdminService` com `getTransactions` e delegação de `adjustCredits` |
| `src/modules/admin/admin.routes.ts` | `GET /admin/companies/:id/transactions` (audit log) — recebe `AdminService` pré-construído via `opts` |
| `src/app.ts` | Root de composição: instancia `CreditRepository`, `CreditService`, `AdminService` e injeta em `adminRoutes` |
| `src/modules/swipe/swipe.repository.ts` | `findUnlocksByJobAndCompany` — consulta `prisma.unlock` direto sem importar o módulo credits |
| `src/modules/swipe/swipe.service.ts` | `getRanking` revela perfil completo para candidatos DISLIKE que foram desbloqueados |
| `tests/unit/credit.service.test.ts` | 13 testes unitários — cadeia de guards, tiers de custo, race condition P2002, guard de amount |
| `tests/integration/credits.test.ts` | 11 testes de integração — happy path, todos os 7 caminhos de erro |
| `tests/integration/admin.test.ts` | +3 testes — audit log após grant de créditos |
| `tests/integration/swipe.test.ts` | +2 testes — DISLIKE desbloqueado revelado, DISLIKE não-desbloqueado censurado |

---

## Endpoints

### `POST /jobs/:jobId/candidates/:candidateId/unlock`

Desbloqueia o perfil de um candidato que deu DISLIKE. Debita créditos da empresa do recrutador autenticado.

**Auth:** `RECRUITER`

**Cadeia de guards (ordem):**

| Guard | Erro |
|-------|------|
| Recrutador não existe | `403 FORBIDDEN` |
| Vaga não encontrada | `404 NOT_FOUND` |
| Vaga não pertence ao recrutador | `403 FORBIDDEN` |
| Candidato não deu swipe nessa vaga | `404 NOT_FOUND` |
| Swipe é LIKE (candidato já visível) | `422 CANDIDATE_ALREADY_VISIBLE` |
| Candidato já foi desbloqueado | `409 ALREADY_UNLOCKED` |
| Créditos insuficientes | `402 INSUFFICIENT_CREDITS` |

**Response 201:**
```json
{
  "id": "uuid",
  "companyId": "uuid",
  "candidateId": "uuid",
  "jobId": "uuid",
  "unlockedAt": "2026-05-02T23:30:00.000Z",
  "creditsCost": 2,
  "profile": {
    "name": "João Silva",
    "avatarUrl": null,
    "bio": "...",
    "skills": ["nodejs", "typescript"],
    "professionId": "backend-dev",
    "preferredModalities": ["REMOTE"],
    "salaryExpectation": 8000,
    "distanceKm": 12.5
  }
}
```

---

### `GET /admin/companies/:id/transactions`

Audit log de créditos de uma empresa. Retorna todas as transações em ordem cronológica inversa.

**Auth:** `ADMIN`

**Response 200:**
```json
[
  {
    "id": "uuid",
    "companyId": "uuid",
    "amount": -2,
    "reason": "candidate_unlock",
    "createdAt": "2026-05-02T23:30:00.000Z"
  },
  {
    "id": "uuid",
    "companyId": "uuid",
    "amount": 10,
    "reason": "admin_grant",
    "createdAt": "2026-05-02T23:00:00.000Z"
  }
]
```

---

## Por que foi feito assim

### `$transaction` com guard dentro (TOCTOU-safe)

O check de saldo (`company.credits < creditsCost`) fica **dentro** do callback do `$transaction`, não antes. Dois motivos:

1. O check no service (`findUnlock`) é um fast-path otimista — não garante exclusividade sob concorrência.
2. O Prisma executa todo o callback em uma transação serializable. O check de saldo dentro garante que dois requests simultâneos de unlock não passem ao mesmo tempo com o mesmo saldo.

O `P2002` do `@@unique([companyId, candidateId, jobId])` funciona como segunda linha de defesa: se a transação atômica falhar por race condition de unlock duplo, o banco rejeita com constraint violation, que o service mapeia para `409 ALREADY_UNLOCKED`.

### `ICreditService` — AdminService depende de interface, não de implementação (ARCH-04)

`AdminService` recebe `ICreditService` no constructor. Isso significa:

- O módulo admin não importa nada de `src/modules/credits/` — a regra de isolamento de módulos é cumprida.
- `AdminService` é testável unitariamente com um mock simples (`{ grantCredits: jest.fn() }`).
- O `app.ts` é o único ponto onde `CreditService` concreto é instanciado e injetado — composition root.

### `adminRoutes` recebe `AdminService` via `opts`

Após o fix da review (WR-01/WR-02), as rotas admin não importam mais nada do módulo credits. O `app.ts` constrói `new CreditService(new CreditRepository())`, passa para `new AdminService(creditService)`, e registra `adminRoutes` com `opts: { service }`. Assim a rota é um handler puro — sem lógica de wiring.

### `findUnlocksByJobAndCompany` no `SwipeRepository` (sem importar credits)

Para revelar o perfil de DISLIKE desbloqueado no ranking, o `SwipeService` precisa saber quais candidatos foram desbloqueados. A solução correta é o `SwipeRepository` consultar `prisma.unlock` diretamente — o Prisma é um cliente de banco compartilhado, não é o módulo credits. O `SwipeService` jamais importa de `src/modules/credits/`.

### Custo por plano

```ts
export const UNLOCK_COST_BY_PLAN: Record<string, number> = {
  FREE: 2,
  PRO: 1,
}
```

O custo é resolvido na hora do unlock a partir do `company.plan` do recrutador autenticado. Planos desconhecidos caem no fallback `FREE=2`.

### `haversineKm` como utilitário compartilhado

A função existia embutida no `swipe.service.ts`. Na fase 7 foi extraída para `src/shared/utils/haversine.ts` e importada tanto pelo `credits.routes.ts` (distância no response do unlock) quanto pelo `swipe.service.ts` (distância no ranking e feed).

---

## Fluxo de desbloqueio (data flow)

```
POST /jobs/:jobId/candidates/:candidateId/unlock
  → authenticate (JWT → userId)
  → requireRole('RECRUITER')
  → creditsJobRoutes handler
    → CreditService.unlockCandidate(userId, jobId, candidateId)
      → 6 guards (403/404/422/409)
      → CreditRepository.executeUnlock(companyId, candidateId, jobId, cost)
        → prisma.$transaction
          → check credits >= cost  ← TOCTOU-safe
          → company.credits -= cost
          → unlock.create(@@unique guard)
          → creditTransaction.create(reason='candidate_unlock')
    → Promise.all(findCandidateProfileById, findJobById)
    → haversineKm(profile, job)
  → 201 { unlock + profile + distanceKm }
```

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Conceder créditos a uma empresa (admin)

```cmd
curl -s -X PATCH http://127.0.0.1:3000/admin/companies/<COMPANY_ID>/credits \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"amount\": 10}"
```

Esperado: `200` com `credits` incrementado.

### 2. Desbloquear um candidato DISLIKE

```cmd
curl -s -X POST http://127.0.0.1:3000/jobs/<JOB_ID>/candidates/<CANDIDATE_ID>/unlock \
  -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

Esperado: `201` com `creditsCost: 2` e `profile.name` visível.

### 3. Ver ranking — DISLIKE revelado

```cmd
curl -s http://127.0.0.1:3000/jobs/<JOB_ID>/ranking \
  -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

Esperado: o candidato desbloqueado aparece com `profile` não-nulo no ranking.

### 4. Ver audit log

```cmd
curl -s http://127.0.0.1:3000/admin/companies/<COMPANY_ID>/transactions \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Esperado: array com entradas `reason: 'admin_grant'` e `reason: 'candidate_unlock'`.

---

## Rodar os testes automatizados

```bash
# Unitários do CreditService (sem Docker)
npx jest tests/unit/credit.service.test.ts --no-coverage

# Integração — unlock endpoint
npx jest tests/integration/credits.test.ts --runInBand --no-coverage

# Integração — admin audit log
npx jest tests/integration/admin.test.ts --runInBand --no-coverage

# Integração — ranking reveal (DISLIKE desbloqueado)
npx jest tests/integration/swipe.test.ts --runInBand --no-coverage

# Todos de uma vez
npx jest --no-coverage
```

**Resultado esperado:** 13 unit + 11 credits integration + admin + swipe integration, todos verdes.
