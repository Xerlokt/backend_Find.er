import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/infrastructure/database/prisma'

const PASSWORD = 'password123'

// Helper: faz login e retorna accessToken
async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const response = await supertest(app.server)
    .post('/auth/login')
    .send({ email, password })
  return response.body.accessToken as string
}

// Helper: cria RECRUITER user + recruiterProfile e retorna { user, profile, token }
async function createRecruiterWithProfile(
  app: Awaited<ReturnType<typeof buildApp>>,
  companyId: string,
  emailSuffix: string,
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await createUser({
    role: 'RECRUITER',
    email: `recruiter-${emailSuffix}@test.com`,
    passwordHash,
  })
  const profile = await prisma.recruiterProfile.create({
    data: { userId: user.id, companyId },
  })
  const token = await loginUser(app, user.email)
  return { user, profile, token }
}

// Corpo válido de criação de vaga — companyId NOT included (derived from recruiter profile server-side)
function buildValidJobBody() {
  return {
    title: 'Senior Backend Dev',
    description: 'We need a senior backend developer',
    professionId: 'backend-dev',
    modality: 'REMOTE',
    requiredSkills: ['Node.js', 'TypeScript'],
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /jobs', () => {
  it('201 cria vaga quando RECRUITER envia body válido', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'post-201')

    const response = await supertest(app.server)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(buildValidJobBody())

    expect(response.status).toBe(201)
    expect(response.body).toHaveProperty('id')
    expect(response.body).toHaveProperty('recruiterId')
    await app.close()
  })

  it('400 quando campo obrigatório title está ausente', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'post-400-title')

    const body = buildValidJobBody()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).title

    const response = await supertest(app.server)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(body)

    expect(response.status).toBe(400)
    await app.close()
  })

  it('400 quando requiredSkills é array vazio', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'post-400-skills')

    const body = { ...buildValidJobBody(), requiredSkills: [] }

    const response = await supertest(app.server)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(body)

    expect(response.status).toBe(400)
    await app.close()
  })

  it('401 quando não há Authorization header', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server)
      .post('/jobs')
      .send(buildValidJobBody())

    expect(response.status).toBe(401)
    await app.close()
  })

  it('201 ignora companyId injetado no body — usa company do perfil do recruiter', async () => {
    // Exploit path: recruiter sends a foreign companyId in body; server must ignore it
    // and create the job under the recruiter's actual company (IDOR prevention — CR-01)
    const app = await buildApp({ testing: true })
    await app.ready()

    const recruiterCompany = await createCompany()
    const foreignCompany = await createCompany()
    const { token } = await createRecruiterWithProfile(app, recruiterCompany.id, 'idor-exploit')

    const response = await supertest(app.server)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...buildValidJobBody(), companyId: foreignCompany.id })

    expect(response.status).toBe(201)
    // injected foreign companyId must be ignored; job belongs to recruiter's real company
    expect(response.body.companyId).toBe(recruiterCompany.id)
    expect(response.body.companyId).not.toBe(foreignCompany.id)
    await app.close()
  })

  it('403 quando CANDIDATE chama o endpoint', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const passwordHash = await bcrypt.hash(PASSWORD, 12)
    const candidate = await createUser({
      role: 'CANDIDATE',
      email: 'candidate-post-403@test.com',
      passwordHash,
    })
    const token = await loginUser(app, candidate.email)

    const response = await supertest(app.server)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(buildValidJobBody())

    expect(response.status).toBe(403)
    await app.close()
  })

  it('403 quando ADMIN chama o endpoint', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const passwordHash = await bcrypt.hash(PASSWORD, 12)
    const admin = await createUser({
      role: 'ADMIN',
      email: 'admin-post-403@test.com',
      passwordHash,
    })
    const token = await loginUser(app, admin.email)

    const response = await supertest(app.server)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(buildValidJobBody())

    expect(response.status).toBe(403)
    await app.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs/mine', () => {
  it('200 retorna apenas as vagas do recruiter autenticado', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile: profile1, token: token1 } = await createRecruiterWithProfile(app, company.id, 'mine-r1')
    const { profile: profile2 } = await createRecruiterWithProfile(app, company.id, 'mine-r2')

    // recruiter1 tem 2 vagas; recruiter2 tem 1
    await createJob(company.id, profile1.id)
    await createJob(company.id, profile1.id)
    await createJob(company.id, profile2.id)

    const response = await supertest(app.server)
      .get('/jobs/mine')
      .set('Authorization', `Bearer ${token1}`)

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body).toHaveLength(2)
    await app.close()
  })

  it('200 retorna array vazio quando recruiter não tem vagas', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'mine-empty')

    const response = await supertest(app.server)
      .get('/jobs/mine')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
    await app.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs/:id', () => {
  it('200 retorna vaga com rankings: [] placeholder', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile, token } = await createRecruiterWithProfile(app, company.id, 'get-id-200')
    const job = await createJob(company.id, profile.id)

    const response = await supertest(app.server)
      .get(`/jobs/${job.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('id', job.id)
    expect(response.body).toHaveProperty('rankings')
    expect(Array.isArray(response.body.rankings)).toBe(true)
    expect(response.body.rankings).toEqual([])
    await app.close()
  })

  it('404 quando vaga não existe', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'get-id-404')

    const response = await supertest(app.server)
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(404)
    await app.close()
  })

  it('200 retorna vaga quando CANDIDATE autentica (qualquer usuário autenticado pode ler)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile } = await createRecruiterWithProfile(app, company.id, 'get-id-candidate-200')
    const job = await createJob(company.id, profile.id)

    const passwordHash = await bcrypt.hash(PASSWORD, 12)
    const candidate = await createUser({
      role: 'CANDIDATE',
      email: 'candidate-get-id-200@test.com',
      passwordHash,
    })
    const candidateToken = await loginUser(app, candidate.email)

    const response = await supertest(app.server)
      .get(`/jobs/${job.id}`)
      .set('Authorization', `Bearer ${candidateToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('id', job.id)
    expect(response.body).toHaveProperty('rankings')
    expect(Array.isArray(response.body.rankings)).toBe(true)
    await app.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /jobs/:id', () => {
  it('200 atualiza título quando recruiter é dono da vaga', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile, token } = await createRecruiterWithProfile(app, company.id, 'patch-200')
    const job = await createJob(company.id, profile.id)

    const response = await supertest(app.server)
      .patch(`/jobs/${job.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('title', 'Updated Title')
    await app.close()
  })

  it('403 quando recruiter2 tenta atualizar vaga do recruiter1', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile: profile1 } = await createRecruiterWithProfile(app, company.id, 'patch-403-r1')
    const { token: token2 } = await createRecruiterWithProfile(app, company.id, 'patch-403-r2')
    const job = await createJob(company.id, profile1.id)

    const response = await supertest(app.server)
      .patch(`/jobs/${job.id}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ title: 'Hacked Title' })

    expect(response.status).toBe(403)
    await app.close()
  })

  it('404 quando vaga não existe', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'patch-404')

    const response = await supertest(app.server)
      .patch('/jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Whatever' })

    expect(response.status).toBe(404)
    await app.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /jobs/:id/deactivate', () => {
  it('200 define isActive=false quando recruiter é dono da vaga', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile, token } = await createRecruiterWithProfile(app, company.id, 'delete-200')
    const job = await createJob(company.id, profile.id, { isActive: true })

    const response = await supertest(app.server)
      .delete(`/jobs/${job.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('isActive', false)
    await app.close()
  })

  it('403 quando recruiter2 tenta desativar vaga do recruiter1', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile: profile1 } = await createRecruiterWithProfile(app, company.id, 'delete-403-r1')
    const { token: token2 } = await createRecruiterWithProfile(app, company.id, 'delete-403-r2')
    const job = await createJob(company.id, profile1.id)

    const response = await supertest(app.server)
      .delete(`/jobs/${job.id}/deactivate`)
      .set('Authorization', `Bearer ${token2}`)

    expect(response.status).toBe(403)
    await app.close()
  })
})
