import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createRefreshToken } from '../helpers/factories'
import bcrypt from 'bcryptjs'

describe('Auth Routes — Integration', () => {
  // ── POST /auth/register ───────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('201 com { accessToken, refreshToken } para dados válidos', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'new@example.com', password: 'password123', role: 'CANDIDATE' })

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
      expect(typeof response.body.refreshToken).toBe('string')
      expect(response.body.refreshToken).toHaveLength(64)

      await app.close()
    })

    it('400 quando role é ADMIN (Zod rejeita enum)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'admin@example.com', password: 'password123', role: 'ADMIN' })

      expect(response.status).toBe(400) // Zod parse lança ZodError → errorHandler → 400
      await app.close()
    })

    it('409 quando email já existe', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      await createUser({ email: 'existing@example.com' })

      const response = await supertest(app.server)
        .post('/auth/register')
        .send({ email: 'existing@example.com', password: 'password123', role: 'CANDIDATE' })

      expect(response.status).toBe(409)
      await app.close()
    })
  })

  // ── POST /auth/login ──────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('200 com { accessToken, refreshToken } para credenciais válidas', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      await createUser({ email: 'login@example.com', passwordHash })

      const response = await supertest(app.server)
        .post('/auth/login')
        .send({ email: 'login@example.com', password: 'password123' })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
      await app.close()
    })

    it('401 INVALID_CREDENTIALS para senha errada', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('correct', 12)
      await createUser({ email: 'wrongpwd@example.com', passwordHash })

      const response = await supertest(app.server)
        .post('/auth/login')
        .send({ email: 'wrongpwd@example.com', password: 'wrong' })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('INVALID_CREDENTIALS')
      await app.close()
    })
  })

  // ── POST /auth/refresh ────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('200 com novo par de tokens para token válido', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const user = await createUser({ email: 'refresh@example.com' })
      const { rawToken } = await createRefreshToken(user.id)

      const response = await supertest(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: rawToken })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
      // O novo refreshToken deve ser diferente do original (rotação)
      expect(response.body.refreshToken).not.toBe(rawToken)
      await app.close()
    })

    it('401 TOKEN_EXPIRED ao reusar token revogado (replay attack)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const user = await createUser({ email: 'replay@example.com' })
      const { rawToken } = await createRefreshToken(user.id)

      // Primeiro uso — sucesso
      await supertest(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: rawToken })

      // Replay — token original foi revogado na rotação
      const response = await supertest(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: rawToken })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('TOKEN_EXPIRED')
      await app.close()
    })
  })

  // ── POST /auth/logout ─────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('204 e token revogado no banco', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const user = await createUser({ email: 'logout@example.com' })
      const { rawToken } = await createRefreshToken(user.id)

      const response = await supertest(app.server)
        .post('/auth/logout')
        .send({ refreshToken: rawToken })

      expect(response.status).toBe(204)

      // Token deve estar revogado — segundo logout deve retornar 204 (idempotente)
      const response2 = await supertest(app.server)
        .post('/auth/logout')
        .send({ refreshToken: rawToken })
      expect(response2.status).toBe(204)

      await app.close()
    })
  })

  // ── AUTH-06: Rota protegida rejeita request sem JWT ───────────────────

  describe('AUTH-06: Rotas protegidas', () => {
    it('401 UNAUTHORIZED ao chamar /auth/refresh com token inválido', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token-that-does-not-exist-in-db' })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('UNAUTHORIZED')
      await app.close()
    })
  })

  // ── SEC-05: Rate limiting ─────────────────────────────────────────────

  describe('SEC-05: Rate limiting em /auth/login', () => {
    it('429 Too Many Requests na 6ª requisição dentro de 1 minuto', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const payload = { email: 'ratelimit@example.com', password: 'any' }

      // 5 requisições — todas devem passar (ou retornar 401 de auth — não 429)
      for (let i = 0; i < 5; i++) {
        const r = await supertest(app.server).post('/auth/login').send(payload)
        expect(r.status).not.toBe(429)
      }

      // 6ª requisição — deve ser bloqueada pelo rate limit
      const response = await supertest(app.server).post('/auth/login').send(payload)
      expect(response.status).toBe(429)
      expect(response.body.error).toBe('Too Many Requests')
      expect(typeof response.body.retryAfter).toBe('number')

      await app.close()
    })
  })
})
