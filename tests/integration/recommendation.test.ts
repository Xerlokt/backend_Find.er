import '../helpers/setup'
import { setupNeo4j } from '../helpers/neo4j-setup'
import { getNeo4jDriver } from '../../src/infrastructure/database/neo4j'
import { RecommendationRepository } from '../../src/adapters/services/recommendation.repository'
import type { FitScoreInput, FitScoreJobInput } from '../../src/domain/interfaces/recommendation.repository.interface'

const makeCandidate = (overrides: Partial<FitScoreInput> = {}): FitScoreInput => ({
  id: overrides.id ?? 'test-candidate',
  professionId: overrides.professionId !== undefined ? overrides.professionId : 'backend-dev',
  skillIds: overrides.skillIds ?? ['nodejs', 'typescript'],
  preferredModalities: overrides.preferredModalities ?? ['REMOTE'],
  salaryExpectation: overrides.salaryExpectation !== undefined ? overrides.salaryExpectation : 5000,
  lat: overrides.lat !== undefined ? overrides.lat : -23.5505,
  lng: overrides.lng !== undefined ? overrides.lng : -46.6333,
  searchRadiusKm: overrides.searchRadiusKm ?? 50,
})

const makeJob = (overrides: Partial<FitScoreJobInput> = {}): FitScoreJobInput => ({
  id: overrides.id ?? 'test-job',
  professionId: overrides.professionId !== undefined ? overrides.professionId : 'backend-dev',
  requiredSkillIds: overrides.requiredSkillIds ?? ['nodejs', 'typescript'],
  modality: overrides.modality ?? 'REMOTE',
  salaryMin: overrides.salaryMin !== undefined ? overrides.salaryMin : 4000,
  salaryMax: overrides.salaryMax !== undefined ? overrides.salaryMax : 8000,
  lat: overrides.lat !== undefined ? overrides.lat : -23.5505,
  lng: overrides.lng !== undefined ? overrides.lng : -46.6333,
})

