import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { prisma } from '../../src/infrastructure/database/prisma'
import { createUser, createCompany, createJob, createCandidate } from '../helpers/factories'
import type { IFileStorage } from '../../src/application/ports/file-storage.port'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])

// nada vai para o disco nos testes
const storage: IFileStorage = {
  save: async (_data, ext) => `http://localhost:3000/uploads/${Math.random().toString(36).slice(2)}.${ext}`,
  remove: async () => undefined,
}

async function setup() {
  const app = await buildApp({ testing: true, storage })
  await app.ready()
  const login = async (email: string) =>
    (await supertest(app.server).post('/auth/login').send({ email, password: 'password123' })).body.accessToken as string

  const company = await createCompany()
  const user = await createUser({ role: 'RECRUITER' })
  const recruiter = await prisma.recruiterProfile.create({ data: { userId: user.id, companyId: company.id } })
  const token = await login(user.email)

  const otherCompany = await createCompany()
  const otherUser = await createUser({ role: 'RECRUITER' })
  await prisma.recruiterProfile.create({ data: { userId: otherUser.id, companyId: otherCompany.id } })
  const otherToken = await login(otherUser.email)

  return { app, company, recruiter, token, otherToken, login }
}

describe('Company profile — Integration', () => {
  it('PATCH /companies/:id atualiza bio e nome fantasia; vazio limpa o campo', async () => {
    const { app, company, token } = await setup()

    const res = await supertest(app.server)
      .patch(`/companies/${company.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Somos a melhor', tradeName: 'Acme' })
    expect(res.status).toBe(200)
    expect(res.body.description).toBe('Somos a melhor')
    expect(res.body.tradeName).toBe('Acme')

    const cleared = await supertest(app.server)
      .patch(`/companies/${company.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: '' })
    expect(cleared.body.description).toBeNull()
    await app.close()
  })

  it('PATCH recusa campos fora da lista (cnpj) e bio longa demais', async () => {
    const { app, company, token } = await setup()
    const base = () => supertest(app.server).patch(`/companies/${company.id}`).set('Authorization', `Bearer ${token}`)
    expect((await base().send({ cnpj: '12345678000199' })).status).toBe(400)
    expect((await base().send({ description: 'x'.repeat(1001) })).status).toBe(400)
    await app.close()
  })

  it('PATCH de outra empresa dá 403', async () => {
    const { app, company, otherToken } = await setup()
    const res = await supertest(app.server)
      .patch(`/companies/${company.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ description: 'invadida' })
    expect(res.status).toBe(403)
    await app.close()
  })

  it('fotos: sobe, aparece no GET da empresa, remove; texto disfarçado de imagem é recusado', async () => {
    const { app, company, token } = await setup()
    const auth = { Authorization: `Bearer ${token}` }

    const up = await supertest(app.server).post(`/companies/${company.id}/photos`).set(auth).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect(up.status).toBe(201)
    expect(up.body.url).toMatch(/\.png$/)

    const fake = await supertest(app.server).post(`/companies/${company.id}/photos`).set(auth).attach('file', Buffer.from('oi'), { filename: 'a.png', contentType: 'image/png' })
    expect(fake.status).toBe(422)
    expect(fake.body.code).toBe('INVALID_IMAGE')

    const got = await supertest(app.server).get(`/companies/${company.id}`).set(auth)
    expect(got.body.photos).toHaveLength(1)

    const del = await supertest(app.server).delete(`/companies/${company.id}/photos/${up.body.id}`).set(auth)
    expect(del.status).toBe(204)
    const after = await supertest(app.server).get(`/companies/${company.id}`).set(auth)
    expect(after.body.photos).toHaveLength(0)
    await app.close()
  })

  it('fotos: limite de 8 e isolamento entre empresas', async () => {
    const { app, company, token, otherToken } = await setup()
    for (let i = 0; i < 8; i++) {
      await prisma.companyPhoto.create({ data: { companyId: company.id, url: `http://x/${i}.png`, position: i } })
    }
    const over = await supertest(app.server).post(`/companies/${company.id}/photos`).set('Authorization', `Bearer ${token}`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect(over.status).toBe(422)
    expect(over.body.code).toBe('PHOTO_LIMIT')

    const foreign = await supertest(app.server).post(`/companies/${company.id}/photos`).set('Authorization', `Bearer ${otherToken}`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect(foreign.status).toBe(403)
    await app.close()
  })

  it('logo: POST /companies/:id/logo grava logoUrl', async () => {
    const { app, company, token } = await setup()
    const res = await supertest(app.server).post(`/companies/${company.id}/logo`).set('Authorization', `Bearer ${token}`).attach('file', PNG, { filename: 'l.png', contentType: 'image/png' })
    expect(res.status).toBe(200)
    expect(res.body.logoUrl).toMatch(/\.png$/)
    await app.close()
  })

  it('stats: conta vagas, viram, likes e dislikes só da própria empresa', async () => {
    const { app, company, recruiter, token, otherToken } = await setup()
    const jobA = await createJob(company.id, recruiter.id)
    const jobB = await createJob(company.id, recruiter.id)
    const c1 = await createCandidate()
    const c2 = await createCandidate()
    await prisma.jobView.createMany({
      data: [
        { jobId: jobA.id, candidateId: c1.profile.id },
        { jobId: jobA.id, candidateId: c2.profile.id },
        { jobId: jobB.id, candidateId: c1.profile.id },
      ],
    })
    await prisma.swipe.createMany({
      data: [
        { jobId: jobA.id, candidateId: c1.profile.id, direction: 'LIKE' },
        { jobId: jobA.id, candidateId: c2.profile.id, direction: 'DISLIKE' },
      ],
    })

    const res = await supertest(app.server).get(`/companies/${company.id}/stats`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.totals).toEqual({ jobs: 2, activeJobs: 2, views: 3, likes: 1, dislikes: 1 })
    const a = res.body.jobs.find((j: any) => j.jobId === jobA.id)
    expect(a).toMatchObject({ views: 2, likes: 1, dislikes: 1, likeRate: 0.5 })
    const b = res.body.jobs.find((j: any) => j.jobId === jobB.id)
    expect(b).toMatchObject({ views: 1, likes: 0, dislikes: 0, likeRate: null })

    const foreign = await supertest(app.server).get(`/companies/${company.id}/stats`).set('Authorization', `Bearer ${otherToken}`)
    expect(foreign.status).toBe(403)
    await app.close()
  })

  it('feed do candidato registra impressão uma única vez por vaga', async () => {
    const { app, company, recruiter, login } = await setup()
    const job = await createJob(company.id, recruiter.id)
    const cand = await createCandidate()
    const token = await login(cand.user.email)

    for (let i = 0; i < 2; i++) {
      await supertest(app.server).get('/jobs/feed').set('Authorization', `Bearer ${token}`)
    }
    expect(await prisma.jobView.count({ where: { jobId: job.id, candidateId: cand.profile.id } })).toBe(1)
    await app.close()
  })
})
