---
phase: 04-jobs
verified: 2026-04-21T00:00:00Z
status: gaps_found
score: 10/13 must-haves verified
overrides_applied: 0
gaps:
  - truth: "GET /jobs/:id returns 200 with job and rankings: [] placeholder (accessible to any authenticated user)"
    status: failed
    reason: "GET /:id tem preHandler: [authenticate, requireRole('RECRUITER')] na linha 63 de job.routes.ts. O plano 04-03 exige que este endpoint use apenas authenticate (sem requireRole) para que CANDIDATE possa acessar detalhes da vaga no fluxo de swipe (Fase 5). A rota está bloqueada para CANDIDATE."
    artifacts:
      - path: "src/modules/job/job.routes.ts"
        issue: "Linha 63: preHandler aplica requireRole('RECRUITER') em GET /:id — deve ser apenas [authenticate]"
    missing:
      - "Remover requireRole('RECRUITER') do preHandler de GET /jobs/:id — manter apenas authenticate"
      - "Adicionar teste de integração em job-routes.test.ts verificando que CANDIDATE obtém 200 em GET /jobs/:id"

  - truth: "RankingItem interface exported from job.routes.ts as Phase 6 extension point"
    status: failed
    reason: "A interface RankingItem não existe em job.routes.ts. O plano 04-03 exige 'export interface RankingItem { candidateId, fitScore, profile }' para que a Fase 6 importe e estenda o contrato. Nenhuma declaração da interface foi criada no arquivo."
    artifacts:
      - path: "src/modules/job/job.routes.ts"
        issue: "Interface RankingItem ausente — grep retorna 0 matches para 'RankingItem'"
    missing:
      - "Declarar e exportar interface RankingItem em src/modules/job/job.routes.ts"
      - "Tipar o campo rankings no retorno de GET /:id como RankingItem[]"

  - truth: "POST /jobs returns 403 when CANDIDATE or ADMIN calls the endpoint"
    status: failed
    reason: "O teste existente cobre apenas CANDIDATE retornando 403. Não há teste cobrindo ADMIN. Gap menor — a implementação bloqueia ADMIN via requireRole('RECRUITER') mas não há teste de regressão para esse caso."
    artifacts:
      - path: "tests/integration/job-routes.test.ts"
        issue: "Teste de 403 para role ADMIN ausente — apenas CANDIDATE é coberto"
    missing:
      - "Adicionar teste verificando que ADMIN recebe 403 em POST /jobs (ou aceitar que CANDIDATE cobre o requisito por proxy)"
---

# Phase 4: Jobs — Verification Report

**Phase Goal:** Recruiters can manage the full lifecycle of job postings; expired jobs deactivate automatically
**Verified:** 2026-04-21
**Status:** gaps_found
**Re-verification:** No — verificação inicial

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Recruiter can create a job and the job is persisted with their recruiterId | VERIFIED | job.service.ts linha 10: derive do profile.id; integration test confirma job.recruiterId === profile.id |
| 2 | Recruiter can edit only their own job — editing another recruiter's job returns 403 | VERIFIED | job.service.ts linha 18: `job.recruiterId !== profile.id` lança 403; coberto por unit e integration tests |
| 3 | Recruiter can deactivate only their own job — deactivating another recruiter's job returns 403 | VERIFIED | deactivateJob delega para updateJob que tem o ownership guard; coberto por tests |
| 4 | Job creation fails with 400 when required fields are missing (Zod rejects) | VERIFIED | CreateJobSchema em job.routes.ts; testes de 400 para title ausente e requiredSkills vazio presentes |
| 5 | Listing jobs for a recruiter returns only their own jobs | VERIFIED | findByRecruiterId filtra por recruiterId; teste de integração confirma 2 de 3 jobs |
| 6 | POST /jobs returns 201 with the created job when RECRUITER sends valid body | VERIFIED | Rota POST / com preHandler RECRUITER; teste de 201 presente |
| 7 | POST /jobs returns 401 when no Authorization header is provided | VERIFIED | authenticate hook bloqueia sem token; teste de 401 presente |
| 8 | POST /jobs returns 403 when CANDIDATE or ADMIN calls the endpoint | PARTIAL | 403 para CANDIDATE coberto; ADMIN não coberto por teste |
| 9 | PATCH /jobs/:id returns 200 with updated job when recruiter owns it | VERIFIED | Rota PATCH /:id com service.updateJob; teste de 200 presente |
| 10 | PATCH /jobs/:id returns 403 when recruiter does not own the job (IDOR guard) | VERIFIED | Ownership guard no service; teste de 403 com recruiter2 presente |
| 11 | DELETE /jobs/:id/deactivate returns 200 with isActive=false when recruiter owns it | VERIFIED | Rota DELETE /:id/deactivate; teste confirma isActive: false |
| 12 | GET /jobs/:id returns 200 with job and rankings: [] placeholder (accessible to any authenticated user) | FAILED | Linha 63 de job.routes.ts: `requireRole('RECRUITER')` no preHandler de GET /:id — CANDIDATE recebe 403, não 200 |
| 13 | GET /jobs/mine returns 200 with array of recruiter's own jobs | VERIFIED | Rota GET /mine com requireRole RECRUITER; testes de 200 e array vazio presentes |

