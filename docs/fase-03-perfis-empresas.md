# Fase 03 — Perfis & Empresas

## O que foi construído

Quatro módulos independentes que completam o cadastro de todos os atores da plataforma: candidatos criam perfis com expectativa salarial e raio de busca; admins cadastram empresas e gerenciam créditos; recruiters vinculam seus perfis a uma empresa existente; admins listam e visualizam usuários sem expor dados sensíveis.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `prisma/schema.prisma` | Campo `salaryExpectation Float?` adicionado ao model `CandidateProfile` |
| `prisma/migrations/20260419000000_add_candidate_salary_expectation/` | Migração que aplica o campo no banco |
| `src/modules/candidate/candidate.repository.ts` | `upsertProfile`, `findProfileByUserId` via Prisma |
| `src/modules/candidate/candidate.service.ts` | Delegação ao repositório; 404 quando perfil não existe |
| `src/modules/candidate/candidate.routes.ts` | `PUT /candidates/me`, `GET /candidates/me` |
| `src/modules/company/company.repository.ts` | `create`, `findById`, `adjustCredits` (atomic increment) |
| `src/modules/company/company.service.ts` | Guarda de saldo negativo (`INSUFFICIENT_CREDITS`) |
| `src/modules/company/company.routes.ts` | `POST /companies`, `GET /companies/:id`, `PATCH /companies/admin/:id/credits` |
| `src/modules/recruiter/recruiter.repository.ts` | `upsertProfile`, `findProfileByUserId`, `findCompanyById` (Prisma direto, sem import cross-module) |
| `src/modules/recruiter/recruiter.service.ts` | Valida FK da empresa antes do upsert |
| `src/modules/recruiter/recruiter.routes.ts` | `PUT /recruiters/me`, `GET /recruiters/me` |
| `src/modules/admin/admin.service.ts` | `listUsers`, `getUserById`, `adjustCredits` — thin service, sem classe repository |
| `src/modules/admin/admin.routes.ts` | `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/companies/:id/credits` |
| `tests/unit/candidate.service.test.ts` | 4 testes unitários (sem DB) |
| `tests/unit/company.service.test.ts` | 6 testes unitários |
| `tests/unit/recruiter.service.test.ts` | 4 testes unitários |
| `tests/integration/candidate.test.ts` | 8 testes de integração |
| `tests/integration/company.test.ts` | 10 testes de integração |
| `tests/integration/recruiter.test.ts` | 8 testes de integração |
| `tests/integration/admin.test.ts` | 9 testes de integração |

---

## Por que foi feito assim

### `userId` sempre vem do JWT, nunca do body

Todos os endpoints de perfil (`PUT /candidates/me`, `PUT /recruiters/me`) leem o `userId` de `request.user.id` — que é preenchido pelo hook `authenticate` após verificar a assinatura do JWT. O body nunca contém um campo `userId`.

Se o body pudesse definir o `userId`, qualquer usuário autenticado poderia escrever no perfil de outra pessoa simplesmente mandando o id da vítima no body. Isso é chamado de IDOR (Insecure Direct Object Reference).

### Upsert idempotente para criação e atualização de perfil

`prisma.candidateProfile.upsert({ where: { userId }, create: {...}, update: {...} })` — a mesma chamada tanto cria o perfil (primeira vez) quanto atualiza (segunda vez em diante). O cliente não precisa saber se o perfil já existe ou não: `PUT /candidates/me` sempre funciona e sempre retorna 200.

### Incremento atômico de créditos

O ajuste de créditos usa `prisma.$transaction` combinando o guard de saldo negativo e o `increment` numa única operação atômica. O `increment` é executado dentro do banco como uma instrução SQL — se dois requests simultâneos chegarem ao mesmo tempo, ambos aplicam seus deltas corretamente em vez de um sobrescrever o outro. O guard de saldo (`credits + delta < 0`) também fica dentro da transação, eliminando a condição de corrida entre leitura e escrita.

### Validação de FK antes do upsert do recruiter

Quando um recruiter tenta vincular seu perfil a uma empresa, o `RecruiterService` chama `repo.findCompanyById(data.companyId)` antes de executar o upsert. Se a empresa não existir, retorna `404 NOT_FOUND` imediatamente — em vez de deixar o Prisma explodir com um erro de foreign key constraint (que viria como 500).

O `RecruiterRepository` faz essa busca diretamente via `prisma.company.findUnique` sem importar o `CompanyRepository`. Importar o repositório de outro módulo violaria a regra de isolamento de módulos da arquitetura.

### Admin não usa classe repository

