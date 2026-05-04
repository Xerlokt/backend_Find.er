# Job Tinder — Backend

Backend completo de uma plataforma de match entre candidatos e vagas de emprego, no estilo swipe. Candidatos deslizam pelas vagas, recrutadores veem ranking de fit com perfis censurados ou visíveis dependendo do swipe, empresas desbloqueiam candidatos com créditos, e candidato + recrutador trocam mensagens em tempo real após o match.

**Core value:** Sistema de recomendação via Neo4j que calcula score de fit entre candidato e vaga.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework | Fastify 4 |
| ORM | Prisma 7 → PostgreSQL 16 |
| Grafo | Neo4j 5 (fit-score de recomendação) |
| WebSocket | @fastify/websocket |
| Testes | Jest 29 + Supertest |
| Infra | Docker Compose |

---

## Subir o ambiente

```bash
cp .env.example .env          # configurar DATABASE_URL, NEO4J_URI, JWT_SECRET, etc.
docker compose up -d          # PostgreSQL (5432) + Neo4j (7474/7687)
npx prisma migrate dev        # aplicar migrations
npm run dev                   # servidor em http://localhost:3000
```

### Seed Neo4j (profissões e habilidades)

```bash
npx ts-node --skip-project \
  --compiler-options '{"lib":["ES2022","dom"],"module":"commonjs","esModuleInterop":true}' \
  scripts/seed-neo4j.ts
```

---

## Rodar testes

```bash
# Todos os testes (unit + integration)
npx jest --no-coverage

# Apenas unitários (sem Docker)
npx jest tests/unit/ --no-coverage

# Apenas integração (requer Docker rodando)
npx jest tests/integration/ --runInBand --no-coverage
```

---

## Endpoints principais

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | Cadastro com email/senha |
| `POST` | `/auth/login` | Login, retorna access + refresh token |
| `POST` | `/auth/refresh` | Troca refresh por novo access token |
| `POST` | `/auth/logout` | Invalida o refresh token |
| `POST` | `/auth/google` | Login via Google OAuth2 |

### Candidatos

| Método | Rota | Descrição |
|--------|------|-----------|
| `PUT` | `/candidates/me` | Criar/atualizar perfil |
| `GET` | `/candidates/me` | Ver próprio perfil |

### Recrutadores

| Método | Rota | Descrição |
|--------|------|-----------|
| `PUT` | `/recruiters/me` | Criar/atualizar perfil |
| `GET` | `/recruiters/me` | Ver próprio perfil |

### Empresas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/companies` | Criar empresa (admin) |
| `GET` | `/companies/:id` | Ver empresa |

### Vagas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/jobs` | Criar vaga (recrutador) |
| `PATCH` | `/jobs/:id` | Editar vaga |
| `DELETE` | `/jobs/:id/deactivate` | Desativar vaga |
| `GET` | `/jobs/mine` | Vagas do recrutador autenticado |
| `GET` | `/jobs/:id` | Detalhe da vaga |
| `GET` | `/jobs/:id/ranking` | Ranking de candidatos por fit score |
| `GET` | `/jobs/feed` | Feed de vagas para candidato (com fitScore) |

### Swipe

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/swipes` | Registrar LIKE ou DISLIKE em uma vaga |

### Créditos / Unlock

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/jobs/:jobId/candidates/:candidateId/unlock` | Desbloquear candidato DISLIKE (debita créditos) |

### Chat

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/chats` | Listar chats do usuário |
| `GET` | `/chats/:chatId/messages` | Histórico paginado por cursor |
| `GET` | `/chats/:chatId/ws` | Upgrade WebSocket (tempo real) |

### Admin

| Método | Rota | Descrição |
|--------|------|-----------|
| `PATCH` | `/admin/companies/:id/credits` | Conceder créditos a uma empresa |
| `GET` | `/admin/companies/:id/transactions` | Audit log de créditos |
| `GET` | `/admin/users` | Listar todos os usuários |
| `GET` | `/admin/users/:id` | Ver usuário específico |

---

## Arquitetura

```
src/
├── app.ts                         # Composition root — wiring de todos os módulos
├── server.ts                      # Entry point
├── shared/
│   ├── db/prisma.ts               # Singleton do Prisma client
│   ├── db/neo4j.ts                # Singleton do Neo4j driver
│   ├── errors/AppError.ts         # Erros de domínio tipados
│   ├── hooks/                     # authenticate, requireRole
│   ├── interfaces/                # IChatService, IRecommendationService (ARCH-04)
│   └── utils/haversine.ts         # Distância geográfica compartilhada
└── modules/
    ├── auth/                      # JWT, refresh tokens, Google OAuth2
    ├── candidate/                 # Perfil do candidato
    ├── recruiter/                 # Perfil do recrutador
    ├── company/                   # Conta da empresa
    ├── job/                       # CRUD de vagas + scheduler de expiração
    ├── swipe/                     # Like/Dislike + ranking + feed
    ├── recommendation/            # Neo4j: seed taxonomy + fit score
    ├── credits/                   # Unlock economy + transações atômicas
    ├── chat/                      # WebSocket real-time + histórico REST
    └── admin/                     # Gestão de usuários e créditos
```

**Regras arquiteturais:**

- `routes → service → repository` — sem pular camadas
- Módulos se comunicam via interfaces em `src/shared/interfaces/` — nunca importam implementações de outros módulos diretamente (ARCH-04)
- `app.ts` é o único composition root — instancia e injeta dependências
- Testes de integração usam DB real via Docker — sem mocks de banco

---

## Documentação por fase

Documentação detalhada de cada fase em [`docs/`](docs/README.md):

| Fase | Doc |
|------|-----|
| 01 — Fundação | [fase-01-fundacao](docs/fase-01-fundacao.md) |
| 02 — Autenticação | [fase-02-autenticacao](docs/fase-02-autenticacao.md) |
| 03 — Perfis & Empresas | [fase-03-perfis-empresas](docs/fase-03-perfis-empresas.md) |
| 04 — Vagas | [fase-04-vagas](docs/fase-04-vagas.md) |
| 05 — Swipe | [fase-05-swipe](docs/fase-05-swipe.md) |
| 06 — Recomendação Neo4j | [fase-06-recommendation](docs/fase-06-recommendation.md) |
| 07 — Créditos | [fase-07-creditos](docs/fase-07-creditos.md) |
| 08 — Chat | [fase-08-chat](docs/fase-08-chat.md) |
