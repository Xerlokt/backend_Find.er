import '../helpers/setup'
import { setupNeo4j } from '../helpers/neo4j-setup'
import { getNeo4jDriver } from '../../src/shared/db/neo4j'
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'
import type { CandidateData, JobData } from '../../src/shared/interfaces/recommendation.interface'

const makeCandidate = (overrides: Partial<CandidateData> = {}): CandidateData => ({
  professionId: overrides.professionId !== undefined ? overrides.professionId : 'backend-dev',
  skills: overrides.skills ?? ['Node.js', 'TypeScript'],
  preferredModalities: overrides.preferredModalities ?? ['REMOTE'],
  salaryExpectation: overrides.salaryExpectation !== undefined ? overrides.salaryExpectation : 5000,
  lat: overrides.lat !== undefined ? overrides.lat : -23.5505,
  lng: overrides.lng !== undefined ? overrides.lng : -46.6333,
  searchRadiusKm: overrides.searchRadiusKm ?? 50,
})

const makeJob = (overrides: Partial<JobData> = {}): JobData => ({
  professionId: overrides.professionId !== undefined ? overrides.professionId : 'backend-dev',
  requiredSkills: overrides.requiredSkills ?? ['Node.js', 'TypeScript'],
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

    it('creates Skill nodes for all 10 skills', async () => {
      const driver = getNeo4jDriver()
      const session = driver.session()
      try {
        const result = await session.run('MATCH (s:Skill) RETURN count(s) AS count')
        const count = result.records[0].get('count') as number
        expect(count).toBe(10)
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
        // Should still be 16 (6 professions + 10 skills) — not 32
        expect(count).toBe(16)
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
        skills: ['Node.js', 'TypeScript'],
        preferredModalities: ['REMOTE'],
        salaryExpectation: 5000,
        lat: -23.5505,
        lng: -46.6333,
        searchRadiusKm: 50,
      })
      const job = makeJob({
        professionId: 'backend-dev',
        requiredSkills: ['Node.js', 'TypeScript'],
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
        skills: [],
        preferredModalities: ['IN_PERSON'],
        salaryExpectation: 100000,
        lat: -3.1190,
        lng: -60.0217,
        searchRadiusKm: 50,
      })
      const job = makeJob({
        professionId: 'frontend-dev',
        requiredSkills: ['React'],
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
      const candidate = makeCandidate({ professionId: 'backend-dev', skills: ['Node.js'] })
      const job = makeJob({ professionId: 'backend-dev', requiredSkills: ['Node.js', 'TypeScript'] })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(100)
    })
  })
})
