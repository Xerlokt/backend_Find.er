import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate, createSwipe, createUnlock } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { encodeUnlockToken } from '../../src/application/utils/unlock-token'
import { prisma } from '../../src/infrastructure/database/prisma'

async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  password = 'password123',
): Promise<string> {
  const response = await supertest(app.server).post('/auth/login').send({ email, password })
  return response.body.accessToken as string
}

async function setupRecruiterAndJob(
  app: Awaited<ReturnType<typeof buildApp>>,
  companyOverrides: Partial<{ plan: string; credits: number }> = {},
) {
  const company = await createCompany({ plan: 'FREE', credits: 10, ...companyOverrides })
  const passwordHash = await bcrypt.hash('password123', 12)
  const recUser = await createUser({ role: 'RECRUITER', email: `recruiter-${Date.now()}@test.com`, passwordHash })
  const recProfile = await prisma.recruiterProfile.create({ data: { userId: recUser.id, companyId: company.id } })
  const job = await createJob(company.id, recProfile.id)
  const recToken = await loginUser(app, recUser.email)
  return { company, recUser, recProfile, job, recToken }
}

describe('POST /jobs/:jobId/candidates/:candidateId/unlock', () => {
  describe('happy path', () => {
    it('201 e retorna unlock + full profile quando recruiter válido com créditos suficientes e candidato deu DISLIKE', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { company, job, recToken } = await setupRecruiterAndJob(app, { credits: 5 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(201)
      expect(res.body.candidateId).toBe(candProfile.id)
      expect(res.body.jobId).toBe(job.id)
      expect(res.body.companyId).toBe(company.id)
      expect(typeof res.body.creditsCost).toBe('number')
      expect(res.body.creditsCost).toBe(2)
      expect(res.body.profile).not.toBeNull()
      expect(res.body.profile.name).toBe('Test Candidate')
      expect(Array.isArray(res.body.profile.skills)).toBe(true)
      expect('distanceKm' in res.body.profile).toBe(true)

      await app.close()
    })

    it('company.credits decrementado em 2 após unlock (plano FREE)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { company, job, recToken } = await setupRecruiterAndJob(app, { credits: 4 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      const updated = await prisma.company.findUnique({ where: { id: company.id } })
      expect(updated!.credits).toBe(2)

      await app.close()
    })

    it('CreditTransaction criada com amount=-2 e reason=candidate_unlock', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { company, job, recToken } = await setupRecruiterAndJob(app, { credits: 5 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      const txn = await prisma.creditTransaction.findFirst({
        where: { companyId: company.id, reason: 'candidate_unlock' },
      })
      expect(txn).not.toBeNull()
      expect(txn!.amount).toBe(-2)
      expect(txn!.reason).toBe('candidate_unlock')

      await app.close()
    })

    it('201 com creditsCost=1 quando empresa tem plano PRO', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { company, job, recToken } = await setupRecruiterAndJob(app, { plan: 'PRO', credits: 5 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(201)
      expect(res.body.creditsCost).toBe(1)
      const updated = await prisma.company.findUnique({ where: { id: company.id } })
      expect(updated!.credits).toBe(4)

      await app.close()
    })
  })

  describe('error paths', () => {
    it('401 sem token de autenticação', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const res = await supertest(app.server)
        .post(`/jobs/00000000-0000-0000-0000-000000000001/candidates/00000000-0000-0000-0000-000000000002/unlock`)
      expect(res.status).toBe(401)
      await app.close()
    })

    it('403 quando usuário é CANDIDATE', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const passwordHash = await bcrypt.hash('password123', 12)
      const candUser = await createUser({ role: 'CANDIDATE', email: `cand-${Date.now()}@test.com`, passwordHash })
      const candToken = await loginUser(app, candUser.email)
      const { job } = await setupRecruiterAndJob(app)
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${candToken}`)

      expect(res.status).toBe(403)
      await app.close()
    })

    it('403 quando recruiter não é dono do job', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { job } = await setupRecruiterAndJob(app, { credits: 5 })
      const otherCompany = await createCompany({ credits: 5 })
      const passwordHash = await bcrypt.hash('password123', 12)
      const otherRecUser = await createUser({ role: 'RECRUITER', email: `other-rec-${Date.now()}@test.com`, passwordHash })
      await prisma.recruiterProfile.create({ data: { userId: otherRecUser.id, companyId: otherCompany.id } })
      const otherToken = await loginUser(app, otherRecUser.email)
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${otherToken}`)

      expect(res.status).toBe(403)
      await app.close()
    })

    it('201 quando o candidato nunca deu swipe neste job (melhores por fit, desbloqueio por unlockToken)', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { company, job, recToken } = await setupRecruiterAndJob(app, { credits: 5 })
      const { profile: candProfile } = await createCandidate()
      const unlockToken = encodeUnlockToken(candProfile.id, job.id)

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${unlockToken}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(201)
      expect(res.body.candidateId).toBe(candProfile.id)
      expect(res.body.profile.name).toBe('Test Candidate')
      const updated = await prisma.company.findUnique({ where: { id: company.id } })
      expect(updated?.credits).toBe(3)
      await app.close()
    })

    it('404 quando o candidato não existe', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { job, recToken } = await setupRecruiterAndJob(app, { credits: 5 })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/00000000-0000-0000-0000-000000000099/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(404)
      await app.close()
    })

    it('422 CANDIDATE_ALREADY_VISIBLE quando candidato deu LIKE', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { job, recToken } = await setupRecruiterAndJob(app, { credits: 5 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'LIKE' })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(422)
      expect(res.body.code).toBe('CANDIDATE_ALREADY_VISIBLE')
      await app.close()
    })

    it('402 INSUFFICIENT_CREDITS quando saldo é insuficiente', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { job, recToken } = await setupRecruiterAndJob(app, { credits: 0 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(402)
      expect(res.body.code).toBe('INSUFFICIENT_CREDITS')
      await app.close()
    })

    it('409 ALREADY_UNLOCKED na segunda tentativa de unlock', async () => {
      const app = await buildApp({ testing: true })
      await app.ready()
      const { company, job, recToken } = await setupRecruiterAndJob(app, { credits: 10 })
      const { profile: candProfile } = await createCandidate()
      await createSwipe(candProfile.id, job.id, { direction: 'DISLIKE' })
      await createUnlock(company.id, candProfile.id, job.id)

      const res = await supertest(app.server)
        .post(`/jobs/${job.id}/candidates/${candProfile.id}/unlock`)
        .set('Authorization', `Bearer ${recToken}`)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ALREADY_UNLOCKED')
      await app.close()
    })
  })
})

