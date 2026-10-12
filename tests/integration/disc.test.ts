import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { registerVerified } from '../helpers/factories'

describe('DISC Routes — Integration', () => {
  // Helper: register and login as a CANDIDATE, return token + candidateId
  async function setupCandidate(app: Awaited<ReturnType<typeof buildApp>>) {
    const email = `disc-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`
    const token = await registerVerified(app, { email, role: 'CANDIDATE' })

    // Create CandidateProfile (required for DISC ownership check)
    const profileRes = await supertest(app.server)
      .put('/candidates/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Candidate',
        professionId: 'prof-test-disc',
        skills: ['nodejs'],
        preferredModalities: ['REMOTE'],
        searchRadiusKm: 50,
      })
    const candidateId = profileRes.body.id

    return { token, candidateId, email }
  }

  // Helper: register and login as a RECRUITER, return token
  async function setupRecruiter(app: Awaited<ReturnType<typeof buildApp>>) {
    const email = `disc-recruiter-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`
    return registerVerified(app, { email, role: 'RECRUITER' })
  }

  it('401 — POST /candidates/:id/disc without Authorization header', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const response = await supertest(app.server)
      .post('/candidates/00000000-0000-0000-0000-000000000001/disc')
      .send({ answers: ['D', 'D', 'D', 'D'] })

    expect(response.status).toBe(401)
    await app.close()
  })

  it('403 — RECRUITER JWT cannot submit DISC (requireRole blocks)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const recruiterToken = await setupRecruiter(app)
    const response = await supertest(app.server)
      .post('/candidates/00000000-0000-0000-0000-000000000001/disc')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ answers: ['D', 'D', 'D', 'D'] })

    expect(response.status).toBe(403)
    await app.close()
  })

  it('400 — invalid answers (non-DISC dimensions)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const { token, candidateId } = await setupCandidate(app)
    const response = await supertest(app.server)
      .post(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['X', 'Y', 'Z', 'W'] })

    expect(response.status).toBe(400)
    await app.close()
  })

  it('400 — wrong answers array length (3 elements)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const { token, candidateId } = await setupCandidate(app)
    const response = await supertest(app.server)
      .post(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['D', 'I', 'S'] })

    expect(response.status).toBe(400)
    await app.close()
  })

  it('200 — successful DISC submission returns dominant', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const { token, candidateId } = await setupCandidate(app)
    const response = await supertest(app.server)
      .post(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['D', 'D', 'D', 'D'] })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('dominant', 'D')
    await app.close()
  })

  it('404 — GET /candidates/:id/disc before any submission', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const { token, candidateId } = await setupCandidate(app)
    const response = await supertest(app.server)
      .get(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(404)
    await app.close()
  })

  it('200 — GET /candidates/:id/disc after submission returns correct dominant', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const { token, candidateId } = await setupCandidate(app)

    // Submit: all S answers
    await supertest(app.server)
      .post(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['S', 'S', 'S', 'S'] })

    const response = await supertest(app.server)
      .get(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('dominant', 'S')
    await app.close()
  })

  it('200 — retake (second POST) updates dominant (D-04 upsert)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const { token, candidateId } = await setupCandidate(app)

    // First submission: all D
    await supertest(app.server)
      .post(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['D', 'D', 'D', 'D'] })

    // Retake: all C answers
    const retakeRes = await supertest(app.server)
      .post(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['C', 'C', 'C', 'C'] })

    expect(retakeRes.status).toBe(200)
    expect(retakeRes.body).toHaveProperty('dominant', 'C')

    // GET should reflect updated dominant
    const getRes = await supertest(app.server)
      .get(`/candidates/${candidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)

    expect(getRes.status).toBe(200)
    expect(getRes.body).toHaveProperty('dominant', 'C')
    await app.close()
  })

  it('403 — candidate cannot submit DISC for another candidateId', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    // Setup two candidates
    const { token } = await setupCandidate(app)
    const { candidateId: otherCandidateId } = await setupCandidate(app)

    // First candidate tries to submit for second candidate's ID
    const response = await supertest(app.server)
      .post(`/candidates/${otherCandidateId}/disc`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['D', 'D', 'D', 'D'] })

    expect(response.status).toBe(403)
    await app.close()
  })
})
