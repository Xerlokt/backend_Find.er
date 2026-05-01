import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/shared/db/prisma'

const PASSWORD = 'password123'

async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const response = await supertest(app.server).post('/auth/login').send({ email, password })
  return response.body.accessToken as string
}

async function createCandidateWithProfile(
  app: Awaited<ReturnType<typeof buildApp>>,
  emailSuffix: string,
  opts: { lat?: number; lng?: number } = {},
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await createUser({ role: 'CANDIDATE', email: `cand-${emailSuffix}@test.com`, passwordHash })
  const profile = await prisma.candidateProfile.create({
    data: {
      userId: user.id,
      name: 'Test Candidate',
      professionId: 'backend-dev',
      skills: ['Node.js'],
      preferredModalities: ['REMOTE'],
      searchRadiusKm: 50,
      ...(opts.lat !== undefined ? { lat: opts.lat } : {}),
      ...(opts.lng !== undefined ? { lng: opts.lng } : {}),
    },
  })
  const token = await loginUser(app, user.email)
  return { user, profile, token }
}

async function createRecruiterWithProfile(
  app: Awaited<ReturnType<typeof buildApp>>,
  companyId: string,
  emailSuffix: string,
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await createUser({ role: 'RECRUITER', email: `rec-${emailSuffix}@test.com`, passwordHash })
  const profile = await prisma.recruiterProfile.create({ data: { userId: user.id, companyId } })
  const token = await loginUser(app, user.email)
  return { user, profile, token }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /swipes', () => {
  it('201 cria swipe quando CANDIDATE envia body válido com direction LIKE', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token, profile: candProfile } = await createCandidateWithProfile(app, 'post-201')
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'post-201-rec')
    const job = await createJob(company.id, recruiterProfile.id)
    const response = await supertest(app.server)
      .post('/swipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId: job.id, direction: 'LIKE' })
    expect(response.status).toBe(201)
    expect(response.body).toHaveProperty('id')
    expect(response.body.candidateId).toBe(candProfile.id)
    expect(response.body.direction).toBe('LIKE')
    await app.close()
  })

  it('409 DUPLICATE_SWIPE quando mesmo candidato swipa mesma vaga duas vezes', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createCandidateWithProfile(app, 'dup-swipe')
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'dup-swipe-rec')
    const job = await createJob(company.id, recruiterProfile.id)
    await supertest(app.server).post('/swipes').set('Authorization', `Bearer ${token}`).send({ jobId: job.id, direction: 'LIKE' })
    const response = await supertest(app.server).post('/swipes').set('Authorization', `Bearer ${token}`).send({ jobId: job.id, direction: 'DISLIKE' })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('DUPLICATE_SWIPE')
    await app.close()
  })

  it('403 quando RECRUITER tenta dar swipe', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'rec-403')
    const response = await supertest(app.server)
      .post('/swipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId: '00000000-0000-0000-0000-000000000001', direction: 'LIKE' })
    expect(response.status).toBe(403)
    await app.close()
  })

  it('401 quando sem token de autorização', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const response = await supertest(app.server).post('/swipes').send({ jobId: '00000000-0000-0000-0000-000000000001', direction: 'LIKE' })
    expect(response.status).toBe(401)
    await app.close()
  })

  it('400 quando direction é inválido', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createCandidateWithProfile(app, 'bad-dir')
    const response = await supertest(app.server)
      .post('/swipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId: '00000000-0000-0000-0000-000000000001', direction: 'MAYBE' })
    expect(response.status).toBe(400)
    await app.close()
  })

  it('404 quando job está inativo (isActive: false)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createCandidateWithProfile(app, 'inactive-job')
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'inactive-job-rec')
    const job = await createJob(company.id, recruiterProfile.id, { isActive: false })
    const response = await supertest(app.server)
      .post('/swipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId: job.id, direction: 'LIKE' })
    expect(response.status).toBe(404)
    await app.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs/feed', () => {
  it('200 retorna { data, nextCursor } com vagas ativas não swipadas', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createCandidateWithProfile(app, 'feed-200')
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'feed-200-rec')
    const job1 = await createJob(company.id, recruiterProfile.id, { isActive: true })
    const job2 = await createJob(company.id, recruiterProfile.id, { isActive: true })
    const response = await supertest(app.server)
      .get('/jobs/feed')
      .set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('data')
    expect(response.body).toHaveProperty('nextCursor')
    const ids = response.body.data.map((j: { id: string }) => j.id)
    expect(ids).toContain(job1.id)
    expect(ids).toContain(job2.id)
    await app.close()
  })

  it('exclui vagas já swipadas pelo candidato', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token, profile: candProfile } = await createCandidateWithProfile(app, 'feed-exclude')
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'feed-exclude-rec')
    const swipedJob = await createJob(company.id, recruiterProfile.id, { isActive: true })
    const freshJob = await createJob(company.id, recruiterProfile.id, { isActive: true })
    await createSwipe(candProfile.id, swipedJob.id, { direction: 'LIKE' })
    const response = await supertest(app.server)
      .get('/jobs/feed')
      .set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(200)
    const ids = response.body.data.map((j: { id: string }) => j.id)
    expect(ids).not.toContain(swipedJob.id)
    expect(ids).toContain(freshJob.id)
    await app.close()
  })

  it('403 quando RECRUITER acessa o feed', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createRecruiterWithProfile(app, company.id, 'feed-403-rec')
    const response = await supertest(app.server).get('/jobs/feed').set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(403)
    await app.close()
  })

  it('paginação cursor: segunda página não repete itens da primeira', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token } = await createCandidateWithProfile(app, 'feed-cursor')
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'feed-cursor-rec')
    // Create 3 jobs; request limit=2 to force pagination
    await createJob(company.id, recruiterProfile.id)
    await createJob(company.id, recruiterProfile.id)
    await createJob(company.id, recruiterProfile.id)
    const page1 = await supertest(app.server)
      .get('/jobs/feed?limit=2')
      .set('Authorization', `Bearer ${token}`)
    expect(page1.status).toBe(200)
    expect(page1.body.data).toHaveLength(2)
    expect(page1.body.nextCursor).not.toBeNull()
    const page2 = await supertest(app.server)
      .get(`/jobs/feed?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', `Bearer ${token}`)
    expect(page2.status).toBe(200)
    expect(page2.body.data).toHaveLength(1)
    // No overlap between page 1 and page 2
    const ids1 = page1.body.data.map((j: { id: string }) => j.id)
    const ids2 = page2.body.data.map((j: { id: string }) => j.id)
    expect(ids1.every((id: string) => !ids2.includes(id))).toBe(true)
    await app.close()
  })
})