describe('Credit store (simulated purchase)', () => {
  it('GET /credits/packages lista o catálogo', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const { recToken } = await setupRecruiterAndJob(app)

    const res = await supertest(app.server).get('/credits/packages').set('Authorization', `Bearer ${recToken}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0]).toEqual(expect.objectContaining({ id: expect.any(String), credits: expect.any(Number), priceCents: expect.any(Number) }))
    await app.close()
  })

  it('POST /credits/purchase soma o saldo e grava a transação purchase:<id>', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const { company, recToken } = await setupRecruiterAndJob(app, { credits: 1 })

    const res = await supertest(app.server)
      .post('/credits/purchase')
      .set('Authorization', `Bearer ${recToken}`)
      .send({ packageId: 'starter' })

    expect(res.status).toBe(201)
    expect(res.body.credits).toBe(10)
    expect(res.body.balance).toBe(11)
    const updated = await prisma.company.findUnique({ where: { id: company.id } })
    expect(updated?.credits).toBe(11)
    const tx = await prisma.creditTransaction.findFirst({ where: { companyId: company.id } })
    expect(tx).toEqual(expect.objectContaining({ amount: 10, reason: 'purchase:starter' }))
    await app.close()
  })

  it('POST /credits/purchase com pacote inexistente dá 404 e não credita', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const { company, recToken } = await setupRecruiterAndJob(app, { credits: 1 })

    const res = await supertest(app.server)
      .post('/credits/purchase')
      .set('Authorization', `Bearer ${recToken}`)
      .send({ packageId: 'nope' })

    expect(res.status).toBe(404)
    const updated = await prisma.company.findUnique({ where: { id: company.id } })
    expect(updated?.credits).toBe(1)
    await app.close()
  })

  it('GET /credits/transactions devolve só o extrato da própria empresa', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const { recToken } = await setupRecruiterAndJob(app, { credits: 0 })
    await supertest(app.server).post('/credits/purchase').set('Authorization', `Bearer ${recToken}`).send({ packageId: 'starter' })

    const res = await supertest(app.server).get('/credits/transactions').set('Authorization', `Bearer ${recToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].reason).toBe('purchase:starter')
    await app.close()
  })

  it('401 sem token e 403 para candidato', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    expect((await supertest(app.server).get('/credits/packages')).status).toBe(401)

    const passwordHash = await bcrypt.hash('password123', 12)
    const cand = await createUser({ role: 'CANDIDATE', email: `cand-store-${Date.now()}@test.com`, passwordHash })
    const token = await loginUser(app, cand.email)
    const res = await supertest(app.server).post('/credits/purchase').set('Authorization', `Bearer ${token}`).send({ packageId: 'starter' })
    expect(res.status).toBe(403)
    await app.close()
  })
})
