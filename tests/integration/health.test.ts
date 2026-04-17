import '../helpers/setup' // registers beforeAll/afterAll/afterEach hooks
import { buildApp } from '../../src/app'
import supertest from 'supertest'

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server).get('/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
    expect(response.headers['content-type']).toMatch(/application\/json/)

    await app.close()
  })
})
