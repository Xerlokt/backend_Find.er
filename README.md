# Job Tinder — Backend

Backend completo de uma plataforma de match entre candidatos e vagas de emprego, no estilo swipe. Candidatos deslizam pelas vagas, recrutadores veem ranking de fit com perfis censurados ou visíveis dependendo do swipe, empresas desbloqueiam candidatos com créditos, e candidato + recrutador trocam mensagens em tempo real após o match.

**Core value:** Sistema de recomendação via Neo4j que calcula fit score entre candidato e vaga usando graph traversal com adjacência de skills.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 20 + TypeScript 5 |
| Framework | Fastify 5 |
| ORM | Prisma 7 → PostgreSQL 16 |
| Grafo | Neo4j 5 (fit-score por traversal de grafo) |
| Cache | Redis 7 (feed/ranking) |
| WebSocket | @fastify/websocket |
| Testes | Jest 30 + Supertest |
| Infra | Docker Compose |

---

## Subir o ambiente

```bash
cp .env.example .env          # configurar DATABASE_URL, NEO4J_URI, JWT_SECRET, etc.
docker compose up -d          # PostgreSQL (5432) + Neo4j (7474/7687) + Redis (6379)
npm run db:migrate            # aplicar migrations
npm run dev                   # servidor em http://localhost:3000
```

### Seed Neo4j (taxonomia de profissões e habilidades)

```bash
npx ts-node --skip-project \
  --compiler-options '{"lib":["ES2022","dom"],"module":"commonjs","esModuleInterop":true}' \
  scripts/seed-neo4j.ts
```

Popula nós `Profession`, `Skill` e relacionamentos `RELATED_TO` usados pelo motor de fit score via traversal de grafo. Obrigatório para que recomendações funcionem.

---

## Rodar testes

```bash
npm test                      # Todos os testes (unit + integration)
npm run test:unit             # Apenas unitários (sem Docker)
npm run test:integration      # Apenas integração (requer Docker rodando)
```

> **Estado atual:** 94 testes (53 unit + 41 integration) — todos verdes.

---

## Endpoints

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | Cadastro com email/senha |
| `POST` | `/auth/login` | Login — retorna access + refresh token |
| `POST` | `/auth/refresh` | Troca refresh token por novo access token |
| `POST` | `/auth/logout` | Invalida o refresh token |
| `POST` | `/auth/email/send` | (logado) envia/reenvia o código de 6 dígitos por email (reenvio a cada 60s) |
| `POST` | `/auth/email/verify` | (logado) confere o código (10 min, 5 tentativas) e devolve tokens com `emailVerified` |
| `POST` | `/auth/email/change` | (logado, email não verificado) corrige o email, manda código novo e devolve tokens com o email atualizado |
| `POST` | `/auth/google` | Login via Google OAuth2 |

### Candidatos

| Método | Rota | Descrição |
|--------|------|-----------|
| `PUT` | `/candidates/me` | Criar/atualizar perfil |
| `GET` | `/candidates/me` | Ver próprio perfil |

### DISC — Avaliação de Personalidade

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/candidates/:id/disc` | Submeter 4 respostas DISC |
| `GET` | `/candidates/:id/disc` | Ver resultado e perfil dominante (D/I/S/C) |

### Recrutadores

| Método | Rota | Descrição |
|--------|------|-----------|
| `PUT` | `/recruiters/me` | Criar/atualizar perfil |
| `GET` | `/recruiters/me` | Ver próprio perfil |

### Empresas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/companies` | Criar empresa |
| `GET` | `/companies/:id` | Ver empresa |

### Vagas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/jobs` | Criar vaga (recrutador) |
| `PATCH` | `/jobs/:id` | Editar vaga |
| `DELETE` | `/jobs/:id/deactivate` | Desativar vaga |
| `GET` | `/jobs/mine` | Vagas do recrutador autenticado |
| `GET` | `/jobs/:id` | Detalhe da vaga |
| `GET` | `/jobs/:id/ranking` | Ranking de candidatos por fit score (com `matchingSkills` e `fitReasons`) |
| `GET` | `/jobs/feed` | Feed de vagas para candidato (com `fitScore`) |

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

