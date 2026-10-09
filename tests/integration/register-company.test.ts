import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { prisma } from '../../src/infrastructure/database/prisma'
import { ICnpjLookupPort, CnpjInfo } from '../../src/application/ports/cnpj-lookup.port'

const CNPJ = '11222333000181'

const lookupReturning = (info: Partial<CnpjInfo> | null): ICnpjLookupPort => ({
  lookup: jest.fn().mockResolvedValue(
    info === null
      ? null
      : { cnpj: CNPJ, legalName: 'ACME LTDA', tradeName: 'Acme', status: 'ATIVA', city: 'SAO PAULO', state: 'SP', ...info },
  ),
})

const body = (over: Record<string, unknown> = {}) => ({
  email: 'rh@acme.com',
  password: 'password123',
  cnpj: '11.222.333/0001-81',
  ...over,
})

describe('POST /auth/register-company — Integration', () => {
  it('201 cria usuário RECRUITER + empresa com dados da Receita + vínculo', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning({}) })
    await app.ready()

    const res = await supertest(app.server).post('/auth/register-company').send(body())
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body.refreshToken).toHaveLength(64)

    const company = await prisma.company.findUnique({ where: { cnpj: CNPJ } })
    expect(company).toMatchObject({ name: 'Acme', legalName: 'ACME LTDA', city: 'SAO PAULO', state: 'SP', credits: 0 })
    const me = await supertest(app.server).get('/recruiters/me').set('Authorization', `Bearer ${res.body.accessToken}`)
    expect(me.status).toBe(200)
    expect(me.body.companyId).toBe(company!.id)
    await app.close()
  })

  it('422 INVALID_CNPJ para dígito verificador errado (sem consultar a Receita)', async () => {
    const lookup = lookupReturning({})
    const app = await buildApp({ testing: true, cnpjLookup: lookup })
    await app.ready()
    const res = await supertest(app.server).post('/auth/register-company').send(body({ cnpj: '11222333000182' }))
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_CNPJ')
    expect(lookup.lookup).not.toHaveBeenCalled()
    await app.close()
  })

  it('422 CNPJ_NOT_FOUND quando a Receita não conhece o CNPJ', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning(null) })
    await app.ready()
    const res = await supertest(app.server).post('/auth/register-company').send(body())
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('CNPJ_NOT_FOUND')
    await app.close()
  })

  it('422 CNPJ_NOT_ACTIVE para empresa baixada', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning({ status: 'BAIXADA' }) })
    await app.ready()
    const res = await supertest(app.server).post('/auth/register-company').send(body())
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('CNPJ_NOT_ACTIVE')
    await app.close()
  })

  it('409 quando o CNPJ já tem conta', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning({}) })
    await app.ready()
    await supertest(app.server).post('/auth/register-company').send(body())
    const res = await supertest(app.server).post('/auth/register-company').send(body({ email: 'outro@acme.com' }))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CNPJ_ALREADY_REGISTERED')
    await app.close()
  })

  it('409 quando o email já existe', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning({}) })
    await app.ready()
    await supertest(app.server).post('/auth/register').send({ email: 'rh@acme.com', password: 'password123', role: 'CANDIDATE' })
    const res = await supertest(app.server).post('/auth/register-company').send(body())
    expect(res.status).toBe(409)
    await app.close()
  })

  it('503 quando a consulta de CNPJ está indisponível', async () => {
    const { DomainError } = await import('../../src/application/errors/domain.error')
    const lookup: ICnpjLookupPort = {
      lookup: jest.fn().mockRejectedValue(new DomainError('indisponível', 'CNPJ_LOOKUP_UNAVAILABLE', 503)),
    }
    const app = await buildApp({ testing: true, cnpjLookup: lookup })
    await app.ready()
    const res = await supertest(app.server).post('/auth/register-company').send(body())
    expect(res.status).toBe(503)
    await app.close()
  })
})

describe('GET /auth/cnpj/:cnpj — Integration', () => {
  it('200 devolve dados da Receita e flags', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning({}) })
    await app.ready()
    const res = await supertest(app.server).get('/auth/cnpj/11.222.333%2F0001-81')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ legalName: 'ACME LTDA', active: true, alreadyRegistered: false })
    await app.close()
  })

  it('422 para CNPJ inválido', async () => {
    const app = await buildApp({ testing: true, cnpjLookup: lookupReturning({}) })
    await app.ready()
    const res = await supertest(app.server).get('/auth/cnpj/123')
    expect(res.status).toBe(422)
    await app.close()
  })
})
