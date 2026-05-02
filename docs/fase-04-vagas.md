# Fase 04 — Vagas (Jobs)

## O que foi construído

Módulo completo de gerenciamento de vagas em quatro planos: camada de dados com Prisma + ownership guard; scheduler de expiração automática via node-cron; rotas HTTP com Zod e IDOR prevention; e fechamento de gaps de controle de acesso para permitir que candidatos leiam vagas (necessário para o swipe da Fase 5).

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `prisma/schema.prisma` | Campos `recruiterId String` e relação `recruiter RecruiterProfile` adicionados ao model `Job`; back-relation `jobs Job[]` adicionada ao `RecruiterProfile` |
| `prisma/migrations/20260421195856_add_recruiter_to_job/` | Migração que aplica a FK de recruiter à tabela Job |
| `src/modules/job/job.repository.ts` | `create`, `findJobById`, `update`, `findByRecruiterId`, `findRecruiterProfileByUserId`, `deactivateExpiredJobs` via Prisma |
| `src/modules/job/job.service.ts` | Regras de negócio: resolução de perfil pelo JWT, ownership guard em update/deactivate, 404 e 403 apropriados |
| `src/modules/job/job.scheduler.ts` | `runExpiryCheck(repo)` — função pura que delega a `deactivateExpiredJobs`, retorna contagem de vagas desativadas |
| `src/shared/plugins/scheduler.ts` | Fastify plugin: cron `'* * * * *'`, instancia `JobRepository`, chama `runExpiryCheck`, hook `onClose` para cleanup |
| `src/modules/job/job.routes.ts` | Plugin Fastify com 5 rotas em `/jobs`, Zod schemas, `RankingItem` interface exportada como contrato para a Fase 6 |
| `src/app.ts` | Wiring: `schedulerPlugin` (guarded por `!opts.testing`) e `jobRoutes` registrados |
| `tests/unit/job.service.test.ts` | 13 testes unitários (sem DB) |
| `tests/unit/job.scheduler.test.ts` | 3 testes unitários do scheduler (sem DB) |
| `tests/integration/job.test.ts` | 9 testes de integração na camada service (DB real) |
| `tests/integration/job-routes.test.ts` | 16 testes de integração HTTP (DB real) |
| `tests/helpers/factories.ts` | `createJob(companyId, recruiterId, overrides?)` atualizado com `recruiterId` obrigatório |

---

## Por que foi feito assim

### `companyId` derivado do perfil, nunca do body

`JobService.createJob` recebe apenas o `userId` do JWT e busca o `RecruiterProfile` para obter tanto o `profileId` quanto o `companyId`. O body da requisição não aceita `companyId` nem `recruiterId`.

Se o body pudesse definir esses campos, um recruiter poderia criar uma vaga em nome de outra empresa simplesmente mandando o ID dela no payload — IDOR direto. A extração no serviço garante que a vaga sempre pertença à empresa do recruiter autenticado.

### `deactivateJob` delega para `updateJob`

Em vez de reescrever a verificação de ownership em `deactivateJob`, ele simplesmente chama `this.updateJob(userId, jobId, { isActive: false })`. O guard de 403 fica em um só lugar: em `updateJob`. Se o guard precisar mudar, muda em um único ponto.

### `JobRepository` faz lookup de `RecruiterProfile` diretamente

`findRecruiterProfileByUserId(userId)` existe dentro do `JobRepository` como chamada Prisma direta, sem importar o `RecruiterRepository`. Importar o repositório de outro módulo violaria a regra de isolamento da arquitetura. A query é trivial (`prisma.recruiterProfile.findUnique({ where: { userId } })`) e não justifica o acoplamento.

### Registro de rotas: `/mine` antes de `/:id`

O Fastify tenta casar rotas na ordem de registro. Se `GET /jobs/:id` fosse registrado primeiro, a requisição `GET /jobs/mine` seria capturada com `params.id = 'mine'`, que falha na validação UUID do Zod. Registrar `/mine` primeiro garante o match correto antes do parâmetro dinâmico.

