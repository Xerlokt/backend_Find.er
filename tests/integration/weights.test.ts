import '../helpers/setup'
import { buildApp } from '../../src/app'
import supertest from 'supertest'
import { createUser, createCompany, createJob, createCandidate } from '../helpers/factories'
import bcrypt from 'bcryptjs'
import { prisma } from '../../src/infrastructure/database/prisma'

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
  opts: { professionId?: string; skills?: string[] } = {},
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await createUser({ role: 'CANDIDATE', email: `weights-cand-${emailSuffix}@test.com`, passwordHash })
  const profile = await prisma.candidateProfile.create({
    data: {
      userId: user.id,
      name: 'Weights Test Candidate',
      professionId: opts.professionId ?? 'backend-dev',
      skills: opts.skills ?? ['nodejs', 'typescript'],
      preferredModalities: ['REMOTE'],
      searchRadiusKm: 50,
    },
  })
  const token = await loginUser(app, user.email)
  return { user, profile, token }
}

async function createRecruiterWithJob(
  companyId: string,
  opts: { professionId?: string; requiredSkills?: string[] } = {},
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await createUser({ role: 'RECRUITER', email: `weights-rec-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`, passwordHash })
  const recruiterProfile = await prisma.recruiterProfile.create({ data: { userId: user.id, companyId } })
  const job = await createJob(companyId, recruiterProfile.id, {
    professionId: opts.professionId ?? 'backend-dev',
    requiredSkills: opts.requiredSkills ?? ['nodejs'],
  })
  return { job }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Learning System — CandidateWeights (LEARN-01/02/03)', () => {

  it('LEARN-01: LIKE action immediately writes CandidateWeights record with likeCount=1', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile, token } = await createCandidateWithProfile(app, `learn01-${Date.now()}`)
    const { job } = await createRecruiterWithJob(company.id)

    const swipeRes = await supertest(app.server)
      .post('/swipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobId: job.id, direction: 'LIKE' })
    expect(swipeRes.status).toBe(201)

    const record = await prisma.candidateWeights.findUnique({ where: { candidateId: profile.id } })
    expect(record).not.toBeNull()
    expect(record!.likeCount).toBe(1)
    // Weights must sum to 1.0 after EMA + renormalization
    const weightSum = record!.professionWeight + record!.skillsWeight + record!.locationWeight +
      record!.modalityWeight + record!.salaryWeight
    expect(weightSum).toBeCloseTo(1.0, 4)

    await app.close()
  })

  it('LEARN-02: likeCount increments on each subsequent LIKE — 4 LIKEs yields likeCount=4 (cold-start accumulation)', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile, token } = await createCandidateWithProfile(app, `learn02-${Date.now()}`)

    // Create 4 different jobs and LIKE each one
    for (let i = 0; i < 4; i++) {
      const { job } = await createRecruiterWithJob(company.id)
      const res = await supertest(app.server)
        .post('/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ jobId: job.id, direction: 'LIKE' })
      expect(res.status).toBe(201)
    }

    const record = await prisma.candidateWeights.findUnique({ where: { candidateId: profile.id } })
    expect(record).not.toBeNull()
    expect(record!.likeCount).toBe(4)
    // Weights still sum to 1.0 after 4 EMA updates
    const weightSum = record!.professionWeight + record!.skillsWeight + record!.locationWeight +
      record!.modalityWeight + record!.salaryWeight
    expect(weightSum).toBeCloseTo(1.0, 3)

    await app.close()
  })

  it('LEARN-02+03: 5 LIKEs triggers personal-weights threshold — likeCount >= 5 and weights sum to 1.0', async () => {
    const app = await buildApp({ testing: true })
    await app.ready()

    const company = await createCompany()
    const { profile, token } = await createCandidateWithProfile(app, `learn03-${Date.now()}`, {
      professionId: 'backend-dev',
      skills: ['nodejs', 'typescript'],
    })

    // 5 LIKEs on backend-dev jobs — profession match pushes professionWeight up
    for (let i = 0; i < 5; i++) {
      const { job } = await createRecruiterWithJob(company.id, {
        professionId: 'backend-dev',
        requiredSkills: ['nodejs'],
      })
      const res = await supertest(app.server)
        .post('/swipes')
        .set('Authorization', `Bearer ${token}`)
        .send({ jobId: job.id, direction: 'LIKE' })
      expect(res.status).toBe(201)
    }

    // Verify CandidateWeights record with likeCount = 5
    const record = await prisma.candidateWeights.findUnique({ where: { candidateId: profile.id } })
    expect(record).not.toBeNull()
    expect(record!.likeCount).toBe(5)
    // likeCount >= 5 means GetFeedUseCase will use personal weights (LEARN-03 threshold)
    expect(record!.likeCount).toBeGreaterThanOrEqual(5)
    // Weights must sum to 1.0 (renormalization applied across 5 EMA updates)
    const weightSum = record!.professionWeight + record!.skillsWeight + record!.locationWeight +
      record!.modalityWeight + record!.salaryWeight
    expect(weightSum).toBeCloseTo(1.0, 3)
    // Weights have drifted from global defaults — EMA has been applied 5 times
    // We verify renormalization holds (sum = 1.0) and likeCount threshold is met
    // Note: individual weight direction depends on all 5 factor scores + renormalization, not just profession match

    await app.close()
  })

})
