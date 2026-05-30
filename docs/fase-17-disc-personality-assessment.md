# Fase 17 — DISC Personality Assessment (v3.0)

## O que foi construído

Candidatos completam um assessment DISC simplificado de 4 perguntas. O resultado (scores D, I, S, C + perfil dominante) é persistido no banco. O perfil dominante é visível no ranking para recrutadores e pode contribuir com até 10% de bônus aditivo no fit score de vagas que declaram `discProfile`.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/domain/entities/disc-result.entity.ts` | Entidade `DiscResult` (scoreD, scoreI, scoreS, scoreC, dominant: 'D'\|'I'\|'S'\|'C') |
| `src/domain/interfaces/disc.repository.interface.ts` | `IDiscRepository` — save, findByCandidateId |
| `src/application/use-cases/disc/submit-disc.use-case.ts` | `SubmitDiscUseCase` — calcula dominant, persiste, retorna resultado |
| `src/application/use-cases/disc/get-disc.use-case.ts` | `GetDiscUseCase` — retorna DiscResult ou 404 |
| `src/adapters/repositories/disc.repository.ts` | `DiscRepository` — Prisma CRUD para `DiscResult` |
| `src/adapters/controllers/disc.controller.ts` | Validação Zod (4 respostas) + chama use case + mapeia erros |
| `src/infrastructure/http/routes/disc.routes.ts` | `POST /candidates/:id/disc` e `GET /candidates/:id/disc` |
| `tests/unit/disc.use-cases.test.ts` | Unit tests: submit + get, dominant calculation, 404 case |
| `tests/integration/disc.test.ts` | Integration tests: HTTP routes, DB persistence, fit score com DISC |

---

## Por que foi feito assim

### 4 respostas, 1 por dimensão

O assessment simplificado pede ao candidato que distribua pontos (ou escolha uma opção) para cada dimensão D, I, S, C em 4 situações. O `SubmitDiscUseCase` recebe os 4 scores brutos e calcula o `dominant` como `argmax(scoreD, scoreI, scoreS, scoreC)`.

### `discProfile` na vaga é opcional

O campo `Job.discProfile` é `string | null` no schema Prisma. Se `null`, o peso DISC no fit score é `0` — a vaga não tem preferência de perfil. Isso garante que vagas existentes não sejam afetadas.

### Bônus DISC: aditivo, nunca penalizador

```typescript
const discBonus = job.discProfile && candidate.discDominant === job.discProfile
  ? 0.10
  : 0.0;

fitScore = Math.round((baseScore + discBonus * 100));
```

- Match: +10% (aditivo ao score base de 0–100)
- Mismatch: 0 (nenhuma penalidade)
- Sem `discProfile` na vaga: 0

O DISC nunca é usado como filtro hard. Candidatos sem DISC completado recebem bônus 0, não são excluídos.

### `discProfile` visível no ranking antes do unlock

O campo `discProfile` aparece no `RankingItem` mesmo para candidatos DISLIKE bloqueados — é um sinal de fit, não um dado de identidade.

### Cascade delete

`DiscResult` tem `onDelete: Cascade` para `CandidateProfile`. Deletar um candidato remove automaticamente seu resultado DISC.

---

## Schema Prisma adicionado

```prisma
model DiscResult {
  id          String           @id @default(uuid())
  candidateId String           @unique
  scoreD      Float
  scoreI      Float
  scoreS      Float
  scoreC      Float
  dominant    String           // 'D' | 'I' | 'S' | 'C'
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  candidate   CandidateProfile @relation(fields: [candidateId], references: [id], onDelete: Cascade)
}
```

```prisma
model Job {
  // ...campos existentes...
  discProfile String?  // 'D' | 'I' | 'S' | 'C' | null
}
```

---

## Endpoints

### `POST /candidates/:id/disc`

Body:
```json
{
  "scoreD": 7,
  "scoreI": 3,
  "scoreS": 5,
  "scoreC": 9
}
```

Response `201`:
```json
{
  "id": "uuid",
  "dominant": "C",
  "scoreD": 7,
  "scoreI": 3,
  "scoreS": 5,
  "scoreC": 9
}
```

### `GET /candidates/:id/disc`

Response `200`:
```json
{
  "id": "uuid",
  "dominant": "C",
  "scoreD": 7,
  "scoreI": 3,
  "scoreS": 5,
  "scoreC": 9,
  "createdAt": "2026-05-29T..."
}
```

---

## Como testar manualmente

```bash
# 1. Autenticar como candidato e submeter DISC
curl -X POST http://localhost:3000/candidates/<CANDIDATE_ID>/disc \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"scoreD":8,"scoreI":4,"scoreS":3,"scoreC":9}'

# 2. Verificar resultado
curl http://localhost:3000/candidates/<CANDIDATE_ID>/disc \
  -H "Authorization: Bearer <TOKEN>"

# 3. Criar vaga com discProfile e verificar bônus no ranking
curl -X POST http://localhost:3000/jobs \
  -H "Authorization: Bearer <RECRUITER_TOKEN>" \
  -d '{"title":"Backend Dev","discProfile":"C",...}'
```

---

## Rodar os testes

```bash
npm run test:unit         # tests/unit/disc.use-cases.test.ts
npm run test:integration  # tests/integration/disc.test.ts
npm test                  # todos os 94 testes
```
