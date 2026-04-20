import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser } from '../helpers/factories'

describe('Candidate Routes — Integration', () => {
  // ── 401 unauthenticated access ─────────────────────────────────────────

  it('401 para requisição sem Authorization header', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server)
      .get('/candidates/me')

    expect(response.status).toBe(401)
    await app.close()
  })

  // Helper: registra um candidato e retorna o accessToken
  async function loginAsCandidate(app: Awaited<ReturnType<typeof buildApp>>, email?: string): Promise<string> {
    const userEmail = email ?? `candidate-${Date.now()}@test.com`
    const res = await supertest(app.server)
      .post('/auth/register')
      .send({ email: userEmail, password: 'password123', role: 'CANDIDATE' })
    return res.body.accessToken
  }

  // Helper: registra um recruiter e retorna o accessToken
  async function loginAsRecruiter(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
    const res = await supertest(app.server)
      .post('/auth/register')
      .send({ email: `recruiter-${Date.now()}@test.com`, password: 'password123', role: 'RECRUITER' })
    return res.body.accessToken
  }

  const validBody = {
    name: 'Test Candidate',
    professionId: 'backend-dev',
    skills: ['Node.js', 'TypeScript'],
    preferredModalities: ['REMOTE'],
  }

  // ── PUT /candidates/me ────────────────────────────────────────────────

  describe('PUT /candidates/me', () => {
    it('200 e perfil criado para CANDIDATE com body válido', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsCandidate(app)
      const response = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe('Test Candidate')
      expect(response.body.professionId).toBe('backend-dev')

      await app.close()
    })

    it('200 e searchRadiusKm: 30 quando enviado no body', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsCandidate(app)
      const response = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, searchRadiusKm: 30 })

      expect(response.status).toBe(200)
      expect(response.body.searchRadiusKm).toBe(30)

      await app.close()
    })

    it('200 e salaryExpectation: 8000 quando enviado no body', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsCandidate(app)
      const response = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, salaryExpectation: 8000 })

      expect(response.status).toBe(200)
      expect(response.body.salaryExpectation).toBe(8000)

      await app.close()
    })

    it('403 para usuário com role RECRUITER', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsRecruiter(app)
      const response = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      expect(response.status).toBe(403)

      await app.close()
    })

    it('400 quando name está ausente (Zod validation)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsCandidate(app)
      const { name: _name, ...bodyWithoutName } = validBody
      const response = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send(bodyWithoutName)

      expect(response.status).toBe(400)

      await app.close()
    })

    it('200 em ambas as chamadas — upsert idempotente', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const email = `idempotent-${Date.now()}@test.com`
      const token = await loginAsCandidate(app, email)

      const first = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      const second = await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, name: 'Updated Name' })

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body.name).toBe('Updated Name')

      await app.close()
    })
  })

  // ── GET /candidates/me ────────────────────────────────────────────────

  describe('GET /candidates/me', () => {
    it('200 e perfil para CANDIDATE que possui perfil', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsCandidate(app)

      // Primeiro cria o perfil via PUT
      await supertest(app.server)
        .put('/candidates/me')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)

      const response = await supertest(app.server)
        .get('/candidates/me')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe('Test Candidate')

      await app.close()
    })

    it('404 quando CANDIDATE ainda não possui perfil', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()

      const token = await loginAsCandidate(app)
      const response = await supertest(app.server)
        .get('/candidates/me')
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(404)

      await app.close()
    })
  })
})
