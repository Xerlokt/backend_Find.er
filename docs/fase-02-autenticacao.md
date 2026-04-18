# Fase 02 — Autenticação

## O que foi construído

Sistema completo de autenticação JWT com refresh token rotation, proteção contra enumeração de usuários, rate limiting por rota, e login via Google OAuth2.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/modules/auth/auth.repository.ts` | Queries Prisma para User e RefreshToken |
| `src/modules/auth/auth.service.ts` | Regras de negócio: register, login, refresh, logout, loginWithGoogle |
| `src/modules/auth/auth.routes.ts` | Rotas Fastify com Zod validation e rate limits |
| `src/shared/plugins/rate-limit.ts` | Plugin `@fastify/rate-limit` registrado globalmente |
| `prisma/schema.prisma` | Model `RefreshToken` adicionado |
| `tests/unit/auth.service.test.ts` | 9 testes unitários (sem DB) |
| `tests/integration/auth.test.ts` | 14 testes de integração (contra DB real) |

---

## Por que foi feito assim

### JWT com access token curto (15 min) + refresh token

Access tokens expiram rápido para limitar o dano se forem roubados. O refresh token vive 7 dias no banco e é trocado a cada uso (rotação single-use). Se alguém roubar um refresh token antigo e tentar reusar, o sistema detecta o replay e **revoga toda a família de tokens** — forçando o usuário a logar novamente em todos os dispositivos.

### DUMMY_HASH no login

Quando um email não existe no banco, o sistema ainda executa `bcrypt.compare` contra um hash pré-computado em vez de retornar imediatamente. Isso garante que o tempo de resposta seja o mesmo independente de o email existir ou não — impedindo que um atacante descubra quais emails estão cadastrados medindo o tempo da resposta (timing side-channel).

### Transações atômicas nos fluxos multi-step

Três operações críticas são executadas dentro de `prisma.$transaction`:

- **findOrCreateGoogleUser** — busca por googleId → busca por email → cria usuário. Sem transação, duas requisições simultâneas poderiam criar usuários duplicados.
- **refresh** — revogação do token antigo e criação do novo acontecem numa operação atômica. Sem isso, dois refreshes simultâneos do mesmo token gerariam dois tokens válidos (double-spend).

### Rate limiting por rota

| Rota | Limite |
|------|--------|
| `POST /auth/register` | 3 req/min |
| `POST /auth/login` | 5 req/min |
| `POST /auth/google` | 5 req/min |
| `POST /auth/refresh` | 10 req/min |
| Global | 60 req/min |

Ataques de força bruta precisam de milhares de tentativas — limitar a 5/min torna isso inviável.

### Google OAuth2

O cliente envia o `idToken` obtido do SDK do Google para o backend. O backend verifica a assinatura criptográfica usando `google-auth-library` (não confia no token cegamente). Se o usuário já existe pelo `googleId` ou pelo email, é retornado; caso contrário, um novo usuário é criado.

---

## Endpoints

### `POST /auth/register`

Cria um novo usuário e retorna um par de tokens.

```http
POST /auth/register
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "MinhaSenh@123",
  "role": "CANDIDATE"  // ou "RECRUITER"
}
```

**Resposta 201:**
```json
{
  "accessToken": "<jwt válido por 15 minutos>",
  "refreshToken": "<hex 64 chars>"
}
```

**Erros:**
- `409 CONFLICT` — email já cadastrado
- `429 Too Many Requests` — mais de 3 tentativas por minuto

---

### `POST /auth/login`

Autentica email + senha.

```http
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "MinhaSenh@123"
}
```

**Resposta 200:** mesmo formato do register.

**Erros:**
- `401 INVALID_CREDENTIALS` — email não existe ou senha errada (mesma mensagem para não vazar qual dos dois falhou)

---

### `POST /auth/refresh`

Troca um refresh token por um novo par de tokens. O token antigo é invalidado imediatamente.

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "<token recebido no login ou register>"
}
```

**Resposta 200:**
```json
{
  "accessToken": "<novo jwt>",
  "refreshToken": "<novo token — o antigo não funciona mais>"
}
```

**Erros:**
- `401 TOKEN_EXPIRED` — token revogado, expirado, ou replay detectado

> **Atenção:** Se um token já usado for apresentado novamente, **toda a família é revogada**. O usuário precisará fazer login novamente.

---

### `POST /auth/logout`

Revoga o refresh token (e toda a família de tokens da sessão).

```http
POST /auth/logout
Content-Type: application/json

{
  "refreshToken": "<token da sessão>"
}
```

**Resposta:** `204 No Content`

A operação é idempotente — chamar com um token já revogado também retorna 204.

---

### `POST /auth/google`

Login via Google. O frontend obtém um `idToken` do Google e envia para o backend.

```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "<ID token obtido do Google SDK>",
  "role": "CANDIDATE"  // ou "RECRUITER" — obrigatório no primeiro login
}
```

**Resposta 200:** mesmo formato do register.

**Erros:**
- `401 INVALID_CREDENTIALS` — token Google inválido ou expirado

---

## Como testar manualmente

> Pré-requisitos: Docker rodando (`docker compose up -d`), servidor iniciado (`npm run dev`).

### 1. Registrar usuário

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"teste@exemplo.com\",\"password\":\"Test1234!\",\"role\":\"CANDIDATE\"}"
```

Esperado: `201` com `accessToken` e `refreshToken`.

### 2. Login

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"teste@exemplo.com\",\"password\":\"Test1234!\"}"
```

### 3. Refresh (substitua `<TOKEN>` pelo refreshToken do passo 2)

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/refresh -H "Content-Type: application/json" -d "{\"refreshToken\":\"<TOKEN>\"}"
```

### 4. Replay attack — reusar o token antigo após o refresh

```cmd
curl -s -o - -w "\nHTTP %{http_code}" -X POST http://127.0.0.1:3000/auth/refresh -H "Content-Type: application/json" -d "{\"refreshToken\":\"<TOKEN_ANTIGO>\"}"
```

Esperado: `401 TOKEN_EXPIRED`.

### 5. Logout

```cmd
curl -s -o - -w "\nHTTP %{http_code}" -X POST http://127.0.0.1:3000/auth/logout -H "Content-Type: application/json" -d "{\"refreshToken\":\"<TOKEN>\"}"
```

Esperado: `204`.

### 6. Rate limit (registrar 4x seguido)

```cmd
curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"a1@x.com\",\"password\":\"Test1234!\",\"role\":\"CANDIDATE\"}" & curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"a2@x.com\",\"password\":\"Test1234!\",\"role\":\"CANDIDATE\"}" & curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"a3@x.com\",\"password\":\"Test1234!\",\"role\":\"CANDIDATE\"}" & curl -s -X POST http://127.0.0.1:3000/auth/register -H "Content-Type: application/json" -d "{\"email\":\"a4@x.com\",\"password\":\"Test1234!\",\"role\":\"CANDIDATE\"}"
```

Esperado: as 3 primeiras retornam `201`, a 4ª retorna `429` com `retryAfter`.

---

## Rodar os testes automatizados

```bash
# Unitários (sem Docker)
npx jest tests/unit/auth.service.test.ts

# Integração (requer Docker + DB)
npx jest tests/integration/auth.test.ts --runInBand
```

---

## Variáveis de ambiente necessárias

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Conexão PostgreSQL (produção) |
| `DATABASE_URL_TEST` | Conexão PostgreSQL (testes) |
| `JWT_SECRET` | Chave de assinatura dos access tokens |
| `GOOGLE_CLIENT_ID` | Client ID do Google Cloud Console (apenas para OAuth2 real) |
