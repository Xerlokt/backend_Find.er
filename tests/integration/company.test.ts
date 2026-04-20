import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany } from '../helpers/factories'

describe('Company Routes — Integration', () => {
  // ── 401 unauthenticated access ─────────────────────────────────────────

  it('401 para requisição sem Authorization header', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server)
      .get('/companies/00000000-0000-0000-0000-000000000000')

    expect(response.status).toBe(401)
    await app.close()
  })

  // Helper para login e obter token
  async function loginAs(email: string): Promise<string> {
    const app = await buildApp({ testing: true })
    await app.ready()
    const res = await supertest(app.server)
      .post('/auth/login')
      .send({ email, password: 'password123' })
    await app.close()
    return res.body.accessToken as string
  }

  // ── POST /companies ───────────────────────────────────────────────────

  describe('POST /companies', () => {
    it('201 com empresa criada para usuário ADMIN', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'TechCorp' })

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe('TechCorp')

      await app.close()
    })

    it('403 para usuário CANDIDATE', async () => {
      const candidate = await createUser({ role: 'CANDIDATE' })
      const token = await loginAs(candidate.email)

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'TechCorp' })

      expect(response.status).toBe(403)

      await app.close()
    })

    it('403 para usuário RECRUITER', async () => {
      const recruiter = await createUser({ role: 'RECRUITER' })
      const token = await loginAs(recruiter.email)

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'TechCorp' })

      expect(response.status).toBe(403)

      await app.close()
    })

    it('400 quando name está ausente (Zod rejeita)', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .post('/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({})

      expect(response.status).toBe(400)

      await app.close()
    })
  })

  // ── GET /companies/:id ─────────────────────────────────────────────────

  describe('GET /companies/:id', () => {
    it('200 com dados da empresa existente', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)
      const company = await createCompany({ name: 'Acme Corp' })

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .get(`/companies/${company.id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(company.id)
      expect(response.body.name).toBe('Acme Corp')

      await app.close()
    })

    it('404 para UUID inexistente', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .get('/companies/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(404)

      await app.close()
    })
  })

  // ── PATCH /companies/admin/:id/credits ────────────────────────────────

  describe('PATCH /companies/admin/:id/credits', () => {
    it('200 e empresa com credits: 100 após ajuste de 100 (partindo de 0)', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)
      const company = await createCompany({ name: 'Startup', credits: 0 })

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .patch(`/companies/admin/${company.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 })

      expect(response.status).toBe(200)
      expect(response.body.credits).toBe(100)

      await app.close()
    })

    it('403 para usuário RECRUITER', async () => {
      const recruiter = await createUser({ role: 'RECRUITER' })
      const token = await loginAs(recruiter.email)
      const company = await createCompany({ name: 'Startup' })

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .patch(`/companies/admin/${company.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 })

      expect(response.status).toBe(403)

      await app.close()
    })

    it('400 quando amount é 0 (Zod rejeita não-positivo)', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)
      const company = await createCompany({ name: 'Startup' })

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .patch(`/companies/admin/${company.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 0 })

      expect(response.status).toBe(400)

      await app.close()
    })

    it('400 quando amount é negativo (Zod rejeita não-positivo)', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const token = await loginAs(admin.email)
      const company = await createCompany({ name: 'PoorCorp', credits: 0 })

      const app = await buildApp({ testing: true })
      await app.ready()

      const response = await supertest(app.server)
        .patch(`/companies/admin/${company.id}/credits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: -50 })

      // amount negativo é rejeitado pelo Zod (positive() rejeita valores <= 0)
      expect(response.status).toBe(400)

      await app.close()
    })
  })
})
