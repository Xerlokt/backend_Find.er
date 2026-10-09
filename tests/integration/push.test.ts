import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createCandidate } from '../helpers/factories'
import { prisma } from '../../src/infrastructure/database/prisma'

const TOKEN = 'ExponentPushToken[integration-1]'

async function loginCandidate(app: Awaited<ReturnType<typeof buildApp>>) {
  const { user } = await createCandidate()
  const res = await supertest(app.server).post('/auth/login').send({ email: user.email, password: 'password123' })
  return { user, auth: `Bearer ${res.body.accessToken as string}` }
}

describe('Push tokens', () => {
  it('PUT /push-tokens sem JWT → 401', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const res = await supertest(app.server).put('/push-tokens').send({ token: TOKEN })
    expect(res.status).toBe(401)
  })

  it('PUT registra o token e é idempotente', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const { user, auth } = await loginCandidate(app)

    for (let i = 0; i < 2; i++) {
      const res = await supertest(app.server).put('/push-tokens').set('Authorization', auth).send({ token: TOKEN })
      expect(res.status).toBe(204)
    }
    const rows = await prisma.pushToken.findMany({ where: { userId: user.id } })
    expect(rows.map((r) => r.token)).toEqual([TOKEN])
  })

  it('token que não é do Expo → 400 INVALID_PUSH_TOKEN', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const { auth } = await loginCandidate(app)
    const res = await supertest(app.server).put('/push-tokens').set('Authorization', auth).send({ token: 'lixo' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_PUSH_TOKEN')
  })

  it('o mesmo aparelho em outra conta passa o token para a nova conta', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const a = await loginCandidate(app)
    const b = await loginCandidate(app)
    await supertest(app.server).put('/push-tokens').set('Authorization', a.auth).send({ token: TOKEN })
    await supertest(app.server).put('/push-tokens').set('Authorization', b.auth).send({ token: TOKEN })
    const rows = await prisma.pushToken.findMany({ where: { token: TOKEN } })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(b.user.id)
  })

  it('DELETE remove o token do próprio usuário e não o de outro', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()
    const a = await loginCandidate(app)
    const b = await loginCandidate(app)
    await supertest(app.server).put('/push-tokens').set('Authorization', a.auth).send({ token: TOKEN })

    await supertest(app.server).delete('/push-tokens').set('Authorization', b.auth).send({ token: TOKEN })
    expect(await prisma.pushToken.count()).toBe(1)

    const res = await supertest(app.server).delete('/push-tokens').set('Authorization', a.auth).send({ token: TOKEN })
    expect(res.status).toBe(204)
    expect(await prisma.pushToken.count()).toBe(0)
  })
})
