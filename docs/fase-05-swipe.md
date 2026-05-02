# Fase 05 — Swipe

## O que foi construído

Mecânica completa de swipe em três planos: camada de dados com `SwipeRepository` + `SwipeService` (TDD, `$transaction` atômico, IDOR guard); rotas HTTP `POST /swipes` e `GET /jobs/feed` com Zod, rate-limit e paginação por cursor; e endpoint `GET /jobs/:jobId/ranking` com Haversine, regras de censura LIKE/DISLIKE e ownership check.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/modules/swipe/swipe.repository.ts` | `createSwipe` (transação atômica), `findSwipesByJobId`, `findFeedJobs` (cursor pagination, exclui já-swipados), `findCandidateProfileByUserId`, `findRecruiterProfileByUserId`, `findJobById` |
| `src/modules/swipe/swipe.service.ts` | `recordSwipe` (IDOR guard, validações de vaga ativa/expirada, P2002 → 409), `getFeed` (cursor pagination), `getRanking` (ownership check, Haversine, gate LIKE/DISLIKE, sort por rank) |
| `src/modules/swipe/swipe.routes.ts` | `swipeRoutes` — `POST /swipes` (CANDIDATE, rate-limit 30/min); `swipeJobRoutes` — `GET /jobs/feed` e `GET /jobs/:jobId/ranking` (RECRUITER) |
| `src/app.ts` | Registro de `swipeRoutes` em `/swipes` e `swipeJobRoutes` em `/jobs` |
| `tests/unit/swipe.service.test.ts` | 16 testes unitários (sem DB): 8 para `recordSwipe`/`getFeed`, 8 para `getRanking` |
| `tests/integration/swipe.test.ts` | 16 testes de integração HTTP: 6 para `POST /swipes`, 4 para `GET /jobs/feed`, 6 para `GET /jobs/:jobId/ranking` |
| `tests/helpers/factories.ts` | `createSwipe(userId, jobId, direction)` adicionado |

---

## Por que foi feito assim

### `candidateId` sempre resolvido pelo JWT

`SwipeService.recordSwipe` ignora qualquer `candidateId` do body. Busca o perfil via `repo.findCandidateProfileByUserId(userId)` onde `userId` vem do JWT. Se o body pudesse definir o `candidateId`, qualquer candidato poderia registrar swipes em nome de outro — IDOR direto.

### `prisma.$transaction` para swipe atômico

`SwipeRepository.createSwipe` executa o `prisma.swipe.create` dentro de `prisma.$transaction`. Sem transação, dois requests simultâneos do mesmo candidato para a mesma vaga poderiam criar dois registros antes de qualquer um ter a chance de detectar o conflito. A constraint única no banco (`candidateId + jobId`) lança `P2002`, que o serviço captura e converte em `AppError 409 DUPLICATE_SWIPE`.

### Vaga inativa retorna 404, não 400

`isActive: false` ou `expiresAt <= now` resulta em `404 NOT_FOUND`, não `400 BAD_REQUEST`. Retornar `400` revelaria que a vaga existe mas está inativa — information disclosure. O `404` não confirma nem nega a existência da vaga para quem não deveria acessá-la.

### `GET /feed` registrado antes de `/:jobId/ranking`

O Fastify casa rotas na ordem de registro. Se `/:jobId/ranking` fosse registrado primeiro, a requisição `GET /jobs/feed` seria capturada com `params.jobId = 'feed'`, que falha na validação UUID do Zod. O `GET /feed` é registrado primeiro dentro do mesmo plugin `swipeJobRoutes`.

### Gate LIKE/DISLIKE no ranking

No `getRanking`, a serialização de cada swipe usa `swipe.direction === 'LIKE' ? fullProfile : null`. Para DISLIKE, o objeto de perfil é `null` — apenas `candidateId`, `fitScore`, `rank` e `distanceKm` são visíveis. `lat` e `lng` são excluídos mesmo do perfil LIKE; apenas `distanceKm` (calculado via Haversine) é exposto para proteger a localização exata do candidato.

### `haversineKm` como função de módulo, null-safe

A função `haversineKm` é declarada fora da classe (nível de módulo) para ser testável diretamente sem instanciar o serviço. Retorna `null` quando qualquer coordenada é `null`, evitando cálculo com dados incompletos.

### `fitScore: 0` como placeholder (D-13)

O campo `fitScore` existe no ranking da Fase 5 com valor `0`. É um placeholder intencional — a Fase 6 substitui pelo score real do Neo4j. Comentado explicitamente no código.

---

## Endpoints

### `POST /swipes`

Registra um swipe de um candidato em uma vaga. Apenas CANDIDATE. Rate-limit: 30 requisições/minuto.

```http
POST /swipes
Authorization: Bearer <accessToken de CANDIDATE>
Content-Type: application/json