### Scheduler isolado de testes com `!opts.testing`

O `schedulerPlugin` só é registrado quando `opts.testing !== true`. Sem essa guarda, o node-cron abre um handle de timer que impede o Jest de encerrar o processo — o Jest reporta "open handles" e pode travar. A flag `testing` é passada por `buildApp` nos testes de integração.

### `GET /jobs/:id` abre acesso para qualquer usuário autenticado

A rota usa `preHandler: [authenticate]` sem `requireRole`. A Fase 5 (swipe) exige que candidatos leiam detalhes de uma vaga antes de deslizar. Se o endpoint fosse restrito a RECRUITER, o swipe do candidato quebraria. O acesso ao detalhe da vaga (título, descrição, skills) não expõe informação sensível que justifique o bloqueio.

### `RankingItem` exportada como contrato da Fase 6

A interface `RankingItem { candidateId, fitScore, profile }` é exportada de `job.routes.ts` para fixar o contrato da resposta do ranking de candidatos antes da implementação do motor Neo4j. O campo `rankings: [] as RankingItem[]` no GET /:id é um placeholder intencional — a Fase 6 preenche com dados reais.

---

## Endpoints

### `POST /jobs`

Cria uma nova vaga. Apenas RECRUITER. O `companyId` é derivado do perfil do recruiter autenticado — não é aceito no body.

```http
POST /jobs
Authorization: Bearer <accessToken de RECRUITER>
Content-Type: application/json

{
  "title": "Desenvolvedor Backend Sênior",
  "description": "Responsável por APIs REST em Node.js...",
  "professionId": "uuid-da-profissao",
  "modality": "REMOTE",
  "requiredSkills": ["TypeScript", "Node.js", "PostgreSQL"],
  "expiresAt": "2026-06-01T00:00:00.000Z",
  "salaryMin": 10000,
  "salaryMax": 15000,
  "lat": -23.5505,
  "lng": -46.6333
}
```

**Resposta 201:** vaga criada com `recruiterId`, `companyId` e `isActive: true`.

**Erros:**
- `400` — campo obrigatório faltando, `requiredSkills` vazio, `expiresAt` não é ISO8601
- `401` — sem token ou token inválido
- `403` — usuário não é RECRUITER
- `404 NOT_FOUND` — recruiter não possui perfil vinculado a uma empresa

---

### `GET /jobs/mine`

Lista todas as vagas do recruiter autenticado, ordenadas por `createdAt DESC`.

```http
GET /jobs/mine
Authorization: Bearer <accessToken de RECRUITER>
```

**Resposta 200:** array de vagas do recruiter. Escopo estrito — não retorna vagas de outros recrutadores.

**Erros:**
- `401` / `403` — mesmos do POST
- `404 NOT_FOUND` — recruiter não possui perfil

---

### `GET /jobs/:id`

Retorna os detalhes de uma vaga. Qualquer usuário autenticado (CANDIDATE, RECRUITER ou ADMIN). Campo `rankings: []` é placeholder — será populado pela Fase 6.

```http
GET /jobs/uuid-da-vaga
Authorization: Bearer <accessToken>
```

**Resposta 200:**
```json
{
  "id": "uuid-da-vaga",
  "title": "Desenvolvedor Backend Sênior",
  "description": "...",
  "modality": "REMOTE",
  "requiredSkills": ["TypeScript", "Node.js"],
  "isActive": true,
  "expiresAt": "2026-06-01T00:00:00.000Z",
  "rankings": []
}
```

**Erros:**
- `400` — `id` não é UUID válido
- `401` — sem token
- `404 NOT_FOUND` — vaga não existe

---

### `PATCH /jobs/:id`

Atualiza campos de uma vaga. Apenas o recruiter dono da vaga. Todos os campos são opcionais.

```http
PATCH /jobs/uuid-da-vaga
Authorization: Bearer <accessToken de RECRUITER>
Content-Type: application/json

{
  "title": "Desenvolvedor Backend Pleno",
  "salaryMax": 12000
}
```

