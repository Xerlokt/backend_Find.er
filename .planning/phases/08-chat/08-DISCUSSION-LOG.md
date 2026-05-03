# Phase 8: Chat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 08-chat
**Areas discussed:** Auto-creation integration, WebSocket authentication, Chat room uniqueness, REST endpoints shape, Recruiter-first rule, ChatId in response, Message pagination

---

## Chat Access — Who initiates

| Option | Description | Selected |
|--------|-------------|----------|
| Acesso restrito ao recruiter da vaga | Só o recruiter dono da vaga pode ver e participar do chat | |
| Recruiter envia a primeira mensagem | Chat criado automaticamente, mas só recruiter pode enviar a primeira mensagem | ✓ |
| Recruiter ativa o chat explicitamente | Chat não criado automaticamente — recruiter aceita/ativa manualmente | |

**User's choice:** Recruiter envia a primeira mensagem
**Notes:** Backend enforces this rule — candidate gets 403 if they try to send before recruiter has sent.

---

## Auto-Creation Integration (CHAT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Injetar IChatService via app.ts | Interface injetada no SwipeService e CreditService no composition root — mesmo padrão do IRecommendationService (Phase 6) | ✓ |
| Route-level orchestration | Swipe/credits routes chamam ChatService após o service retornar sucesso — routes viram orquestradoras | |

**User's choice:** Injetar IChatService via app.ts
**Notes:** Preserves ARCH-04 — modules communicate via interfaces, not direct imports.

---

## WebSocket Authentication

| Option | Description | Selected |
|--------|-------------|----------|
| JWT no header via preHandler | @fastify/websocket suporta preHandlers — mesmo hook `authenticate` já usado nas rotas REST | ✓ |
| JWT como query param (?token=...) | Simples mas token fica na URL/logs | |

**User's choice:** JWT no header via preHandler
**Notes:** Token in Authorization header, not URL. Non-participants rejected with 403 after JWT validation.

---

## Chat Room Uniqueness

| Option | Description | Selected |
|--------|-------------|----------|
| Uma sala por (candidato, empresa, vaga) | @@unique([candidateId, companyId, jobId]) no Chat — idempotent, merge MATCH + CREDIT | ✓ |
| Salas separadas por evento | MATCH e CREDIT criam salas distintas | |

**User's choice:** Uma sala por (candidato, empresa, vaga)
**Notes:** Migration needed to add the unique constraint. initiatedBy records the first trigger.

---

## REST Endpoints — GET /chats

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, incluir GET /chats | Sem essa rota o cliente não tem como descobrir os chatIds do usuário | ✓ |
| Não, só GET /chats/:chatId/messages | Frontend obtém chatId pela resposta do swipe/unlock | |

**User's choice:** Sim, incluir GET /chats
**Notes:** Both GET /chats (list) and GET /chats/:chatId/messages (history) are in scope.

---

## ChatId in Swipe/Unlock Response

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, retornar chatId na resposta | Cliente recebe chatId imediatamente após swipe/unlock | ✓ |
| Não, GET /chats separado | Cliente busca chatId via GET /chats quando precisar | |

**User's choice:** Sim, retornar chatId na resposta
**Notes:** Both POST /swipes and POST /unlock responses updated to include chatId.

---

## Message History Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, cursor-based | Mesmo padrão do feed (cursor + limit) — escala para chats longos | ✓ |
| Não, retornar histórico completo | Mais simples — aceitável para MVP | |

**User's choice:** Sim, cursor-based
**Notes:** { data: Message[], nextCursor: string | null } — same shape as feed.

---

## Claude's Discretion

- WS endpoint path (`GET /chats/:chatId/ws`)
- Exact GET /chats response fields beyond minimum
- Whether WS handler lives in chat.routes.ts or chat.gateway.ts
- Whether sendMessage via WS and REST fallback share the same service method

## Deferred Ideas

- Push notifications (offline messages) — v2
- Real-time read receipts via WS — v2
- Chat expiry (field exists in schema but unused) — v2
- Admin access to chats for moderation — v2
- Typing indicators — v2