O `AdminService` importa o singleton `prisma` diretamente. As queries de admin (listar usuários, buscar por id) são read-only simples que não justificam uma camada extra de abstração. Manter thin é mais legível e fácil de manter.

### Campos sensíveis excluídos explicitamente

Todas as queries de usuário no `AdminService` usam `select: { id, email, role, avatarUrl, createdAt }`. Os campos `passwordHash` e `googleId` não aparecem no select — o Prisma não os retorna se não forem explicitamente listados, mas o select explícito garante que uma refatoração futura no model não vai acidentalmente expô-los.

### Dois endpoints de crédito (e por quê existem os dois)

| Endpoint | Localização | Guarda de saldo |
|----------|-------------|-----------------|
| `PATCH /companies/admin/:id/credits` | `companyRoutes` | Sim — verifica se `credits + delta >= 0` |
| `PATCH /admin/companies/:id/credits` | `adminRoutes` | Não — admin só adiciona (`amount` é sempre positivo via Zod) |

O primeiro pertence à lógica de negócio da empresa (débito de créditos na Phase 7). O segundo é o endpoint administrativo para concessão de créditos — como o admin só adiciona, o guard de saldo negativo não se aplica.

---

## Endpoints

### `PUT /candidates/me`

Cria ou atualiza o perfil do candidato autenticado. Idempotente.

```http
PUT /candidates/me
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Maria Silva",
  "bio": "Desenvolvedora fullstack com 5 anos de experiência",
  "lat": -23.5505,
  "lng": -46.6333,
  "professionId": "uuid-da-profissao",
  "skills": ["TypeScript", "Node.js", "React"],
  "preferredModalities": ["REMOTE", "HYBRID"],
  "salaryExpectation": 12000,
  "searchRadiusKm": 30
}
```

**Resposta 200:** perfil persistido completo.

**Erros:**
- `400` — campo obrigatório faltando ou tipo inválido (Zod)
- `401` — sem token ou token inválido
- `403 FORBIDDEN` — usuário não é CANDIDATE

---

### `GET /candidates/me`

Retorna o perfil do candidato autenticado.

```http
GET /candidates/me
Authorization: Bearer <accessToken>
```

**Resposta 200:** perfil completo.

**Erros:**
- `404 NOT_FOUND` — candidato ainda não criou perfil
- `401` / `403` — mesmos do PUT

---

### `POST /companies`

Cria uma nova empresa. Apenas ADMIN.

```http
POST /companies
Authorization: Bearer <accessToken de ADMIN>
Content-Type: application/json

{
  "name": "Acme Corp",
  "logoUrl": "https://exemplo.com/logo.png",
  "description": "Empresa de tecnologia"
}
```

**Resposta 201:** empresa criada com `credits: 0` e `plan: "FREE"`.

**Erros:**
- `400` — `name` faltando
- `403` — usuário não é ADMIN

---

### `GET /companies/:id`

Retorna os dados de uma empresa. Qualquer usuário autenticado.

```http
GET /companies/uuid-da-empresa
Authorization: Bearer <accessToken>
```

**Resposta 200:** dados da empresa.

**Erros:**
- `404 NOT_FOUND` — empresa não existe

---

### `PATCH /companies/admin/:id/credits`

Ajusta o saldo de créditos de uma empresa atomicamente. Apenas ADMIN. O `amount` deve ser positivo para crédito ou negativo para débito — o guard de saldo é aplicado dentro de `prisma.$transaction`.

```http
PATCH /companies/admin/uuid-da-empresa/credits
Authorization: Bearer <accessToken de ADMIN>
Content-Type: application/json

{
  "amount": 100
}
```

**Resposta 200:** empresa com saldo atualizado.

**Erros:**
- `400 INSUFFICIENT_CREDITS` — o delta causaria saldo negativo
- `400` — `amount` não é inteiro (Zod)
- `404 NOT_FOUND` — empresa não existe

---

### `PUT /recruiters/me`

Cria ou atualiza o perfil do recruiter vinculando-o a uma empresa existente.

```http
PUT /recruiters/me
Authorization: Bearer <accessToken de RECRUITER>
Content-Type: application/json

{
  "companyId": "uuid-da-empresa"
}
```

**Resposta 200:** perfil do recruiter persistido.

**Erros:**
- `400` — `companyId` não é UUID válido
- `403` — usuário não é RECRUITER
- `404 NOT_FOUND` — empresa com o `companyId` informado não existe

---

### `GET /recruiters/me`

Retorna o perfil do recruiter autenticado.

