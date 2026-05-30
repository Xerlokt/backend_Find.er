# Fase 11 — Core Modules Migration (v2.0)

## O que foi construído

Migração dos módulos Candidate, Recruiter, Company e Job para Clean Architecture (use cases + adapters). Scheduler de expiração de vagas desacoplado de `modules/job/`.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/application/use-cases/candidate/` | UpsertCandidateProfileUseCase, GetCandidateProfileUseCase |
| `src/application/use-cases/recruiter/` | UpsertRecruiterProfileUseCase, GetRecruiterProfileUseCase |
| `src/application/use-cases/company/` | CreateCompanyUseCase, GetCompanyUseCase, AdjustCompanyCreditsUseCase |
| `src/application/use-cases/job/` | CreateJobUseCase, UpdateJobUseCase, DeactivateJobUseCase, GetJobByIdUseCase, ListJobsByRecruiterUseCase |
| `src/adapters/repositories/candidate.repository.ts` | `CandidateRepository.toDomain()` com mapeamento explícito de campo |
| `src/adapters/repositories/recruiter.repository.ts` | `findCompanyById()` acessa `prisma.company` diretamente (ARCH-04) |
| `src/adapters/repositories/company.repository.ts` | `getTransactions()` retorna rows do Prisma diretamente |
| `src/adapters/repositories/job.repository.ts` | `findRecruiterProfileByUserId` sem importar RecruiterRepository |
| `src/infrastructure/http/routes/job.routes.ts` | `/mine` registrada antes de `/:id` |
| `src/infrastructure/scheduler/job-expiry.scheduler.ts` | Recebe `IJobRepository` — desacoplado do adapter concreto |

---

## Por que foi feito assim

### `toDomain()` com mapeamento explícito

`CandidateRepository.toDomain()` mapeia cada campo de forma explícita (sem spread). Isso permite o cast seguro do enum Prisma `Modality` para o union type do domínio — `spread` ignoraria a tipagem.

### ARCH-04: módulos não importam outros módulos

`RecruiterRepository.findCompanyById()` acessa `prisma.company` diretamente em vez de importar `CompanyRepository`. Comentário no código marca a fronteira de módulo. Repositórios podem cruzar modelos Prisma; módulos nunca importam outros módulos.

### `/mine` antes de `/:id`

Fastify avalia rotas na ordem de registro. Se `/:id` for registrada primeiro, a string `'mine'` é tratada como UUID e falha na validação Zod. A rota estática `/mine` deve ser registrada antes de qualquer parâmetro dinâmico.

### Migração aditiva — arquivos antigos mantidos

`src/modules/candidate/`, `src/modules/job/` etc. foram mantidos durante a fase 11. Deletar enquanto outras fases ainda estão migrando quebraria os testes. Cleanup foi feito na Fase 13.

---

## Rodar os testes

```bash
npm run test:integration  # tests/integration/candidate.test.ts, company.test.ts, job.test.ts
npm run test:unit         # tests/unit/create-job.use-case.test.ts
```
