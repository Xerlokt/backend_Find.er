import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/infrastructure/database/prisma'

describe('Admin Routes — Integration', () => {
  // Helper: login de um usuário e retorna accessToken
  async function loginUser(app: Awaited<ReturnType<typeof buildApp>>, email: string, password = 'password123') {
    const response = await supertest(app.server)
      .post('/auth/login')
      .send({ email, password })
    return response.body.accessToken as string
  }

  // ── GET /admin/users ──────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('200 com array e paginação para usuário ADMIN', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const admin = await createUser({ role: 'ADMIN', email: 'admin@test.com', passwordHash })
      const token = await loginUser(app, admin.email)

      // Criar alguns usuários
      await createUser({ email: 'u1@test.com' })
      await createUser({ email: 'u2@test.com' })

      const response = await supertest(app.server)
        .get('/admin/users')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThanOrEqual(1)

      await app.close()
    })

    it('resposta NÃO contém passwordHash ou googleId nos objetos retornados', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const admin = await createUser({ role: 'ADMIN', email: 'admin2@test.com', passwordHash })
      const token = await loginUser(app, admin.email)

      await createUser({ email: 'user-for-check@test.com' })

      const response = await supertest(app.server)
        .get('/admin/users')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      for (const user of response.body) {
        expect(user).not.toHaveProperty('passwordHash')
        expect(user).not.toHaveProperty('googleId')
      }

      await app.close()
    })

    it('403 para usuário com role RECRUITER', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const recruiter = await createUser({ role: 'RECRUITER', email: 'recruiter-admin@test.com', passwordHash })
      const token = await loginUser(app, recruiter.email)

      const response = await supertest(app.server)
        .get('/admin/users')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(403)

      await app.close()
    })

    it('403 para usuário com role CANDIDATE', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const candidate = await createUser({ role: 'CANDIDATE', email: 'candidate-admin@test.com', passwordHash })
      const token = await loginUser(app, candidate.email)

      const response = await supertest(app.server)
        .get('/admin/users')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(403)

      await app.close()
    })

    it('retorna no máximo 2 usuários com ?page=1&limit=2 quando existem 3+ usuários', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const admin = await createUser({ role: 'ADMIN', email: 'admin3@test.com', passwordHash })
      const token = await loginUser(app, admin.email)

      // Criar 3 usuários adicionais (além do admin)
      await createUser({ email: 'p1@test.com' })
      await createUser({ email: 'p2@test.com' })
      await createUser({ email: 'p3@test.com' })

      const response = await supertest(app.server)
        .get('/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeLessThanOrEqual(2)

      await app.close()
    })
  })

  // ── GET /admin/users/:id ──────────────────────────────────────────────

  describe('GET /admin/users/:id', () => {
    it('200 com usuário único para ADMIN', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const admin = await createUser({ role: 'ADMIN', email: 'admin4@test.com', passwordHash })
      const token = await loginUser(app, admin.email)

      const targetUser = await createUser({ email: 'target@test.com' })

      const response = await supertest(app.server)
        .get(`/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('id', targetUser.id)
      expect(response.body).toHaveProperty('email', targetUser.email)
      expect(response.body).not.toHaveProperty('passwordHash')
      expect(response.body).not.toHaveProperty('googleId')

      await app.close()
    })

    it('404 para id de usuário inexistente', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const admin = await createUser({ role: 'ADMIN', email: 'admin5@test.com', passwordHash })
      const token = await loginUser(app, admin.email)

      const response = await supertest(app.server)
        .get('/admin/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(404)

      await app.close()
    })
  })

  // ── PATCH /admin/companies/:id/credits ────────────────────────────────

  describe('PATCH /admin/companies/:id/credits', () => {
    it('200 e empresa com credits: 50 após grant de { amount: 50 }', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const admin = await createUser({ role: 'ADMIN', email: 'admin6@test.com', passwordHash })
      const token = await loginUser(app, admin.email)

      const company = await createCompany({ credits: 0 })

      const response = await supertest(app.server)
        .patch(`/admin/companies/${company.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50 })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('credits', 50)

      await app.close()
    })

    it('403 para usuário com role RECRUITER', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const recruiter = await createUser({ role: 'RECRUITER', email: 'recruiter-credits@test.com', passwordHash })
      const token = await loginUser(app, recruiter.email)

      const company = await createCompany()

      const response = await supertest(app.server)
        .patch(`/admin/companies/${company.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50 })

      expect(response.status).toBe(403)

      await app.close()
    })
  })

  // ── GET /admin/companies/:id/transactions ─────────────────────────────

  describe('GET /admin/companies/:id/transactions', () => {
    it('200 retorna lista de transações da empresa', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const adminUser = await createUser({ role: 'ADMIN', email: `admin-txn-${Date.now()}@test.com`, passwordHash: await bcrypt.hash('password123', 12) })
      const adminToken = await loginUser(app, adminUser.email)
      const company = await createCompany({ credits: 10 })
      // Grant credits to create a transaction
      await supertest(app.server)
        .patch(`/admin/companies/${company.id}/credits`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 5 })

      const res = await supertest(app.server)
        .get(`/admin/companies/${company.id}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThanOrEqual(1)
      expect(res.body[0].reason).toBe('admin_grant')
      await app.close()
    })

    it('200 retorna array vazio quando não há transações', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const adminUser = await createUser({ role: 'ADMIN', email: `admin-empty-${Date.now()}@test.com`, passwordHash: await bcrypt.hash('password123', 12) })
      const adminToken = await loginUser(app, adminUser.email)
      const company = await createCompany()

      const res = await supertest(app.server)
        .get(`/admin/companies/${company.id}/transactions`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBe(0)
      await app.close()
    })

    it('403 quando usuário não é ADMIN', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const passwordHash = await bcrypt.hash('password123', 12)
      const recUser = await createUser({ role: 'RECRUITER', email: `rec-txn-${Date.now()}@test.com`, passwordHash })
      const recToken = await loginUser(app, recUser.email)
      const company = await createCompany()

      const res = await supertest(app.server)
        .get(`/admin/companies/${company.id}/transactions`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(403)
      await app.close()
    })
  })
})