{
  "jobId": "uuid-da-vaga",
  "direction": "LIKE"
}
```

**Resposta 201:** swipe criado.

**Erros:**
- `400` — `jobId` não é UUID, `direction` não é `LIKE` ou `DISLIKE`
- `401` — sem token
- `403` — role não é CANDIDATE
- `404 NOT_FOUND` — candidato sem perfil, vaga não existe, vaga inativa ou expirada
- `409 DUPLICATE_SWIPE` — candidato já deu swipe nessa vaga

---

### `GET /jobs/feed`

Lista vagas disponíveis para o candidato autenticado (ativas, não expiradas, ainda não swipadas). Paginação por cursor.

```http
GET /jobs/feed?limit=20&cursor=uuid-da-ultima-vaga
Authorization: Bearer <accessToken de CANDIDATE>
```

**Resposta 200:**
```json
{
  "data": [{ "id": "uuid", "title": "Dev Backend", "modality": "REMOTE", ... }],
  "nextCursor": "uuid-da-ultima-vaga-da-pagina"
}
```

`nextCursor` é `null` quando não há mais páginas.

**Erros:**
- `401` / `403` — mesmos do POST
- `404 NOT_FOUND` — candidato sem perfil

---

### `GET /jobs/:jobId/ranking`

Retorna o ranking de candidatos que swiparam na vaga. Apenas RECRUITER dono da vaga. Ordenado por `rank` (1-based), `fitScore: 0` na Fase 5 (substituído na Fase 6).

```http
GET /jobs/uuid-da-vaga/ranking
Authorization: Bearer <accessToken de RECRUITER>
```

**Resposta 200:**
```json
[
  {
    "candidateId": "uuid",
    "fitScore": 0,
    "rank": 1,
    "distanceKm": 12.4,
    "profile": {
      "name": "João Silva",
      "avatarUrl": "https://...",
      "bio": "Dev backend sênior",
      "skills": ["TypeScript", "Node.js"],
      "professionId": "backend-dev",
      "preferredModalities": ["REMOTE"],
      "salaryExpectation": 8000
    }
  },
  {
    "candidateId": "uuid-2",
    "fitScore": 0,
    "rank": 2,
    "distanceKm": null,
    "profile": null
  }
]
```

Candidatos DISLIKE têm `profile: null` — identidade censurada. `lat`/`lng` nunca aparecem na resposta.

**Erros:**
- `401` / `403` — sem token ou role não é RECRUITER
- `403 FORBIDDEN` — recruiter não é dono da vaga
- `404 NOT_FOUND` — recruiter sem perfil ou vaga não existe

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Dar swipe como candidato

```cmd
curl -s -X POST http://127.0.0.1:3000/swipes -H "Content-Type: application/json" -H "Authorization: Bearer <CANDIDATE_TOKEN>" -d "{\"jobId\":\"<JOB_ID>\",\"direction\":\"LIKE\"}"
```

Esperado: `201`.

### 2. Tentar swipe duplicado

```cmd
curl -s -o - -w "\nHTTP %{http_code}" -X POST http://127.0.0.1:3000/swipes -H "Content-Type: application/json" -H "Authorization: Bearer <CANDIDATE_TOKEN>" -d "{\"jobId\":\"<JOB_ID>\",\"direction\":\"DISLIKE\"}"
```

Esperado: `409 DUPLICATE_SWIPE`.

### 3. Ver feed de vagas

```cmd
curl -s "http://127.0.0.1:3000/jobs/feed?limit=10" -H "Authorization: Bearer <CANDIDATE_TOKEN>"
```

Esperado: `{ data: [...], nextCursor: "..." }`. A vaga já swipada não aparece.

### 4. Ver ranking como recruiter

```cmd
curl -s http://127.0.0.1:3000/jobs/<JOB_ID>/ranking -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

Esperado: array com candidatos. LIKE tem perfil completo, DISLIKE tem `profile: null`.

### 5. Testar ownership — outro recruiter tentando ver ranking

```cmd
curl -s -o - -w "\nHTTP %{http_code}" http://127.0.0.1:3000/jobs/<JOB_ID>/ranking -H "Authorization: Bearer <OUTRO_RECRUITER_TOKEN>"
```

Esperado: `403 FORBIDDEN`.

---

## Rodar os testes automatizados

```bash
# Unitários (sem Docker)
npx jest tests/unit/swipe.service.test.ts --no-coverage

# Integração (requer Docker)
npx jest tests/integration/swipe.test.ts --runInBand --no-coverage

# Todos de uma vez
npx jest --no-coverage
```

**Resultado esperado:** 16 unit tests + 16 integration tests = 32 total passando.