**Resposta 200:** vaga com campos atualizados.

**Erros:**
- `400` — tipo inválido em qualquer campo
- `403 FORBIDDEN` — recruiter não é dono da vaga
- `404 NOT_FOUND` — vaga não existe ou recruiter sem perfil

---

### `DELETE /jobs/:id/deactivate`

Desativa uma vaga (soft delete — `isActive: false`). Apenas o recruiter dono da vaga.

```http
DELETE /jobs/uuid-da-vaga/deactivate
Authorization: Bearer <accessToken de RECRUITER>
```

**Resposta 200:** vaga com `isActive: false`.

**Erros:**
- `403 FORBIDDEN` — recruiter não é dono da vaga
- `404 NOT_FOUND` — vaga não existe

---

### Scheduler de expiração (interno)

O `schedulerPlugin` executa `deactivateExpiredJobs()` a cada minuto. Vagas com `isActive = true` e `expiresAt < NOW()` são marcadas como inativas em um único `updateMany`. Nenhum endpoint expõe esse comportamento — é totalmente interno. Falhas na execução são logadas via `app.log.error` sem derrubar o loop.

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Logar como recruiter com perfil vinculado a uma empresa

Se ainda não existir, crie um ADMIN, uma empresa e um recruiter (ver Fase 03):

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"recruiter@test.com\",\"password\":\"Test1234!\"}"
```

### 2. Criar uma vaga

```cmd
curl -s -X POST http://127.0.0.1:3000/jobs -H "Content-Type: application/json" -H "Authorization: Bearer <RECRUITER_TOKEN>" -d "{\"title\":\"Dev Backend Sr\",\"description\":\"APIs em Node.js\",\"professionId\":\"uuid\",\"modality\":\"REMOTE\",\"requiredSkills\":[\"TypeScript\"],\"expiresAt\":\"2026-12-31T00:00:00.000Z\"}"
```

Esperado: `201` com a vaga criada e `isActive: true`.

### 3. Listar vagas do recruiter

```cmd
curl -s http://127.0.0.1:3000/jobs/mine -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

### 4. Buscar detalhe de uma vaga como candidato

```cmd
curl -s http://127.0.0.1:3000/jobs/<JOB_ID> -H "Authorization: Bearer <CANDIDATE_TOKEN>"
```

Esperado: `200` com `rankings: []`.

### 5. Atualizar vaga

```cmd
curl -s -X PATCH http://127.0.0.1:3000/jobs/<JOB_ID> -H "Content-Type: application/json" -H "Authorization: Bearer <RECRUITER_TOKEN>" -d "{\"title\":\"Dev Backend Pleno\"}"
```

### 6. Testar IDOR — outro recruiter tentando atualizar

```cmd
curl -s -o - -w "\nHTTP %{http_code}" -X PATCH http://127.0.0.1:3000/jobs/<JOB_ID> -H "Content-Type: application/json" -H "Authorization: Bearer <OUTRO_RECRUITER_TOKEN>" -d "{\"title\":\"Invasao\"}"
```

Esperado: `403 FORBIDDEN`.

### 7. Desativar vaga

```cmd
curl -s -o - -w "\nHTTP %{http_code}" -X DELETE http://127.0.0.1:3000/jobs/<JOB_ID>/deactivate -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

Esperado: `200` com `isActive: false`.

---

## Rodar os testes automatizados

```bash
# Unitários (sem Docker)
npx jest tests/unit/job.service.test.ts --no-coverage
npx jest tests/unit/job.scheduler.test.ts --no-coverage

# Integração por arquivo (requer Docker + DB)
npx jest tests/integration/job.test.ts --runInBand
npx jest tests/integration/job-routes.test.ts --runInBand

# Todos de uma vez
npm run test:unit
npm run test:integration
```

**Resultado esperado:** 16 unit tests + 25 integration tests = 41 total passando.