```http
GET /recruiters/me
Authorization: Bearer <accessToken de RECRUITER>
```

**Resposta 200:** perfil do recruiter.

**Erros:**
- `404 NOT_FOUND` — recruiter ainda não criou perfil

---

### `GET /admin/users`

Lista todos os usuários com paginação. Sem `passwordHash` ou `googleId` na resposta.

```http
GET /admin/users?page=1&limit=20
Authorization: Bearer <accessToken de ADMIN>
```

**Resposta 200:**
```json
[
  {
    "id": "uuid",
    "email": "usuario@exemplo.com",
    "role": "CANDIDATE",
    "avatarUrl": null,
    "createdAt": "2026-04-19T00:00:00.000Z"
  }
]
```

**Erros:**
- `403` — usuário não é ADMIN

---

### `GET /admin/users/:id`

Retorna um usuário específico pelo ID. Sem campos sensíveis.

```http
GET /admin/users/uuid-do-usuario
Authorization: Bearer <accessToken de ADMIN>
```

**Resposta 200:** objeto do usuário (mesmo formato da listagem).

**Erros:**
- `404 NOT_FOUND` — usuário não existe
- `403` — usuário não é ADMIN

---

### `PATCH /admin/companies/:id/credits`

Concede créditos a uma empresa. Apenas ADMIN. Sem guard de saldo (só adiciona).

```http
PATCH /admin/companies/uuid-da-empresa/credits
Authorization: Bearer <accessToken de ADMIN>
Content-Type: application/json

{
  "amount": 500
}
```

**Resposta 200:** empresa com créditos atualizados.

**Erros:**
- `400` — `amount` não é inteiro positivo
- `404 NOT_FOUND` — empresa não existe
- `403` — usuário não é ADMIN

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Criar um ADMIN (via seed direto — register não aceita role ADMIN)

```bash
# Via psql ou qualquer client SQL:
INSERT INTO "User" (id, email, "passwordHash", role, "createdAt")
VALUES (gen_random_uuid(), 'admin@test.com', '$2b$12$...', 'ADMIN', now());
```

Ou usando a factory nos testes:
```typescript
await createUser({ role: 'ADMIN', email: 'admin@test.com' })
```

### 2. Logar como ADMIN e criar empresa

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@test.com\",\"password\":\"password123\"}"
```

```cmd
curl -s -X POST http://127.0.0.1:3000/companies -H "Content-Type: application/json" -H "Authorization: Bearer <ADMIN_TOKEN>" -d "{\"name\":\"Acme Corp\"}"
```

### 3. Registrar candidato e criar perfil

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"candidato@test.com\",\"password\":\"Test1234!\",\"role\":\"CANDIDATE\"}"
```

```cmd
curl -s -X PUT http://127.0.0.1:3000/candidates/me -H "Content-Type: application/json" -H "Authorization: Bearer <CANDIDATE_TOKEN>" -d "{\"name\":\"Maria Silva\",\"professionId\":\"uuid\",\"skills\":[\"TypeScript\"],\"preferredModalities\":[\"REMOTE\"],\"salaryExpectation\":10000}"
```

### 4. Registrar recruiter e vincular à empresa

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"recruiter@test.com\",\"password\":\"Test1234!\",\"role\":\"RECRUITER\"}"
```

```cmd
curl -s -X PUT http://127.0.0.1:3000/recruiters/me -H "Content-Type: application/json" -H "Authorization: Bearer <RECRUITER_TOKEN>" -d "{\"companyId\":\"uuid-da-empresa\"}"
```

### 5. Conceder créditos à empresa

```cmd
curl -s -X PATCH http://127.0.0.1:3000/admin/companies/<COMPANY_ID>/credits -H "Content-Type: application/json" -H "Authorization: Bearer <ADMIN_TOKEN>" -d "{\"amount\":100}"
```

---

## Rodar os testes automatizados

```bash
# Unitários (sem Docker)
npm run test:unit

# Integração por módulo (requer Docker + DB)
npx jest tests/integration/candidate.test.ts --runInBand
npx jest tests/integration/company.test.ts --runInBand
npx jest tests/integration/recruiter.test.ts --runInBand
npx jest tests/integration/admin.test.ts --runInBand

# Todos de uma vez
npm run test:integration
```

**Resultado esperado:** 30 unit tests + 39 integration tests = 69 total passando.

> **Nota:** Os testes de integração não criam admin via `/auth/register` (Zod rejeita role ADMIN no register). Usam `createUser({ role: 'ADMIN' })` da factory e depois `POST /auth/login` para obter token.