### Health

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Status do servidor |

---

## Arquitetura

Clean Architecture em 4 camadas, com regra de dependência verificada automaticamente pelo script `check-deps.ts`.

```
src/
├── app.ts                         # Composition root — wiring de dependências
├── server.ts                      # Entry point — inicia o servidor HTTP
├── domain/
│   ├── entities/                  # 12 entidades puras (User, Candidate, Job, Swipe, Chat, DiscResult...)
│   └── interfaces/                # 11 interfaces de repositório (IUserRepository, IJobRepository...)
├── application/
│   ├── use-cases/                 # Casos de uso por módulo (auth, candidate, job, swipe, disc, admin...)
│   ├── ports/                     # IHashPort, ITokenPort, IGraphPort, IChatPort, ICachePort
│   ├── errors/                    # DomainError
│   └── utils/                     # haversine.ts (distância geográfica)
├── adapters/
│   ├── controllers/               # 10 controladores — validação Zod + use case + mapeamento de erros
│   ├── repositories/              # 11 repositórios Prisma — implementam interfaces de domain/
│   └── services/                  # BcryptAdapter, JwtAdapter, Neo4jAdapter, RedisAdapter, CreditService, ChatService
└── infrastructure/
    ├── database/                  # prisma.ts, neo4j.ts, redis.ts (singletons)
    ├── http/
    │   ├── app.ts                 # buildApp — plugins e rotas Fastify
    │   ├── routes/                # 12 arquivos de rota (um por módulo)
    │   ├── plugins/               # authenticate, cors, helmet, jwt, rate-limit, scheduler
    │   └── errors/                # AppError (mapeamento HTTP)
    └── scheduler/                 # job-expiry.scheduler.ts (cron de expiração de vagas)
```

**Regra de dependência:**

| Camada | Pode importar |
|--------|--------------|
| `domain/` | nada do projeto |
| `application/` | apenas `domain/` |
| `adapters/` | `application/` e `domain/` |
| `infrastructure/` | todas as camadas |

```bash
npm run check:deps   # falha se algum arquivo violar a regra de dependência
```

---

## Fit Score

O fit score (0–100) combina 5 fatores calculados via Neo4j + TypeScript puro, com bônus DISC opcional:

| Fator | Peso | Regra |
|-------|------|-------|
| Profissão | 30% | Match direto de `professionId` |
| Skills | 35% | Match direto (1.0×) + adjacência de grafo `RELATED_TO*1..2` com decay 0.8× |
| Localização | 20% | Haversine: `max(0, 1 - km / searchRadiusKm)` |
| Modalidade | 10% | Candidato prefere a modalidade da vaga |
| Salário | 5% | Expectativa salarial dentro da faixa |
| DISC | +0–10% | Bônus aditivo se perfil dominante bate com `discProfile` da vaga |

O bônus DISC é sempre aditivo — nunca penaliza, nunca filtra.

---

## Verificação de email

Todo usuário (candidato e recrutador) precisa validar o email com um código antes de usar a API:

- `register` e `register-company` criam a conta e enviam um **código de 6 dígitos** (hash HMAC no banco, tabela `EmailVerification`; vale 10 min, 5 tentativas erradas, reenvio a cada 60 s).
- O JWT carrega `email` e `emailVerified`. O hook `authenticate` responde `403 EMAIL_NOT_VERIFIED` para quem não validou; só `authenticateUnverified` (rotas `/auth/email/*`) deixa passar.
- `POST /auth/email/verify` marca `emailVerifiedAt` e devolve tokens novos já verificados. Contas Google e ADMIN já nascem verificadas.
- Conta que nunca verificou o email **não segura email nem CNPJ**: recadastrar (ou trocar para esse email) apaga a conta antiga e a empresa órfã. Contas verificadas continuam dando 409.
- Envio: porta `IMailerPort` + `NodemailerAdapter` (SMTP genérico). Sem `SMTP_HOST`, imprime o código no log. Nos testes (`buildApp({ testing: true })`) o mailer é silencioso.
- Migration `20261012000000_add_email_verification`: rode `npx prisma migrate deploy`. Contas existentes ficam não verificadas (exceto ADMIN e Google).

