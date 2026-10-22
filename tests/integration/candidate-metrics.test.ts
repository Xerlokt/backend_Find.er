import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { prisma } from '../../src/infrastructure/database/prisma'
import { createUser, createCompany, createJob, createCandidate, createSwipe, createChat, createUnlock } from '../helpers/factories'

async function setup() {
  const app = await buildApp({ testing: true })
  await app.ready()
  const login = async (email: string) =>
    (await supertest(app.server).post('/auth/login').send({ email, password: 'password123' })).body.accessToken as string

  const company = await createCompany()
  const recruiterUser = await createUser({ role: 'RECRUITER' })
  const recruiter = await prisma.recruiterProfile.create({ data: { userId: recruiterUser.id, companyId: company.id } })
  const jobs = [
    await createJob(company.id, recruiter.id),
    await createJob(company.id, recruiter.id),
    await createJob(company.id, recruiter.id),
  ]
  return { app, login, company, recruiterUser, jobs }
}

describe('GET /candidates/me/metrics — Integration', () => {
  it('401 sem token', async () => {
    const { app } = await setup()
    expect((await supertest(app.server).get('/candidates/me/metrics')).status).toBe(401)
    await app.close()
  })

  it('403 para RECRUITER', async () => {
    const { app, login, recruiterUser } = await setup()
    const token = await login(recruiterUser.email)
    const res = await supertest(app.server).get('/candidates/me/metrics').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    await app.close()
  })

  it('devolve só os números do próprio candidato', async () => {
    const { app, login, company, jobs } = await setup()
    const me = await createCandidate()
    const other = await createCandidate()

    await createSwipe(me.profile.id, jobs[0].id, { direction: 'LIKE' })
    await createSwipe(me.profile.id, jobs[1].id, { direction: 'LIKE' })
    await createSwipe(me.profile.id, jobs[2].id, { direction: 'DISLIKE' })
    // atividade de outro candidato não pode vazar
    await createSwipe(other.profile.id, jobs[0].id, { direction: 'DISLIKE' })
    await createChat(other.profile.id, jobs[0].id, company.id)

    await createChat(me.profile.id, jobs[0].id, company.id, { initiatedBy: 'MATCH' })
    await createChat(me.profile.id, jobs[2].id, company.id, { initiatedBy: 'CREDIT' })
    await createUnlock(company.id, me.profile.id, jobs[2].id)
    await createUnlock(company.id, me.profile.id, jobs[1].id) // mesma empresa: conta uma vez

    const token = await login(me.user.email)
    const res = await supertest(app.server).get('/candidates/me/metrics').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.swipes).toEqual({ total: 3, likes: 2, dislikes: 1, likeRate: 2 / 3 })
    expect(res.body.chats).toEqual({ total: 2, viaMatch: 1, viaCredit: 1 })
    expect(res.body.companiesUnlockedYou).toBe(1)
    expect(res.body.discDominant).toBeNull()
    expect(res.body.last7Days).toHaveLength(7)
    const today = res.body.last7Days[6]
    expect(today.likes + today.dislikes).toBe(3)
    await app.close()
  })

  it('candidato novo vê zeros e likeRate null', async () => {
    const { app, login } = await setup()
    const me = await createCandidate()
    const token = await login(me.user.email)
    const res = await supertest(app.server).get('/candidates/me/metrics').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.swipes).toEqual({ total: 0, likes: 0, dislikes: 0, likeRate: null })
    await app.close()
  })
})
