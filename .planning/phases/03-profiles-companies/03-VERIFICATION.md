---
phase: 03-profiles-companies
verified: 2026-04-19T00:00:00Z
status: human_needed
score: 19/19
overrides_applied: 0
human_verification:
  - test: "Iniciar Docker Desktop, executar `docker compose up -d`, depois rodar `npm run test:integration`"
    expected: "35 testes de integração passam (8 candidate + 10 company + 8 recruiter + 9 admin)"
    why_human: "Docker Desktop não está rodando — banco de dados de teste em localhost:5433 inacessível. Bloqueio pré-existente desde a Phase 1. Os testes existem, a implementação está correta, mas a execução requer ambiente Docker."
  - test: "Smoke test manual: iniciar `npm run dev`, registrar CANDIDATE via `POST /auth/register`, atualizar perfil via `PUT /candidates/me` com `salaryExpectation: 8000`"
    expected: "Resposta 200 com body contendo `salaryExpectation: 8000`"
    why_human: "Verificação comportamental end-to-end requer servidor rodando com banco de dados real"
---

# Phase 3: Profiles & Companies — Verification Report

**Phase Goal:** Candidates and recruiters have complete, editable profiles linked to companies; admins can manage users
**Verified:** 2026-04-19T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Candidate can PUT /candidates/me and have their profile created or updated atomically | VERIFIED | `candidate.routes.ts:29` chama `service.upsertProfile(request.user.id, body)` → `repo.upsertProfile` → `prisma.candidateProfile.upsert` |
| 2 | PUT /candidates/me with searchRadiusKm stores the value and returns it | VERIFIED | `CandidateProfileSchema` inclui `searchRadiusKm: z.number().int().positive().default(50)`; campo presente na interface `UpsertProfileData` do repositório |
| 3 | PUT /candidates/me with salaryExpectation stores the value (schema migration applied) | VERIFIED | `prisma/schema.prisma:76` contém `salaryExpectation Float?`; migration `20260419000000_add_candidate_salary_expectation/migration.sql` existe com `ADD COLUMN "salaryExpectation" DOUBLE PRECISION` |
| 4 | Non-CANDIDATE role receives 403 on PUT /candidates/me | VERIFIED | `candidate.routes.ts:26` usa `preHandler: [authenticate, requireRole('CANDIDATE')]` |
| 5 | Missing required field (name) receives 400 from Zod | VERIFIED | `CandidateProfileSchema` declara `name: z.string().min(1).max(100)`; `Zod.parse()` lança ZodError que o errorHandler converte em 400 |
| 6 | userId in profile always comes from request.user.id — never from body | VERIFIED | `candidate.routes.ts:29,37` — 2 ocorrências de `request.user.id`; nenhum `body.userId` presente |
| 7 | Admin can POST /companies and a company record is persisted | VERIFIED | `company.routes.ts:23-29` — POST `/` com `requireRole('ADMIN')` delega para `service.createCompany(body)` → `repo.create(data)` → `prisma.company.create` |
| 8 | POST /companies returns 403 for CANDIDATE and RECRUITER roles | VERIFIED | `company.routes.ts:24` usa `preHandler: [authenticate, requireRole('ADMIN')]` |
| 9 | Admin can GET /companies/:id and receive company data | VERIFIED | `company.routes.ts:32-37` — GET `/:id` com `preHandler: [authenticate]` retorna company via `service.getCompany(id)` |
| 10 | GET /companies/:id returns 404 for non-existent company id | VERIFIED | `company.service.ts:12-15` — `getCompany` lança `AppError('Company not found', 404, 'NOT_FOUND')` quando `findById` retorna null |
| 11 | PATCH /admin/companies/:id/credits with positive amount increments credit balance atomically | VERIFIED | `company.repository.ts:13-17` usa `prisma.company.update({ data: { credits: { increment: delta } } })` — operação atômica Prisma |
| 12 | Credits never go negative — service throws 400 INSUFFICIENT_CREDITS when delta would result in negative | VERIFIED | `company.service.ts:24-26` — guarda `company.credits + delta < 0` antes de chamar `repo.adjustCredits` |
| 13 | Zod rejects non-positive or non-integer amount in credit adjustment body | VERIFIED | `company.routes.ts:15-16` — `AdjustCreditsSchema = z.object({ amount: z.number().int().positive() })` |
| 14 | Recruiter can PUT /recruiters/me and have their profile created or linked to a valid company | VERIFIED | `recruiter.routes.ts:18-23` → `service.upsertProfile(request.user.id, body)` → `findCompanyById` → `repo.upsertProfile` |
| 15 | PUT /recruiters/me returns 404 when companyId points to a non-existent company | VERIFIED | `recruiter.service.ts:8-9` — lança `AppError('Company not found', 404, 'NOT_FOUND')` quando `findCompanyById` retorna null |
| 16 | PUT /recruiters/me returns 403 for CANDIDATE and ADMIN roles | VERIFIED | `recruiter.routes.ts:18` usa `preHandler: [authenticate, requireRole('RECRUITER')]` |
| 17 | Admin can GET /admin/users and receive paginated list without passwordHash or googleId fields | VERIFIED | `admin.service.ts:5-19` — `select` explícito inclui apenas `id, email, role, avatarUrl, createdAt`; campos `passwordHash` e `googleId` ausentes do select |
| 18 | Admin can GET /admin/users/:id and receive single user without sensitive fields | VERIFIED | `admin.service.ts:22-36` — mesmo `select` seguro; lança `AppError(404)` se não encontrado |
| 19 | All /admin/* routes return 403 for RECRUITER and CANDIDATE roles | VERIFIED | `admin.routes.ts:16,26,35` — 3 handlers com `preHandler: [authenticate, requireRole('ADMIN')]` |

**Score:** 19/19 truths verified

### Required Artifacts

| Artifact | Expected | Status | Detalhes |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | CandidateProfile com campo salaryExpectation Float? | VERIFIED | Linha 76: `salaryExpectation Float?` presente |
| `prisma/migrations/20260419000000_add_candidate_salary_expectation/migration.sql` | ALTER TABLE para adicionar salaryExpectation | VERIFIED | `ADD COLUMN "salaryExpectation" DOUBLE PRECISION` |
| `src/modules/candidate/candidate.repository.ts` | CandidateRepository com upsertProfile e findProfileByUserId | VERIFIED | Exporta `CandidateRepository`; ambos os métodos implementados com Prisma |
| `src/modules/candidate/candidate.service.ts` | CandidateService com upsertProfile e getProfile | VERIFIED | Exporta `CandidateService`; getProfile lança AppError 404 quando null |
| `src/modules/candidate/candidate.routes.ts` | candidateRoutes Fastify plugin | VERIFIED | Exporta `candidateRoutes`; PUT e GET /me com authenticate + requireRole |
| `src/modules/company/company.repository.ts` | CompanyRepository com create, findById, adjustCredits | VERIFIED | Exporta `CompanyRepository`; adjustCredits usa `{ increment: delta }` atômico |
| `src/modules/company/company.service.ts` | CompanyService com createCompany, getCompany, adjustCredits | VERIFIED | Exporta `CompanyService`; guarda de saldo negativo implementada |
| `src/modules/company/company.routes.ts` | companyRoutes Fastify plugin | VERIFIED | Exporta `companyRoutes`; 3 rotas com RBAC correto |
| `src/modules/recruiter/recruiter.repository.ts` | RecruiterRepository com upsertProfile, findProfileByUserId, findCompanyById | VERIFIED | Exporta `RecruiterRepository`; findCompanyById usa Prisma direto (sem import cross-module) |
| `src/modules/recruiter/recruiter.service.ts` | RecruiterService com upsertProfile | VERIFIED | Exporta `RecruiterService`; valida FK via findCompanyById antes do upsert |
| `src/modules/recruiter/recruiter.routes.ts` | recruiterRoutes Fastify plugin | VERIFIED | Exporta `recruiterRoutes`; PUT e GET /me com requireRole('RECRUITER') |
| `src/modules/admin/admin.service.ts` | AdminService com listUsers, getUserById, adjustCredits | VERIFIED | Exporta `AdminService`; select seguro sem passwordHash/googleId |
| `src/modules/admin/admin.routes.ts` | adminRoutes Fastify plugin | VERIFIED | Exporta `adminRoutes`; 3 rotas com requireRole('ADMIN') |
| `tests/unit/candidate.service.test.ts` | 4 unit tests para CandidateService | VERIFIED | Existe; 4 testes passando |
| `tests/unit/company.service.test.ts` | Unit tests para CompanyService | VERIFIED | Existe; 6 testes passando |
| `tests/unit/recruiter.service.test.ts` | Unit tests para RecruiterService | VERIFIED | Existe; 4 testes passando |
| `tests/integration/candidate.test.ts` | 8 integration tests para /candidates/me | VERIFIED | Existe; 8 blocos `it(` confirmados |
| `tests/integration/company.test.ts` | 10 integration tests para /companies | VERIFIED | Existe; 10 blocos `it(` confirmados |
| `tests/integration/recruiter.test.ts` | 8 integration tests para /recruiters/me | VERIFIED | Existe; 8 blocos `it(` confirmados |
| `tests/integration/admin.test.ts` | 9 integration tests para /admin/* | VERIFIED | Existe; 9 blocos `it(` confirmados |

### Key Link Verification

| From | To | Via | Status | Detalhes |
|------|----|-----|--------|---------|
| `candidate.routes.ts` | `candidate.service.ts` | `service.upsertProfile(request.user.id, body)` | WIRED | Linha 29: chamada com `request.user.id` — nunca do body |
| `candidate.service.ts` | `candidate.repository.ts` | `this.repo.upsertProfile(userId, data)` | WIRED | Linha 8: delegação direta |
| `candidate.repository.ts` | `prisma.candidateProfile` | `prisma.candidateProfile.upsert({ where: { userId } })` | WIRED | Linha 18-22: upsert com where/create/update |
| `company.routes.ts` | `company.service.ts` | `service.createCompany(body)` / `service.adjustCredits(id, amount)` | WIRED | Linhas 27, 47: chamadas corretas |
| `company.service.ts` | `company.repository.ts` | `this.repo.create(data)` / `this.repo.adjustCredits(companyId, delta)` | WIRED | Linhas 8, 27: delegações corretas |
| `company.repository.ts` | `prisma.company` | `prisma.company.update({ data: { credits: { increment: delta } } })` | WIRED | Linhas 13-17: incremento atômico confirmado |
| `recruiter.routes.ts` | `recruiter.service.ts` | `service.upsertProfile(request.user.id, body)` | WIRED | Linha 21: userId do JWT |
| `recruiter.service.ts` | `recruiter.repository.ts` | `this.repo.findCompanyById(data.companyId)` antes do upsert | WIRED | Linha 8: validação FK presente |
| `admin.routes.ts` | `admin.service.ts` | `service.listUsers(page, limit)` | WIRED | Linha 21: chamada com paginação |
| `src/app.ts` | todos os módulos de rota | registros com prefix correto | WIRED | 6 registros: health, auth, candidates, companies, recruiters, admin |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `candidate.routes.ts` | `profile` | `service.upsertProfile` → `prisma.candidateProfile.upsert` | Sim — query Prisma real com upsert | FLOWING |
| `company.routes.ts` | `company` | `service.createCompany` → `prisma.company.create` | Sim — insert Prisma real | FLOWING |
| `admin.routes.ts` | `users` | `service.listUsers` → `prisma.user.findMany` com select explícito | Sim — query Prisma real com paginação | FLOWING |
| `recruiter.routes.ts` | `profile` | `service.upsertProfile` → `prisma.recruiterProfile.upsert` | Sim — query Prisma real com validação FK | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED para testes de integração — servidor requer Docker com banco de dados. Unit tests cobertas abaixo.

| Behavior | Verificação | Resultado | Status |
|----------|-------------|-----------|--------|
| 30 unit tests passam | `npx jest tests/unit --runInBand` | "30 passed, 30 total" | PASS |
| TypeScript compila sem erros | `npm run build` (tsc) | Saída limpa, exit 0 | PASS |
| Migration SQL existe | `ls prisma/migrations/` | `20260419000000_add_candidate_salary_expectation` presente | PASS |
| Sem imports cross-module | grep cross-module imports | 0 matches | PASS |
| Sem try/catch nas routes | grep try em routes | 0 matches | PASS |
| passwordHash/googleId excluídos do select | grep em admin.service.ts | Apenas em comentários, não em select | PASS |
| request.user.id em candidate e recruiter routes | grep | 4 matches (2 por módulo) | PASS |
| `{ increment: delta }` atômico no company.repository.ts | grep increment | 1 match | PASS |

### Requirements Coverage

| Requirement | Plano de Origem | Descrição | Status | Evidência |
|-------------|----------------|-----------|--------|----------|
| CAND-01 | 03-01 | Candidato pode criar e editar perfil com nome, bio, localização, profissão, skills, modalidades e pretensão salarial | SATISFIED | `PUT /candidates/me` com Zod schema incluindo todos os campos; salaryExpectation na migration |
| CAND-02 | 03-01 | Candidato pode definir raio de busca em km para vagas | SATISFIED | `searchRadiusKm` no schema Zod e no `UpsertProfileData`; armazenado via upsert |
| COMP-01 | 03-03 | Recrutador pode criar e editar perfil vinculado a uma empresa | SATISFIED | `PUT /recruiters/me` com validação FK de companyId; upsert idempotente |
| COMP-02 | 03-02 | Admin pode criar empresas na plataforma | SATISFIED | `POST /companies` com `requireRole('ADMIN')`; retorna 403 para outras roles |
| COMP-03 | 03-02 | Empresa tem saldo de créditos gerenciado via admin | SATISFIED | `PATCH /companies/admin/:id/credits` com incremento atômico; guarda de saldo negativo |
| ADMIN-01 | 03-03 | Admin pode listar e gerenciar usuários | SATISFIED | `GET /admin/users` paginado; `GET /admin/users/:id`; sem campos sensíveis |
| ADMIN-02 | 03-03 | Admin pode adicionar créditos a empresas | SATISFIED | `PATCH /admin/companies/:id/credits` em adminRoutes; incremento atômico |
| ADMIN-03 | 03-03 | Rotas admin protegidas por role ADMIN | SATISFIED | requireRole('ADMIN') nos 3 handlers de admin.routes.ts |

### Anti-Patterns Found

Nenhum anti-pattern bloqueador encontrado.

| Arquivo | Linha | Pattern | Severidade | Impacto |
|---------|-------|---------|------------|---------|
| `admin.service.ts` | 15,16,31,32 | Comentários `// passwordHash: NOT included` (não são código ativo) | Info | Documentação intencional — não é stub |

### Human Verification Required

#### 1. Testes de Integração (Docker necessário)

**Teste:** Iniciar Docker Desktop, executar `docker compose up -d`, depois rodar `npm run test:integration`
**Esperado:** 35 testes de integração passam — 8 candidate, 10 company, 8 recruiter, 9 admin
**Por que human:** Docker Desktop não está rodando neste ambiente. O banco de dados de teste em `localhost:5433` está inacessível. Bloqueio pré-existente desde a Phase 1. Todos os arquivos de teste existem e a implementação está estruturalmente correta conforme verificado pelos unit tests (30/30) e pela compilação TypeScript limpa.

#### 2. Smoke Test End-to-End

**Teste:** Iniciar `npm run dev`, registrar CANDIDATE via `POST /auth/register`, fazer `PUT /candidates/me` com `{ name, professionId, skills, preferredModalities, salaryExpectation: 8000, searchRadiusKm: 30 }` com Bearer token
**Esperado:** Resposta 200 com body contendo `salaryExpectation: 8000` e `searchRadiusKm: 30`
**Por que human:** Requer servidor rodando com banco de dados real; comportamento visual e end-to-end não verificável programaticamente sem Docker

### Gaps Summary

Nenhum gap encontrado. Todos os 19 must-haves verificados. Todos os 8 requirement IDs satisfeitos com evidência direta no código.

O único item pendente é a execução dos testes de integração, que requer Docker Desktop. Este é um bloqueio de ambiente pré-existente desde a Phase 1, não uma falha de implementação.

---

_Verified: 2026-04-19T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