---

## Variáveis de ambiente

Copie `.env.example` e preencha:

```
DATABASE_URL           # PostgreSQL (ex: postgresql://user:pass@localhost:5432/jobera)
DATABASE_URL_TEST      # PostgreSQL para testes (porta 5433 no Docker)
NEO4J_URI              # bolt://localhost:7687
NEO4J_USER             # neo4j
NEO4J_PASSWORD
JWT_SECRET             # access token signing key
JWT_REFRESH_SECRET     # refresh token signing key
GOOGLE_CLIENT_ID       # OAuth2
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL
PORT                   # default 3000
ALLOWED_ORIGINS        # CORS whitelist — inclua a origem do site (ex: http://localhost:5173)
SMTP_HOST              # servidor SMTP do envio de email (vazio = o código vai só para o log do servidor)
SMTP_PORT              # 587 (STARTTLS) ou 465 (SSL)
SMTP_USER
SMTP_PASS              # Gmail: senha de app; produção: credencial do provedor (Resend, Brevo, SES…)
MAIL_FROM              # remetente, ex: Find.er <no-reply@seudominio.com>
```

---

## Scripts

```bash
npm run dev                  # servidor de desenvolvimento (ts-node)
npm run build                # compilar para dist/
npm start                    # rodar build compilado
npm test                     # todos os testes
npm run test:unit            # unitários (53 testes, sem Docker)
npm run test:integration     # integração (41 testes, requer Docker)
npm run db:migrate           # prisma migrate dev
npm run db:generate          # prisma generate
npm run db:studio            # Prisma Studio (GUI)
npm run check:deps           # validar regras de dependência entre camadas
```

---

## Documentação por fase

Documentação técnica detalhada em [`docs/`](docs/README.md):

| Fase | Milestone | Status | Doc |
|------|-----------|--------|-----|
| 01 — Fundação | v1.0 | ✅ | [fase-01](docs/fase-01-fundacao.md) |
| 02 — Autenticação | v1.0 | ✅ | [fase-02](docs/fase-02-autenticacao.md) |
| 03 — Perfis & Empresas | v1.0 | ✅ | [fase-03](docs/fase-03-perfis-empresas.md) |
| 04 — Vagas | v1.0 | ✅ | [fase-04](docs/fase-04-vagas.md) |
| 05 — Swipe | v1.0 | ✅ | [fase-05](docs/fase-05-swipe.md) |
| 06 — Recomendação Neo4j | v1.0 | ✅ | [fase-06](docs/fase-06-recommendation.md) |
| 07 — Créditos | v1.0 | ✅ | [fase-07](docs/fase-07-creditos.md) |
| 08 — Chat | v1.0 | ✅ | [fase-08](docs/fase-08-chat.md) |
| 09 — Domain Layer Scaffold | v2.0 | ✅ | [fase-09](docs/fase-09-clean-architecture-scaffold.md) |
| 10 — Infrastructure + Auth | v2.0 | ✅ | [fase-10](docs/fase-10-infrastructure-auth-migration.md) |
| 11 — Core Modules Migration | v2.0 | ✅ | [fase-11](docs/fase-11-core-modules-migration.md) |
| 12 — Swipe, Credits, Chat | v2.0 | ✅ | [fase-12](docs/fase-12-swipe-credits-recommendation-chat-migration.md) |
| 13 — Cleanup + Unit Tests | v2.0 | ✅ | [fase-13](docs/fase-13-cleanup-unit-tests.md) |
| 14 — Graph Recommendation | v3.0 | ✅ | [fase-14](docs/fase-14-graph-recommendation.md) |
| 15 — Redis Caching | v3.0 | 🔄 planejado | — |
| 16 — Recruiter Skill Preview | v3.0 | ✅ | [fase-16](docs/fase-16-recruiter-skill-preview.md) |
| 17 — DISC Assessment | v3.0 | ✅ | [fase-17](docs/fase-17-disc-personality-assessment.md) |
| 18 — Learning System | v3.0 | ⏳ | — |
| 19 — Admin Dashboard + Load Test | v3.0 | ⏳ | — |
