import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany } from '../helpers/factories'
import bcrypt from 'bcryptjs'

describe('Recruiter Routes — Integration', () => {
  // ── 401 unauthenticated access ─────────────────────────────────────────

  it('401 para requisição sem Authorization header', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server)
      .get('/recruiters/me')

    expect(response.status).toBe(401)
    await app.close()
  })

  // Helper: login de um usuário e retorna accessToken
  async function loginUser(app: Awaited<ReturnType<typeof buildApp>>, email: string, password = 'password123') {
    const response = await supertest(app.server)
      .post('/auth/login')
      .send({ email, password })
    return response.body.accessToken as string
  }

  // ── PUT /recruiters/me ────────────────────────────────────────────────

  describe('PUT /recruiters/me', () => {
    it('200 com perfil criado quando RECRUITER fornece companyId válido', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'RECRUITER', email: 'recruiter1@test.com', passwordHash })
      const company = await createCompany()
      const token = await loginUser(app, user.email)

      const response = await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: company.id })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('userId', user.id)
      expect(response.body).toHaveProperty('companyId', company.id)

      await app.close()
    })

    it('200 na segunda chamada com mesmo usuário (idempotência do upsert)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'RECRUITER', email: 'recruiter2@test.com', passwordHash })
      const company = await createCompany()
      const token = await loginUser(app, user.email)

      // Primeira chamada
      await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: company.id })

      // Segunda chamada — deve retornar 200 (upsert idempotente)
      const response = await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: company.id })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('userId', user.id)

      await app.close()
    })

    it('404 quando companyId não existe no banco', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'RECRUITER', email: 'recruiter3@test.com', passwordHash })
      const token = await loginUser(app, user.email)

      const response = await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: '00000000-0000-0000-0000-000000000000' })

      expect(response.status).toBe(404)

      await app.close()
    })

    it('403 para usuário com role CANDIDATE', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'CANDIDATE', email: 'candidate1@test.com', passwordHash })
      const company = await createCompany()
      const token = await loginUser(app, user.email)

      const response = await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: company.id })

      expect(response.status).toBe(403)

      await app.close()
    })

    it('403 para usuário com role ADMIN', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'ADMIN', email: 'admin1@test.com', passwordHash })
      const company = await createCompany()
      const token = await loginUser(app, user.email)

      const response = await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: company.id })

      expect(response.status).toBe(403)

      await app.close()
    })

    it('400 quando body não tem companyId (Zod rejeita UUID ausente)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'RECRUITER', email: 'recruiter4@test.com', passwordHash })
      const token = await loginUser(app, user.email)

      const response = await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(response.status).toBe(400)

      await app.close()
    })
  })

  // ── GET /recruiters/me ────────────────────────────────────────────────

  describe('GET /recruiters/me', () => {
    it('200 com perfil para RECRUITER com perfil existente', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'RECRUITER', email: 'recruiter5@test.com', passwordHash })
      const company = await createCompany()
      const token = await loginUser(app, user.email)

      // Criar perfil primeiro
      await supertest(app.server)
        .put('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyId: company.id })

      const response = await supertest(app.server)
        .get('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('userId', user.id)
      expect(response.body).toHaveProperty('companyId', company.id)

      await app.close()
    })

    it('404 para RECRUITER sem perfil', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const passwordHash = await bcrypt.hash('password123', 12)
      const user = await createUser({ role: 'RECRUITER', email: 'recruiter6@test.com', passwordHash })
      const token = await loginUser(app, user.email)

      const response = await supertest(app.server)
        .get('/recruiters/me')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(404)

      await app.close()
    })
  })
})
