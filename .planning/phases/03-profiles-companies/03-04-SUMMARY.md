---
phase: 03-profiles-companies
plan: "04"
subsystem: company
tags: [gap-closure, clean-architecture, refactor, prisma, repository-pattern]
dependency_graph:
  requires: [03-01, 03-02, 03-03]
  provides: [ARCH-01-company, COMP-02-credits-atomic]
  affects: [company.service, company.repository]
tech_stack:
  added: []
  patterns: [repository-pattern, prisma-transaction, clean-architecture]
key_files:
  modified:
    - src/modules/company/company.service.ts
    - src/modules/company/company.repository.ts
decisions:
  - "CompanyService.adjustCredits não aceita mais parâmetro reason — fixado como admin_grant no repositório"
  - "$transaction atômico (company.update + creditTransaction.create) pertence ao repositório, não ao service"
metrics:
  duration: ~5min
  completed_date: "2026-05-04T21:59:08Z"
  tasks_completed: 3
  files_modified: 2
---

# Phase 03 Plan 04: Gap Closure — CompanyService Clean Architecture Summary

**One-liner:** Violação de Clean Architecture corrigida movendo prisma.$transaction de CompanyService para CompanyRepository.adjustCredits, com 6 testes unitários verdes.

## What Was Built

`CompanyService.adjustCredits` importava `prisma` diretamente e executava `$transaction` com queries raw (`tx.company.findUnique`, `tx.company.update`, `tx.creditTransaction.create`). Isso violava Clean Architecture (service com acesso direto à infraestrutura de banco) e causava 2 falhas nos testes unitários — o repo mockado nunca era chamado.

**Fix aplicado:**

1. **CompanyService** — removido import de prisma; `adjustCredits` agora delega inteiramente para `this.repo.findById` (verificação de existência + leitura de saldo) e `this.repo.adjustCredits` (persistência atômica).

2. **CompanyRepository** — `adjustCredits` agora executa `prisma.$transaction` com `tx.company.update` (incremento de créditos) + `tx.creditTransaction.create` (log auditável), com `reason: 'admin_grant'` fixo.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refatorar CompanyService.adjustCredits para usar repositório | 99787f1 | src/modules/company/company.service.ts |
| 2 | Mover $transaction para CompanyRepository.adjustCredits | 46ff293 | src/modules/company/company.repository.ts |
| 3 | Verificar suite completa (107 testes, 12 suites, zero regressões) | — | — |

## Verification Results

```
npx jest tests/unit/company.service.test.ts --no-coverage
  Tests: 6 passed (era 4 — 2 de adjustCredits agora verdes)

npx jest tests/unit/ --no-coverage
  Test Suites: 12 passed
  Tests:       107 passed
  Zero regressões
```

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None.

## Threat Flags

None — nenhuma nova superfície de rede, auth ou schema introduzida.

## Self-Check: PASSED

- [x] src/modules/company/company.service.ts modificado e sem import de prisma
- [x] src/modules/company/company.repository.ts com prisma.$transaction em adjustCredits
- [x] Commits 99787f1 e 46ff293 existem no histórico
- [x] 107 testes unitários passando sem regressões
