# Fase 01 — Fundação

## O que foi construído

A infraestrutura base do backend: configuração do projeto, schema do banco, servidor Fastify, plugins de segurança, tratamento de erros, hooks de autenticação, driver Neo4j e rota de health check.

Tudo que as fases seguintes precisam já está scaffoldado aqui.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `package.json` | Dependências do projeto e scripts npm |
| `tsconfig.json` | TypeScript com aliases `@shared/*` e `@modules/*` |
| `jest.config.ts` | Configuração ts-jest com mapeamento de paths |
| `docker-compose.yml` | PostgreSQL (prod + test) e Neo4j |
| `prisma/schema.prisma` | 9 modelos do domínio |
| `prisma.config.ts` | Config Prisma v7 com dotenv |
| `src/app.ts` | Factory `buildApp()` que registra todos os plugins |
| `src/server.ts` | Entry point com graceful startup |
| `src/shared/db/prisma.ts` | Singleton do PrismaClient |
| `src/shared/db/neo4j.ts` | Singleton do driver Neo4j |
| `src/shared/plugins/helmet.ts` | Headers de segurança HTTP |
| `src/shared/plugins/cors.ts` | CORS configurável por env |
| `src/shared/plugins/jwt.ts` | JWT via `@fastify/jwt` |
| `src/shared/errors/AppError.ts` | Classe de erros tipados |
| `src/shared/errors/errorHandler.ts` | Handler global de erros do Fastify |
| `src/shared/hooks/authenticate.ts` | preHandler: verifica JWT |
| `src/shared/hooks/requireRole.ts` | preHandler: verifica role do usuário |
| `src/modules/health/health.routes.ts` | `GET /health` com ping ao banco |
| `tests/helpers/setup.ts` | Hooks de setup/teardown para testes de integração |
| `tests/helpers/factories.ts` | Factories de dados de teste |

---

## Por que foi feito assim

### Clean Architecture desde o início

O projeto segue a estrutura `routes → service → repository`. Os módulos ficam em `src/modules/<nome>/` e o código compartilhado em `src/shared/`. Os aliases `@modules/*` e `@shared/*` no TypeScript evitam imports relativos frágeis (`../../shared/...`).

### Dois bancos de dados

O Docker Compose sobe dois PostgreSQL: porta `5432` para desenvolvimento e `5433` para testes. Isso permite rodar a suíte de testes sem interferir no banco de dev — e os testes de integração são contra um banco real, não mocks.

### Prisma v7 — mudança de configuração

No Prisma v7, a URL do banco **não vai mais no `schema.prisma`**. Vai no `prisma.config.ts`:

```typescript
// prisma.config.ts
import 'dotenv/config'
export default defineConfig({
  datasource: { url: process.env.DATABASE_URL }
})
```

Isso é uma breaking change da v5/v6 — o `url = env("DATABASE_URL")` no datasource block foi removido.

### Singleton com globalThis guard

```typescript
// src/shared/db/prisma.ts
const globalForPrisma = globalThis as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Em desenvolvimento, o hot-reload recarrega os módulos mas não o `globalThis`. Sem esse guard, cada hot-reload criaria uma nova conexão com o banco até esgotar o pool.

### AppError + errorHandler global

Em vez de cada rota tratar seus próprios erros, existe um handler global no Fastify que cobre:

| Tipo de erro | Resposta |
|-------------|----------|
| `AppError` | Status code definido na instância + `{ error, code }` |
| `ZodError` | `400` + lista de campos inválidos |
| Prisma `P2002` | `409 CONFLICT` (unique constraint) |
| Prisma `P2025` | `404 NOT FOUND` (record not found) |
| Qualquer outro | `500` sem vazar stack trace |

### Hooks preHandler (authenticate + requireRole)

Rotas protegidas usam hooks que rodam **antes** do handler:

```typescript
// Rota protegida
app.get('/perfil', { preHandler: [authenticate, requireRole('CANDIDATE')] }, handler)
```

- `authenticate` — verifica e decodifica o JWT; coloca `request.user` com `id` e `role`
- `requireRole('CANDIDATE')` — retorna 403 se o role não bater

### Neo4j separado do Prisma

O Prisma gerencia PostgreSQL (dados relacionais). O Neo4j é usado para o sistema de recomendação por grafo (fit-score). O driver fica em `src/shared/db/neo4j.ts` com lazy init — só conecta quando for chamado pela primeira vez.

---

## Schema do banco (9 modelos)

```
User ──────────── CandidateProfile
  │ └─────────── RecruiterProfile
  │
  ├── Company ── Job
  │               └── Swipe (candidato ↔ vaga)
  │
  ├── Chat ────── Message
  │
  └── CreditTransaction
```

| Model | Descrição |
|-------|-----------|
| `User` | Conta base com role (CANDIDATE, RECRUITER, ADMIN) |
| `CandidateProfile` | Dados do candidato (skills, experiência, etc.) |
| `RecruiterProfile` | Dados do recrutador |
| `Company` | Empresa vinculada ao recrutador |
| `Job` | Vaga de emprego |
| `Swipe` | Registro de swipe candidato ↔ vaga |
| `Chat` | Conversa aberta após match |
| `Message` | Mensagem dentro de um chat |
| `CreditTransaction` | Histórico de compra/uso de créditos |

---

## Endpoint

### `GET /health`

Verifica se o servidor e o banco estão operacionais.

```http
GET /health
```

**Resposta 200:**
```json
{ "status": "ok", "db": "connected" }
```

**Resposta 503:**
```json
{ "status": "error", "db": "disconnected" }
```

---

## Como subir o ambiente

### 1. Copiar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com seus valores (especialmente `JWT_SECRET` em produção).

### 2. Subir os bancos

```bash
docker compose up -d
```

Sobe PostgreSQL dev (5432), PostgreSQL test (5433) e Neo4j (7474/7687).

### 3. Aplicar migrations

```bash
npx prisma migrate dev --name init
```

### 4. Gerar o Prisma Client

```bash
npx prisma generate
```

### 5. Iniciar o servidor

```bash
npm run dev
```

### 6. Testar o health check

```cmd
curl http://127.0.0.1:3000/health
```

Esperado: `{"status":"ok","db":"connected"}`

---

## Como rodar os testes

```bash
# Unitários (sem Docker)
npx jest tests/unit/

# Integração (requer Docker + banco de teste na porta 5433)
npx jest tests/integration/ --runInBand

# Tudo
npm test
```

---

## Variáveis de ambiente necessárias

| Variável | Uso | Exemplo |
|----------|-----|---------|
| `DATABASE_URL` | PostgreSQL dev | `postgresql://user:pass@localhost:5432/jobtinder` |
| `DATABASE_URL_TEST` | PostgreSQL test | `postgresql://user:pass@localhost:5433/jobtinder_test` |
| `JWT_SECRET` | Assinatura dos tokens JWT | `mude-em-producao` |
| `ALLOWED_ORIGINS` | CORS (opcional) | `http://localhost:3001` |
| `NEO4J_URI` | Endereço do Neo4j | `bolt://localhost:7687` |
| `NEO4J_USER` | Usuário Neo4j | `neo4j` |
| `NEO4J_PASSWORD` | Senha Neo4j | `password` |
