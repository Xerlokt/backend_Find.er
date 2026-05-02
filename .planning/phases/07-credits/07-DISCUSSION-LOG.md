# Phase 7: Credits - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 07-credits
**Areas discussed:** Rastreio do unlock, Custo em créditos por unlock

---

## Rastreio do unlock

| Option | Description | Selected |
|--------|-------------|----------|
| Nova tabela Unlock | Model Unlock com companyId, candidateId, jobId, unlockedAt, creditsCost. @@unique previne double-unlock. Ranking faz JOIN para verificar status. | ✓ |
| Campo no Swipe | Adicionar unlockedByCompanyId (nullable) no Swipe. Mais simples, mistura domínios. | |
| CreditTransaction com jobId/candidateId | Audit log vira também o rastreio de unlock. Uma tabela, dois propósitos. | |

**User's choice:** Nova tabela Unlock

---

| Option | Description | Selected |
|--------|-------------|----------|
| Perfil completo revelado | Retorna objeto do candidato já decensurado no response. | ✓ |
| Confirmação simples | Retorna { success: true, creditsRemaining: N }. Requer reload do ranking. | |
| Claude decide | | |

**User's choice:** Perfil completo revelado

---

| Option | Description | Selected |
|--------|-------------|----------|
| 409 ALREADY_UNLOCKED | Erro claro, não cobra créditos de novo. @@unique no DB garante atomicidade. | ✓ |
| 200 idempotente | Retorna sucesso sem cobrar créditos extras. | |

**User's choice:** 409 ALREADY_UNLOCKED

---

| Option | Description | Selected |
|--------|-------------|----------|
| POST /jobs/:jobId/candidates/:candidateId/unlock | RESTful e auto-descritivo. | ✓ |
| POST /credits/unlock | Body: { jobId, candidateId }. Módulo credits com prefix próprio. | |

**User's choice:** POST /jobs/:jobId/candidates/:candidateId/unlock

---

| Option | Description | Selected |
|--------|-------------|----------|
| Só o dono da vaga | Recruiter autenticado deve ser o recruiterId da vaga. | ✓ |
| Qualquer recrutador da empresa | Qualquer RECRUITER cuja companyId bata pode desbloquear. | |

**User's choice:** Só o dono da vaga

---

## Custo em créditos por unlock

| Option | Description | Selected |
|--------|-------------|----------|
| 1 crédito fixo | Hardcoded UNLOCK_CREDIT_COST = 1. Simples. | |
| Configurável por plano | Company.plan determina o custo. Schema já tem o campo. | ✓ |
| Claude decide | | |

**User's choice:** Configurável por plano

---

**Nota:** O usuário descreveu uma visão mais ampla (dois planos com diferença em postagens, créditos por renovação mensal, compra de créditos avulsos). Esses itens foram anotados como Deferred Ideas (v2), pois dependem de sistema de pagamento e assinatura — explicitamente fora do escopo v1 pelo PROJECT.md.

| Option | Description | Selected |
|--------|-------------|----------|
| FREE = 2, PRO = 1 | Hardcoded como constante UNLOCK_COST_BY_PLAN. | ✓ |
| 1 crédito fixo para todos | Simplifica v1. | |
| Claude decide | | |

**User's choice:** FREE = 2 créditos, PRO = 1 crédito

---

## Claude's Discretion

- Audit log read endpoint (admin-only vs. recruiter-readable)
- Refactoring de AdminService.adjustCredits para CreditService
- Error code para "candidato não deu DISLIKE nessa vaga"
- Se CreditTransaction ganha campos opcionais candidateId + jobId

## Deferred Ideas

- Compra de créditos com pagamento (Stripe) — v2
- Renovação mensal de créditos por plano — v2
- Limite de postagens por plano — fase separada
- Audit log acessível ao recrutador — Claude's discretion / v1.5