**Score:** 10/13 truths verified (1 failed, 1 partial, 1 partial-test-gap)

---

### Deferred Items

Nenhum item adiado — todos os gaps são desta fase.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/modules/job/job.repository.ts` | Prisma-backed CRUD para Job model | VERIFIED | Exporta JobRepository com create, findJobById, update, findByRecruiterId, findRecruiterProfileByUserId, deactivateExpiredJobs |
| `src/modules/job/job.service.ts` | Business logic: ownership guard, create/update/deactivate | VERIFIED | Exporta JobService com constructor injection; ownership guard em updateJob e deactivateJob |
| `src/modules/job/job.scheduler.ts` | runExpiryCheck delegando para repo.deactivateExpiredJobs() | VERIFIED | Função pura exportada, 3 linhas, sem dependência de DB |
| `src/shared/plugins/scheduler.ts` | Fastify plugin com node-cron | VERIFIED | Plugin wrappado com fp(); cron '* * * * *'; task.start() e onClose task.stop() |
| `src/modules/job/job.routes.ts` | Fastify route plugin para prefixo /jobs | PARTIAL | Existe com 5 rotas e Zod validation, mas GET /:id com requireRole indevido; RankingItem ausente |
| `src/app.ts` | jobRoutes registrado em /jobs; schedulerPlugin com guarda testing | VERIFIED | Linha 40: register(jobRoutes, { prefix: '/jobs' }); linhas 43-45: !opts.testing guarda scheduler |
| `tests/unit/job.service.test.ts` | Unit tests cobrindo ownership guard e service logic | VERIFIED | 13 testes, sem DB, cobre todos os cenários do plano |
| `tests/unit/job.scheduler.test.ts` | Unit tests para runExpiryCheck | VERIFIED | 3 testes cobrindo chamada única, retorno de count, retorno 0 |
| `tests/integration/job.test.ts` | Integration tests service+repository contra DB real | VERIFIED | 9 testes sem mocks, cobre IDOR, ownership, expiry |
| `tests/integration/job-routes.test.ts` | HTTP integration tests para todas as rotas | PARTIAL | 14 testes presentes; ausente: teste de CANDIDATE em GET /:id (que agora falha por causa do requireRole) |
| `prisma/migrations/20260421195856_add_recruiter_to_job/migration.sql` | Migration com ALTER TABLE para recruiterId | VERIFIED | migration.sql existe com ALTER TABLE "Job" ADD COLUMN "recruiterId" |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| job.service.ts | job.repository.ts | constructor injection | WIRED | Linha 3: `constructor(private readonly repo: JobRepository)` |
| job.service.ts | ownership check | compara job.recruiterId !== profile.id | WIRED | Linha 18: `if (job.recruiterId !== profile.id)` |
| scheduler.ts plugin | job.scheduler.ts | import { runExpiryCheck } | WIRED | Linha 5 de scheduler.ts: importa runExpiryCheck |
| app.ts | scheduler.ts | app.register(schedulerPlugin) | WIRED | Linha 44: guarda `if (!opts.testing)` |
| app.ts | job.routes.ts | app.register(jobRoutes, { prefix: '/jobs' }) | WIRED | Linha 40 de app.ts |
| job.routes.ts | job.service.ts | new JobService(new JobRepository()) | WIRED | Linhas 38-39 de job.routes.ts |
| GET /jobs/:id | authenticate only (sem requireRole) | preHandler com apenas authenticate | NOT_WIRED | Linha 63: preHandler tem requireRole('RECRUITER') — deve ter apenas authenticate |
| RankingItem interface | Phase 6 extension point | export interface RankingItem | NOT_WIRED | Interface ausente no arquivo |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| job.routes.ts GET /:id | job | service.getJobById(id) → repo.findJobById → prisma.job.findUnique | Sim — query real ao DB | FLOWING |
| job.routes.ts GET /mine | jobs | service.listJobsByRecruiter → repo.findByRecruiterId → prisma.job.findMany | Sim | FLOWING |
| job.routes.ts GET /:id rankings | rankings: [] | hardcoded placeholder | Vazio intencional — Phase 6 | STATIC (intencional) |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — testes requerem DB Docker rodando. Verificação via código e test files é suficiente para os checks estáticos.

---

### Requirements Coverage

| Requirement | Source Plan | Descrição | Status | Evidência |
|-------------|------------|-----------|--------|-----------|
| JOB-01 | 04-01, 04-03 | Recrutador pode criar vaga com todos os campos | SATISFIED | POST /jobs com Zod CreateJobSchema; service.createJob; integration test 201 |
| JOB-02 | 04-01, 04-03 | Recrutador pode editar e desativar vagas | SATISFIED | PATCH /jobs/:id e DELETE /jobs/:id/deactivate com ownership guard; testes 200/403 |
| JOB-03 | 04-02 | Vagas expiradas são desativadas automaticamente (scheduler) | SATISFIED | job.scheduler.ts + scheduler.ts plugin registrado em app.ts com cron '* * * * *' |
| JOB-04 | 04-03 | Recrutador vê página da vaga com ranking de candidatos por % de fit | PARTIAL | GET /jobs/:id retorna rankings: [] como placeholder — implementação bloqueada para CANDIDATE por requireRole incorreto; RankingItem interface ausente |

---

### Anti-Patterns Found

| File | Linha | Pattern | Severidade | Impacto |
|------|-------|---------|-----------|---------|
| src/modules/job/job.routes.ts | 63 | requireRole('RECRUITER') em GET /:id — indevido per spec | Blocker | CANDIDATE não consegue acessar detalhes de vaga; quebra fluxo de swipe da Fase 5 |
| src/modules/job/job.routes.ts | - | RankingItem interface ausente | Blocker | Phase 6 não tem contrato para importar; objetivo do placeholder não atendido completamente |
| src/modules/job/job.repository.ts | 5 | CreateJobData contém companyId (plano previa ausência) | Warning | Não é exploitável — service usa Omit<CreateJobData, 'companyId'> — mas diverge da spec do plano |

---

### Human Verification Required

Nenhum item requer verificação humana para os gaps identificados — todos são verificáveis programaticamente via grep e análise de código.

---

### Gaps Summary

**2 gaps críticos bloqueiam o goal da fase:**

**Gap 1 — GET /jobs/:id bloqueado para CANDIDATE**

O plano 04-03 especifica explicitamente que GET /jobs/:id deve usar apenas `authenticate` (sem `requireRole`) para que o fluxo de swipe da Fase 5 funcione. O arquivo `src/modules/job/job.routes.ts` linha 63 aplica `requireRole('RECRUITER')` em todas as 5 rotas, incluindo GET /:id. Isso viola o requisito JOB-04 e quebra a dependência declarada pela Fase 5. O SUMMARY do plano 04-03 contém uma contradição interna: a tabela lista GET /:id com "Auth: RECRUITER" mas o texto do objetivo diz "GET /:id open to any authenticated user". O código implementado seguiu a tabela incorreta.

**Gap 2 — RankingItem interface ausente**

O plano 04-03 exige `export interface RankingItem` em job.routes.ts como ponto de extensão para a Fase 6. A interface não foi criada — `grep 'RankingItem' src/modules/job/job.routes.ts` retorna 0 matches. O campo `rankings: []` existe no handler mas está tipado implicitamente como `never[]`, não como `RankingItem[]`.

**Gap 3 — Teste ADMIN ausente em POST /jobs (menor)**

O truth "POST /jobs returns 403 when CANDIDATE or ADMIN calls the endpoint" não é totalmente coberto — apenas o caso CANDIDATE tem teste. O caso ADMIN não tem teste dedicado.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
