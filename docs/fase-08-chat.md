# Fase 08 — Chat (WebSocket + histórico)

## O que foi construído

Chat em tempo real completo em quatro planos: fundação do banco (modelo `Chat` + `Message`, factories de teste); `ChatService` com regra recruiter-first e paginação por cursor; gateway REST + WebSocket com broadcast por sala e store de conexões em memória; e gap closure substituindo todos os stubs de integração por assertions reais contra o DB e o protocolo WS.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `prisma/schema.prisma` | Modelos `Chat` e `Message`; `@@unique([candidateId, companyId, jobId])` — uma sala por par candidato-vaga-empresa |
| `src/shared/interfaces/chat.interface.ts` | `IChatService` — boundary ARCH-04; swipe e credits dependem da interface, nunca da implementação concreta |
| `src/modules/chat/chat.repository.ts` | `ChatRepository` — 7 métodos Prisma: `createOrGetChat` (upsert idempotente), `createMessage`, `findMessages` (cursor), `findChatWithParticipants`, `countRecruiterMessages`, `findChatsByUserId`, `markMessagesRead` |
| `src/modules/chat/chat.service.ts` | `ChatService` — regra recruiter-first, check de participante, paginação com `nextCursor`, mark-as-read no fetch |
| `src/modules/chat/chat.routes.ts` | `chatRoutes` — `GET /chats`, `GET /:chatId/messages`, `GET /:chatId/ws` (WebSocket); store de conexões em memória; buffer-then-drain; persist-before-broadcast |
| `src/app.ts` | Root de composição: `fastifyWebsocket` registrado antes de `chatRoutes`; `chatService` injetado em `swipeRoutes` e `creditsJobRoutes` via `opts.chat` |
| `src/modules/swipe/swipe.service.ts` | `recordSwipe` — LIKE cria chat via `this.chat.createOrGetChat(MATCH)` e retorna `chatId` |
| `src/modules/credits/credits.service.ts` | `unlockCandidate` — cria chat via `this.chat.createOrGetChat(CREDIT)` e retorna `chatId` |
| `tests/unit/chat.service.test.ts` | 16 testes unitários — recruiter-first, NOT_PARTICIPANT, getMessages cursor, verifyParticipant |
| `tests/integration/chat.test.ts` | 12 testes de integração — WS connect/reject/recruiter-first/persistence/INVALID_PAYLOAD; unlock chatId; REST history; 403 não-participante; mark readAt |
| `tests/helpers/factories.ts` | `createChat`, `createMessage` — factories diretas no DB para seed de testes WS |

---

## Endpoints

### `GET /chats`

Lista todas as salas de chat do usuário autenticado.

**Auth:** `CANDIDATE` ou `RECRUITER`

**Response 200:**
```json
[
  {
    "chatId": "uuid",
    "jobId": "uuid",
    "initiatedBy": "MATCH",
    "isActive": true,
    "createdAt": "2026-05-03T10:00:00.000Z",
    "otherParticipantName": "Empresa Acme"
  }
]
```

> `otherParticipantName`: candidato vê nome da empresa; recrutador vê nome do candidato.

---

### `GET /chats/:chatId/messages`

Histórico paginado por cursor. Ao buscar, marca como lidas as mensagens do outro participante.

**Auth:** `CANDIDATE` ou `RECRUITER` (deve ser participante do chat)

**Query params:**

| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `cursor` | `uuid` (opcional) | — | ID da última mensagem recebida (paginação para trás) |
| `limit` | `number` | `20` | Máx `100` |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "chatId": "uuid",
      "senderId": "uuid",
      "content": "Olá, temos uma vaga para você!",
      "createdAt": "2026-05-03T10:01:00.000Z",
      "readAt": "2026-05-03T10:02:00.000Z"
    }
  ],
  "nextCursor": "uuid-da-proxima-pagina"
}
```

> Ordem: mais recente primeiro (`orderBy: createdAt desc`). O cliente inverte para exibir em ordem cronológica.
> `nextCursor` é `null` quando não há mais mensagens.

**Erros:**

| Código | Condição |
|--------|----------|
| `403 NOT_PARTICIPANT` | Usuário não é participante do chat |

---

### `GET /chats/:chatId/ws`

Upgrade para WebSocket. Permite enviar e receber mensagens em tempo real.

**Auth:** JWT via header `Authorization: Bearer <token>` no handshake HTTP

**Protocolo de entrada (JSON):**
```json
{ "content": "texto da mensagem" }
```

**Respostas do servidor (JSON):**

| Evento | Payload |
|--------|---------|
| Mensagem válida enviada | `{ "id": "uuid", "chatId": "...", "senderId": "...", "content": "...", "createdAt": "...", "readAt": null }` |
| Payload inválido | `{ "error": "INVALID_PAYLOAD" }` |
| Candidato envia antes do recrutador | `{ "error": "RECRUITER_MUST_INITIATE" }` |
| Usuário não é participante | Close frame `1008 Forbidden` |

---

## Criação automática do chat

O chat é criado automaticamente em dois gatilhos — sem ação manual:

| Gatilho | Iniciador | Endpoint que dispara |
|---------|-----------|----------------------|
| Candidato dá LIKE em uma vaga | `ChatInitiator.MATCH` | `POST /swipes` |
| Empresa desbloqueia candidato DISLIKE | `ChatInitiator.CREDIT` | `POST /jobs/:jobId/candidates/:candidateId/unlock` |

Ambos os endpoints passam a retornar `chatId` no response após a fase 8.

**LIKE swipe — response 201 (campo adicionado):**
```json
{
  "id": "uuid",
  "direction": "LIKE",
  "chatId": "uuid-do-chat-criado"
}
```

**Unlock — response 201 (campo adicionado):**
```json
{
  "id": "uuid",
  "creditsCost": 2,
  "chatId": "uuid-do-chat-criado",
  "profile": { "..." }
}
```

O upsert é idempotente — se o chat já existir (ex: LIKE + unlock para a mesma vaga), retorna o mesmo `chatId` sem criar duplicata.

---

## Por que foi feito assim

### Buffer-then-drain no handler WS

O handler WS é assíncrono: precisa fazer `await service.verifyParticipant(...)` antes de registrar o socket. Durante esse `await`, mensagens do cliente já podem chegar.

A solução é um array `pending: Buffer[]` que captura tudo antes do check e processa depois:

```typescript
const pending: Buffer[] = []
socket.on('message', (data) => pending.push(data as Buffer))

const isParticipant = await service.verifyParticipant(chatId, request.user.id)
if (!isParticipant) { socket.close(1008, 'Forbidden'); return }

// Troca o listener e drena o buffer
socket.removeAllListeners('message')
socket.on('message', handleMessage)
for (const data of pending) await handleMessage(data)
```

Sem o buffer, mensagens enviadas durante o handshake seriam perdidas silenciosamente.

### Persist-before-broadcast (D-11)

O `sendMessage` persiste no banco **antes** de chamar `broadcast`. Isso garante que:

1. Se o broadcast falhar, o dado não é perdido — o DB tem o registro.
2. Os testes de persistência podem aguardar o eco do broadcast como sinal de que o DB write completou.

```typescript
const message = await service.sendMessage(chatId, userId, content) // persiste
broadcast(chatId, message) // depois envia para todos
```

### Regra recruiter-first (D-04)

O recrutador deve mandar a primeira mensagem — isso evita que candidatos iniciem conversas sem convite e reduz spam.

O check usa `recruiterUserId` (o `User.id` do recrutador dono da vaga), **não o campo `role`**. Isso é importante porque `request.user.id` é sempre o `User.id` do JWT, e o participante do chat pode ter qualquer role — o que importa é quem é o recrutador *daquele* chat.

```typescript
const recruiterMessageCount = await this.repo.countRecruiterMessages(chatId, recruiterUserId)
if (recruiterMessageCount === 0 && senderId !== recruiterUserId) {
  throw new AppError('Recruiter must send first message', 403, 'RECRUITER_MUST_INITIATE')
}
```

### Store de conexões em memória (D-10)

O `Map<chatId, Set<WebSocket>>` vive no escopo do módulo. É adequado para deployment single-process (Node.js single thread + Docker container único). Em escala horizontal, seria necessário Redis Pub/Sub — documentado como limitação conhecida no code review (IN-01).

O `removeConnection` limpa salas vazias (`room.size === 0 → connections.delete(chatId)`) para evitar memory leak em chats abandonados.

### `IChatService` como boundary ARCH-04

O `SwipeService` e o `CreditService` precisam criar chats, mas não podem importar `ChatService` diretamente — violaria o isolamento de módulos.

A solução é a interface `IChatService` em `src/shared/interfaces/chat.interface.ts`. Os módulos swipe e credits importam apenas a interface (type-only). O `app.ts` é o único ponto que instancia `ChatService` e o injeta via `opts.chat`.

```typescript
// swipe.routes.ts
new SwipeService(repo, recRepo, opts.chat) // opts.chat: IChatService

