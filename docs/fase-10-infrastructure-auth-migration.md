# Fase 10 — Infrastructure + Auth Migration (v2.0)

## O que foi construído

Camada de infraestrutura (singletons de banco, plugins Fastify, sistema de rotas) e primeiro módulo migrado para Clean Architecture: autenticação completa com JWT, refresh tokens e Google OAuth2.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/infrastructure/database/prisma.ts` | Singleton do Prisma Client |
| `src/infrastructure/database/neo4j.ts` | Singleton do driver Neo4j |
| `src/infrastructure/http/app.ts` | `buildApp()` — registro de plugins e rotas |
| `src/infrastructure/http/plugins/authenticate.hook.ts` | Hook de autenticação JWT |
| `src/infrastructure/http/plugins/cors.plugin.ts` | CORS via `@fastify/cors` |
| `src/infrastructure/http/plugins/helmet.plugin.ts` | Security headers via `@fastify/helmet` |
| `src/infrastructure/http/plugins/jwt.plugin.ts` | JWT via `@fastify/jwt` (module augmentation) |
| `src/infrastructure/http/plugins/rate-limit.plugin.ts` | Rate limiting via `@fastify/rate-limit` |
| `src/application/use-cases/auth/` | RegisterUseCase, LoginUseCase, LogoutUseCase, RefreshTokenUseCase, LoginWithGoogleUseCase |
| `src/adapters/services/bcrypt.adapter.ts` | `BcryptAdapter` implementando `IHashPort` |
| `src/adapters/services/jwt.adapter.ts` | `JwtAdapter` implementando `ITokenPort` |
| `src/adapters/repositories/user.repository.ts` | `UserRepository` implementando `IUserRepository` |
| `src/adapters/repositories/refresh-token.repository.ts` | `RefreshTokenRepository` |
| `src/adapters/controllers/auth.controller.ts` | Parse Zod + chama use case + mapeia erros |
| `src/infrastructure/http/routes/auth.routes.ts` | Registro das rotas `/auth/*` |
| `prisma.config.ts` | Datasource URL para Prisma v7 |

---

## Por que foi feito assim

### `prisma.config.ts` separado do schema

O Prisma v7 não aceita `url` diretamente no bloco `datasource` do `schema.prisma` — a URL deve vir de `prisma.config.ts`. Isso é uma breaking change do v7.

### FastifyJWT module augmentation

O typing de `request.user` é feito via module augmentation no `jwt.plugin.ts`:

```typescript
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { sub: string; role: string };
  }
}
```

Usar `FastifyRequest` diretamente causaria conflito com a declaração existente de `user` do `@fastify/jwt`.

### Use cases com Ports, não implementações concretas

`RegisterUseCase` recebe `IHashPort` e `IUserRepository` — nunca importa `BcryptAdapter` ou `UserRepository` diretamente. A injeção de dependência acontece no composition root (`src/app.ts`).

---

## Rodar os testes

```bash
npm run test:unit         # unit tests de RegisterUseCase, LoginUseCase etc.
npm run test:integration  # tests/integration/auth.test.ts (real Docker DB)
```
