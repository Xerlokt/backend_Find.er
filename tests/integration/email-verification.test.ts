import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { prisma } from '../../src/infrastructure/database/prisma'
import type { IMailerPort } from '../../src/application/ports/mailer.port'

function fakeMailer() {
  const sent: { to: string; code: string }[] = []
  const mailer: IMailerPort = {
    sendVerificationCode: async (to, code) => {
      sent.push({ to, code })
    },
  }
  return { mailer, sent }
}

describe('Email verification — Integration', () => {
  it('cadastro envia código; rota protegida dá 403 até verificar; código certo libera', async () => {
    const { mailer, sent } = fakeMailer()
    const app = await buildApp({ testing: true, mailer })
    await app.ready()

    const reg = await supertest(app.server)
      .post('/auth/register')
      .send({ email: 'novo@example.com', password: 'password123', role: 'CANDIDATE' })
    expect(reg.status).toBe(201)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('novo@example.com')

    const blocked = await supertest(app.server)
      .get('/candidates/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED')

    const wrong = await supertest(app.server)
      .post('/auth/email/verify')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ code: sent[0].code === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.code).toBe('INVALID_CODE')

    const ok = await supertest(app.server)
      .post('/auth/email/verify')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ code: sent[0].code })
    expect(ok.status).toBe(200)

    const user = await prisma.user.findUnique({ where: { email: 'novo@example.com' } })
    expect(user?.emailVerifiedAt).not.toBeNull()

    const allowed = await supertest(app.server)
      .get('/candidates/me')
      .set('Authorization', `Bearer ${ok.body.accessToken}`)
    expect(allowed.status).not.toBe(403)

    await app.close()
  })

  it('código expirado dá 410; reenvio em <60s dá 429', async () => {
    const { mailer, sent } = fakeMailer()
    const app = await buildApp({ testing: true, mailer })
    await app.ready()

    const reg = await supertest(app.server)
      .post('/auth/register')
      .send({ email: 'exp@example.com', password: 'password123', role: 'RECRUITER' })

    const resend = await supertest(app.server)
      .post('/auth/email/send')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
    expect(resend.status).toBe(429)
    expect(resend.body.code).toBe('RESEND_TOO_SOON')

    await prisma.emailVerification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await supertest(app.server)
      .post('/auth/email/verify')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ code: sent[0].code })
    expect(expired.status).toBe(410)
    expect(expired.body.code).toBe('CODE_EXPIRED')

    await app.close()
  })

  it('após 5 códigos errados bloqueia até pedir outro', async () => {
    const { mailer, sent } = fakeMailer()
    const app = await buildApp({ testing: true, mailer })
    await app.ready()

    const reg = await supertest(app.server)
      .post('/auth/register')
      .send({ email: 'brute@example.com', password: 'password123', role: 'CANDIDATE' })
    const bad = sent[0].code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) {
      await supertest(app.server).post('/auth/email/verify').set('Authorization', `Bearer ${reg.body.accessToken}`).send({ code: bad })
    }
    const locked = await supertest(app.server)
      .post('/auth/email/verify')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ code: sent[0].code })
    expect(locked.status).toBe(429)
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS')

    await app.close()
  })

  it('trocar email: código vai para o endereço novo e a verificação conclui com o email corrigido', async () => {
    const { mailer, sent } = fakeMailer()
    const app = await buildApp({ testing: true, mailer })
    await app.ready()

    const reg = await supertest(app.server)
      .post('/auth/register')
      .send({ email: 'errado@example.com', password: 'password123', role: 'CANDIDATE' })

    const changed = await supertest(app.server)
      .post('/auth/email/change')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ email: 'Certo@Example.com' })
    expect(changed.status).toBe(200)
    expect(sent[1].to).toBe('certo@example.com')
    expect(JSON.parse(Buffer.from(changed.body.accessToken.split('.')[1], 'base64url').toString()).email).toBe('certo@example.com')

    const oldCode = await supertest(app.server)
      .post('/auth/email/verify')
      .set('Authorization', `Bearer ${changed.body.accessToken}`)
      .send({ code: sent[0].code === sent[1].code ? '000000' : sent[0].code })
    expect(oldCode.status).toBe(400)

    const ok = await supertest(app.server)
      .post('/auth/email/verify')
      .set('Authorization', `Bearer ${changed.body.accessToken}`)
      .send({ code: sent[1].code })
    expect(ok.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { email: 'errado@example.com' } })).toBeNull()

    await app.close()
  })

  it('trocar email: 409 se o endereço novo é de conta verificada', async () => {
    const { mailer } = fakeMailer()
    const app = await buildApp({ testing: true, mailer })
    await app.ready()
    await prisma.user.create({ data: { email: 'dono@example.com', role: 'CANDIDATE', emailVerifiedAt: new Date() } })

    const reg = await supertest(app.server)
      .post('/auth/register')
      .send({ email: 'novo2@example.com', password: 'password123', role: 'CANDIDATE' })
    const res = await supertest(app.server)
      .post('/auth/email/change')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ email: 'dono@example.com' })
    expect(res.status).toBe(409)

    await app.close()
  })

  it('recadastro com email nunca verificado substitui a conta antiga', async () => {
    const { mailer } = fakeMailer()
    const app = await buildApp({ testing: true, mailer })
    await app.ready()
    await supertest(app.server).post('/auth/register').send({ email: 'dup@example.com', password: 'password123', role: 'CANDIDATE' })
    const again = await supertest(app.server).post('/auth/register').send({ email: 'dup@example.com', password: 'outrasenha123', role: 'CANDIDATE' })
    expect(again.status).toBe(201)
    expect(await prisma.user.count({ where: { email: 'dup@example.com' } })).toBe(1)
    await app.close()
  })
})