// credits.routes.ts
new CreditService(repo, opts.chat)         // opts.chat: IChatService
```

### `fastifyWebsocket` antes das rotas (RESEARCH Pitfall 1)

O plugin `@fastify/websocket` deve ser registrado **antes** de qualquer rota que use `websocket: true`. Se a ordem for invertida, o Fastify não reconhece a opção e silenciosamente ignora o upgrade, tratando a rota como HTTP normal.

```typescript
// app.ts — CORRETO
await app.register(fastifyWebsocket)          // linha 42
await app.register(chatRoutes, { prefix: '/chats', service: chatService }) // linha 73
```

---

## Fluxo de mensagem (data flow)

```
Cliente WS → GET /chats/:chatId/ws
  → authenticate (JWT → userId)
  → Buffer mensagens pendentes
  → ChatService.verifyParticipant(chatId, userId)
      → ChatRepository.findChatWithParticipants → prisma.chat.findUnique
      → userId === candidateUserId || recruiterUserId
  → [false] socket.close(1008)
  → [true] addConnection(chatId, socket)
  → socket.on('message', handleMessage)

handleMessage(rawData):
  → IncomingMessageSchema.parse(JSON.parse(rawData))
  → [inválido] socket.send({ error: 'INVALID_PAYLOAD' })
  → ChatService.sendMessage(chatId, userId, content)
      → findChatWithParticipants (participant check + recruiter-first)
      → [RECRUITER_MUST_INITIATE] socket.send({ error: 'RECRUITER_MUST_INITIATE' })
      → ChatRepository.createMessage → prisma.message.create
  → broadcast(chatId, message) → todos os sockets do chatId
```

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Obter chatId via LIKE

```cmd
curl -s -X POST http://127.0.0.1:3000/swipes \
  -H "Authorization: Bearer <CANDIDATE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"jobId\": \"<JOB_ID>\", \"direction\": \"LIKE\"}"
```

Esperado: `201` com `chatId` no body.

### 2. Listar chats

```cmd
curl -s http://127.0.0.1:3000/chats \
  -H "Authorization: Bearer <TOKEN>"
```

Esperado: array com `otherParticipantName` e `initiatedBy`.

### 3. Conectar via WebSocket (wscat)

```bash
npm install -g wscat
wscat -c "ws://127.0.0.1:3000/chats/<CHAT_ID>/ws" \
  -H "Authorization: Bearer <RECRUITER_TOKEN>"
```

Enviar mensagem (recrutador primeiro):
```json
{ "content": "Olá! Temos interesse no seu perfil." }
```

Esperado: broadcast com `{ id, chatId, senderId, content, createdAt, readAt: null }`.

### 4. Buscar histórico

```cmd
curl -s "http://127.0.0.1:3000/chats/<CHAT_ID>/messages?limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

Esperado: `{ data: [...], nextCursor: null }`.

---

## Rodar os testes automatizados

```bash
# Unitários do ChatService (sem Docker)
npx jest tests/unit/chat.service.test.ts --no-coverage

# Integração — suite completa do chat (12 testes)
npx jest tests/integration/chat.test.ts --runInBand --no-coverage

# Todos de uma vez
npx jest --no-coverage
```

**Resultado esperado:** 16 unit + 12 chat integration, todos verdes.