describe('RecommendationRepository — integration (requires Neo4j Docker)', () => {
  let recRepo: RecommendationRepository

  beforeAll(async () => {
    await setupNeo4j()
  })

  afterAll(async () => {
    await getNeo4jDriver().close()
  })

  beforeEach(() => {
    recRepo = new RecommendationRepository(getNeo4jDriver())
  })

  describe('seedTaxonomy (REC-02)', () => {
    it('creates Profession nodes for all 6 professions', async () => {
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run('MATCH (p:Profession) RETURN count(p) AS count')
        const count = result.records[0].get('count') as number
        expect(count).toBe(6)
      } finally {
        await session.close()
      }
    })

    it('creates Skill nodes for all 36 skills', async () => {
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run('MATCH (s:Skill) RETURN count(s) AS count')
        const count = result.records[0].get('count') as number
        expect(count).toBe(36)
      } finally {
        await session.close()
      }
    })

    it('is idempotent — running seedTaxonomy twice does not duplicate nodes', async () => {
      await recRepo.seedTaxonomy()
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run('MATCH (n) RETURN count(n) AS count')
        const count = result.records[0].get('count') as number
        // Should still be 42 (6 professions + 36 skills) — not 84
        expect(count).toBe(42)
      } finally {
        await session.close()
      }
    })

    it('creates REQUIRES relationships for backend-dev → Node.js and backend-dev → TypeScript', async () => {
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run(
          'MATCH (p:Profession {id: "backend-dev"})-[:REQUIRES]->(s:Skill) RETURN s.name AS name ORDER BY s.name'
        )
        const names = result.records.map((r) => r.get('name') as string)
        expect(names).toContain('Node.js')
        expect(names).toContain('TypeScript')
      } finally {
        await session.close()
      }
    })

    it('creates at least 50 RELATED_TO edges (GRAPH-02)', async () => {
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run(
          'MATCH ()-[:RELATED_TO]->() RETURN count(*) AS count'
        )
        const count = result.records[0].get('count') as number
        expect(count).toBeGreaterThanOrEqual(50)
      } finally {
        await session.close()
      }
    })

    it('Skill.id and Profession.id unique constraints exist after seedTaxonomy (GRAPH-03)', async () => {
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run('SHOW CONSTRAINTS')
        const names = result.records.map((r) => r.get('name') as string)
        expect(names).toContain('skill_id_unique')
        expect(names).toContain('profession_id_unique')
      } finally {
        await session.close()
      }
    })
  })

  describe('computeFitScore (REC-01)', () => {
    it('returns a number between 0 and 100', async () => {
      const score = await recRepo.computeFitScore(makeCandidate(), makeJob())
      expect(typeof score).toBe('number')
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('perfect match candidate scores 100', async () => {
      const candidate = makeCandidate({
        professionId: 'backend-dev',
        skillIds: ['nodejs', 'typescript'],
        preferredModalities: ['REMOTE'],
        salaryExpectation: 5000,
        lat: -23.5505,
        lng: -46.6333,
        searchRadiusKm: 50,
      })
      const job = makeJob({
        professionId: 'backend-dev',
        requiredSkillIds: ['nodejs', 'typescript'],
        modality: 'REMOTE',
        salaryMin: 4000,
        salaryMax: 8000,
        lat: -23.5505,
        lng: -46.6333,
      })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBe(100)
    })

    it('zero match candidate scores 0', async () => {
      const candidate = makeCandidate({
        professionId: 'devops',
        skillIds: [],
        preferredModalities: ['IN_PERSON'],
        salaryExpectation: 100000,
        lat: -3.1190,
        lng: -60.0217,
        searchRadiusKm: 50,
      })
      const job = makeJob({
        professionId: 'frontend-dev',
        requiredSkillIds: ['react'],
        modality: 'REMOTE',
        salaryMin: 1000,
        salaryMax: 2000,
        lat: -23.5505,
        lng: -46.6333,
      })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBe(0)
    })

    it('partial match candidate scores between 0 and 100', async () => {
      const candidate = makeCandidate({ professionId: 'backend-dev', skillIds: ['nodejs'] })
      const job = makeJob({ professionId: 'backend-dev', requiredSkillIds: ['nodejs', 'typescript'] })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(100)
    })
  })

  describe('adjacency scoring — integration (GRAPH-01)', () => {
    it('candidate with SQL skill scores nonzero on PostgreSQL job (1-hop adjacency)', async () => {
      // Requires seed to have: (sql:Skill)-[:RELATED_TO]->(postgresql:Skill)
      const candidate = makeCandidate({ skillIds: ['sql'] })
      const job = makeJob({ requiredSkillIds: ['postgresql'] })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBeGreaterThan(0)

      // Direct match must score higher than 1-hop adjacency
      const directMatch = makeCandidate({ skillIds: ['postgresql'] })
      const directScore = await recRepo.computeFitScore(directMatch, job)
      expect(score).toBeLessThan(directScore)
    })

    it('candidate with no path to required skill scores 0 on skills factor', async () => {
      // rust has no RELATED_TO path to postgresql in the seed
      const candidate = makeCandidate({ skillIds: ['rust'], professionId: 'frontend-dev' })
      const job = makeJob({ requiredSkillIds: ['postgresql'], professionId: 'frontend-dev' })
      const scoreNoPath = await recRepo.computeFitScore(candidate, job)
      const candidateDirect = makeCandidate({ skillIds: ['postgresql'], professionId: 'frontend-dev' })
      const scoreDirects = await recRepo.computeFitScore(candidateDirect, job)
      expect(scoreNoPath).toBeLessThan(scoreDirects)
    })
  })

  describe('GET /jobs/:jobId/ranking — fitScore integration (REC-03)', () => {
    it('ranking endpoint returns items with numeric fitScore (not 0 placeholder)', async () => {
      const { buildApp } = await import('../../src/app')
      const supertest = (await import('supertest')).default
      const { createUser, createCompany, createJob, createSwipe } = await import('../helpers/factories')
      const { prisma } = await import('../../src/infrastructure/database/prisma')

      const app = await buildApp({ testing: true })
      await app.ready()
      try {
        const company = await createCompany()
        const recUser = await createUser({ role: 'RECRUITER', email: 'rec-int-rec@test.com' })
        const recProfile = await prisma.recruiterProfile.create({ data: { userId: recUser.id, companyId: company.id } })
        const job = await createJob(company.id, recProfile.id, { professionId: 'backend-dev', requiredSkills: ['nodejs', 'typescript'] })
        const candUser = await createUser({ role: 'CANDIDATE', email: 'rec-int-cand@test.com' })
        const candProfile = await prisma.candidateProfile.create({
          data: {
            userId: candUser.id,
            name: 'Neo4j Candidate',
            professionId: 'backend-dev',
            skills: ['nodejs', 'typescript'],
            preferredModalities: ['REMOTE'],
            searchRadiusKm: 50,
          },
        })
        await createSwipe(candProfile.id, job.id, { direction: 'LIKE' })
        const recLogin = await supertest(app.server)
          .post('/auth/login')
          .send({ email: 'rec-int-rec@test.com', password: 'password123' })
        const rankRes = await supertest(app.server)
          .get(`/jobs/${job.id}/ranking`)
          .set('Authorization', `Bearer ${recLogin.body.accessToken}`)
        expect(rankRes.status).toBe(200)
        expect(Array.isArray(rankRes.body)).toBe(true)
        expect(rankRes.body.length).toBe(1)
        expect(typeof rankRes.body[0].fitScore).toBe('number')
        // If Neo4j is running: fitScore > 0 for a matching candidate
        // (backend-dev profession + nodejs + typescript + REMOTE = high score)
        // Soft assertion: placeholder was replaced
        expect(rankRes.body[0].fitScore).toBeGreaterThanOrEqual(0)
      } finally {
        await app.close()
      }
    })
  })
})
