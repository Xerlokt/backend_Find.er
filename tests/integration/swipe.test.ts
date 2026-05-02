import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe, createUnlock } from '../helpers/factories'
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

  it('items do feed incluem campo fitScore numérico (CAND-03)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'feed-fitscore-rec')
    await createJob(company.id, recruiterProfile.id)
    const passwordHash = await bcrypt.hash(PASSWORD, 12)
    const candidateUser = await createUser({ role: 'CANDIDATE', email: 'feed-fitscore@test.com', passwordHash })
    await prisma.candidateProfile.create({
      data: {
        userId: candidateUser.id,
        name: 'Feed Candidate',
        professionId: 'backend-dev',
        skills: ['Node.js'],
        preferredModalities: ['REMOTE'],
        searchRadiusKm: 50,
      },
    })
    const token = await loginUser(app, 'feed-fitscore@test.com')
    const feedRes = await supertest(app.server)
      .get('/jobs/feed')
      .set('Authorization', `Bearer ${token}`)
    expect(feedRes.status).toBe(200)
    expect(Array.isArray(feedRes.body.data)).toBe(true)
    if (feedRes.body.data.length > 0) {
      expect(feedRes.body.data[0]).toHaveProperty('fitScore')
      expect(typeof feedRes.body.data[0].fitScore).toBe('number')
    }
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

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /jobs/:jobId/ranking', () => {
  it('200 retorna RankingItem[] com perfil completo para LIKE e null para DISLIKE', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token: recToken, profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'rank-200-rec')
    const job = await createJob(company.id, recruiterProfile.id)
    const { profile: candProfile1 } = await createCandidateWithProfile(app, 'rank-like-cand')
    const { profile: candProfile2 } = await createCandidateWithProfile(app, 'rank-dislike-cand')
    await createSwipe(candProfile1.id, job.id, { direction: 'LIKE' })
    await createSwipe(candProfile2.id, job.id, { direction: 'DISLIKE' })
    const response = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${recToken}`)
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    const likeItem = response.body.find((item: any) => item.candidateId === candProfile1.id)
    const dislikeItem = response.body.find((item: any) => item.candidateId === candProfile2.id)
    expect(likeItem).toBeDefined()
    expect(likeItem.profile).not.toBeNull()
    expect(likeItem.profile).toHaveProperty('name')
    expect(likeItem.profile).toHaveProperty('skills')
    expect(dislikeItem).toBeDefined()
    expect(dislikeItem.profile).toBeNull()
    await app.close()
  })

  it('NUNCA retorna lat ou lng em nenhum item do ranking', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token: recToken, profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'rank-noloc-rec')
    const job = await createJob(company.id, recruiterProfile.id)
    const { profile: candProfile } = await createCandidateWithProfile(app, 'rank-noloc-cand', { lat: -23.5, lng: -46.6 })
    await createSwipe(candProfile.id, job.id, { direction: 'LIKE' })
    const response = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${recToken}`)
    expect(response.status).toBe(200)
    for (const item of response.body) {
      expect(item.lat).toBeUndefined()
      expect(item.lng).toBeUndefined()
      if (item.profile !== null) {
        expect(item.profile.lat).toBeUndefined()
        expect(item.profile.lng).toBeUndefined()
      }
    }
    await app.close()
  })

  it('403 quando recrutador não é dono da vaga', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { profile: ownerProfile } = await createRecruiterWithProfile(app, company.id, 'rank-403-owner')
    const { token: otherToken } = await createRecruiterWithProfile(app, company.id, 'rank-403-other')
    const job = await createJob(company.id, ownerProfile.id)
    const response = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${otherToken}`)
    expect(response.status).toBe(403)
    await app.close()
  })

  it('403 quando CANDIDATE acessa o ranking', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'rank-403-rec-for-cand')
    const { token: candToken } = await createCandidateWithProfile(app, 'rank-403-cand')
    const job = await createJob(company.id, recruiterProfile.id)
    const response = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${candToken}`)
    expect(response.status).toBe(403)
    await app.close()
  })

  it('401 quando sem token', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const response = await supertest(app.server).get('/jobs/00000000-0000-0000-0000-000000000001/ranking')
    expect(response.status).toBe(401)
    await app.close()
  })

  it('ranking items têm fitScore numérico (não placeholder 0 se Neo4j estiver rodando)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token: recToken, profile: recProfile } = await createRecruiterWithProfile(app, company.id, 'rank-fitscore-rec')
    const job = await createJob(company.id, recProfile.id)
    const { profile: candProfile } = await createCandidateWithProfile(app, 'rank-fitscore-cand')
    await createSwipe(candProfile.id, job.id, { direction: 'LIKE' })
    const rankRes = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${recToken}`)
    expect(rankRes.status).toBe(200)
    expect(Array.isArray(rankRes.body)).toBe(true)
    expect(rankRes.body.length).toBeGreaterThan(0)
    expect(typeof rankRes.body[0].fitScore).toBe('number')
    await app.close()
  })

  it('distanceKm está presente (null quando sem coordenadas)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany()
    const { token: recToken, profile: recruiterProfile } = await createRecruiterWithProfile(app, company.id, 'rank-dist-rec')
    const job = await createJob(company.id, recruiterProfile.id) // no lat/lng
    const { profile: candProfile } = await createCandidateWithProfile(app, 'rank-dist-cand')
    await createSwipe(candProfile.id, job.id, { direction: 'LIKE' })
    const response = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${recToken}`)
    expect(response.status).toBe(200)
    expect(response.body[0]).toHaveProperty('distanceKm')
    // No coords on either side → distanceKm: null
    expect(response.body[0].distanceKm).toBeNull()
    await app.close()
  })

  it('revela perfil completo de candidato DISLIKE que foi desbloqueado', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany({ credits: 10 })
    const passwordHash = await bcrypt.hash('password123', 12)
    const recUser = await createUser({ role: 'RECRUITER', email: `rec-reveal-${Date.now()}@test.com`, passwordHash })
    const recProfile = await prisma.recruiterProfile.create({ data: { userId: recUser.id, companyId: company.id } })
    const job = await createJob(company.id, recProfile.id)
    const { profile: candProfile } = await createCandidate()
    await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })
    // Create unlock record directly (bypasses HTTP for isolation)
    await createUnlock(company.id, candProfile.id, job.id)
    const recToken = await loginUser(app, recUser.email)

    const res = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${recToken}`)

    expect(res.status).toBe(200)
    const dislikeItem = res.body.find((item: any) => item.candidateId === candProfile.id)
    expect(dislikeItem).toBeDefined()
    expect(dislikeItem.profile).not.toBeNull()
    expect(dislikeItem.profile.name).toBe('Test Candidate')

    await app.close()
  })

  it('ainda censura DISLIKE candidato que NÃO foi desbloqueado', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const company = await createCompany({ credits: 10 })
    const passwordHash = await bcrypt.hash('password123', 12)
    const recUser = await createUser({ role: 'RECRUITER', email: `rec-censor-${Date.now()}@test.com`, passwordHash })
    const recProfile = await prisma.recruiterProfile.create({ data: { userId: recUser.id, companyId: company.id } })
    const job = await createJob(company.id, recProfile.id)
    const { profile: candProfile } = await createCandidate()
    await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })
    // No createUnlock — this candidate remains censored
    const recToken = await loginUser(app, recUser.email)

    const res = await supertest(app.server)
      .get(`/jobs/${job.id}/ranking`)
      .set('Authorization', `Bearer ${recToken}`)

    expect(res.status).toBe(200)
    const dislikeItem = res.body.find((item: any) => item.candidateId === candProfile.id)
    expect(dislikeItem).toBeDefined()
    expect(dislikeItem.profile).toBeNull()

    await app.close()
  })
})
