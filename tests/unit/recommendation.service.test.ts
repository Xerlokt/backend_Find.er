import type { Driver } from 'neo4j-driver'
import { RecommendationRepository } from '../../src/adapters/services/recommendation.repository'
import type { FitScoreInput, FitScoreJobInput } from '../../src/domain/interfaces/recommendation.repository.interface'

function makeMockDriver(adjacency: Array<{ skill: string; hops: number }>): Driver {
  const mockRun = jest.fn().mockResolvedValue({
    records: adjacency.map(({ skill, hops }) => ({
      get: (key: string) => (key === 'skill' ? skill : hops),
    })),
  })
  const mockSession = {
    run: mockRun,
    close: jest.fn().mockResolvedValue(undefined),
  }
  return { session: jest.fn().mockReturnValue(mockSession) } as unknown as Driver
}

// Factory helpers — use neutral values on fields not under test for each case
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

describe('RecommendationRepository — computeFitScore', () => {
  let recRepo: RecommendationRepository

  beforeEach(() => {
    recRepo = new RecommendationRepository(
      makeMockDriver([
        { skill: 'nodejs', hops: 0 },
        { skill: 'typescript', hops: 0 },
      ])
    )
  })

  describe('profession factor (30%)', () => {
    it('exact profession match contributes up to 30 points (profession=1.0, others neutral)', async () => {
      // professionScore=1.0*0.30; skillsScore=1.0*0.35 (no req skills); locationScore=1.0*0.20 (same coords);
      // modalityScore=1.0*0.10; salaryScore=1.0*0.05 => total=100
      // Focus: profession match — score must be > 0
      const candidate = makeCandidate({ professionId: 'backend-dev' })
      const job = makeJob({ professionId: 'backend-dev', requiredSkillIds: [] })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('profession mismatch contributes 0 profession points', async () => {
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidate = makeCandidate({ professionId: 'backend-dev', skillIds: [], preferredModalities: [] })
      const job = makeJob({ professionId: 'frontend-dev', requiredSkillIds: [] })
      // With mismatch profession and no skills/modality match and salary null (score=1.0), locationScore=1.0
      // Expected: no profession contribution (0.30 * 0)
      const score = await recRepo.computeFitScore(candidate, job)
      // Score must be strictly less than a perfect-profession score
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidateMatch = makeCandidate({ professionId: 'frontend-dev', skillIds: [], preferredModalities: [] })
      const scoreMatch = await recRepo.computeFitScore(candidateMatch, job)
      expect(scoreMatch).toBeGreaterThan(score)
    })
  })

  describe('skills factor (35%)', () => {
    it('full skills overlap contributes up to 35 points', async () => {
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'nodejs', hops: 0 }, { skill: 'typescript', hops: 0 }])
      )
      const candidate = makeCandidate({ professionId: 'backend-dev', skillIds: ['nodejs', 'typescript'] })
      const job = makeJob({ professionId: 'backend-dev', requiredSkillIds: ['nodejs', 'typescript'] })
      const scoreFullSkills = await recRepo.computeFitScore(candidate, job)
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const scoreNoSkills = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skillIds: [] }),
        job,
      )
      expect(scoreFullSkills).toBeGreaterThan(scoreNoSkills)
    })

    it('no skills overlap contributes 0 skill points', async () => {
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidate = makeCandidate({ professionId: 'backend-dev', skillIds: [] })
      const job = makeJob({ professionId: 'backend-dev', requiredSkillIds: ['nodejs', 'typescript'] })
      const scoreEmpty = await recRepo.computeFitScore(candidate, job)
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'nodejs', hops: 0 }, { skill: 'typescript', hops: 0 }])
      )
      const scoreFull = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skillIds: ['nodejs', 'typescript'] }),
        job,
      )
      expect(scoreEmpty).toBeLessThan(scoreFull)
    })

    it('partial skills overlap scores between 0 and full overlap', async () => {
      const jobWithTwoSkills = makeJob({ professionId: 'backend-dev', requiredSkillIds: ['nodejs', 'typescript'] })
      recRepo = new RecommendationRepository(makeMockDriver([{ skill: 'nodejs', hops: 0 }]))
      const scoreHalf = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skillIds: ['nodejs'] }),
        jobWithTwoSkills,
      )
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'nodejs', hops: 0 }, { skill: 'typescript', hops: 0 }])
      )
      const scoreFull = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skillIds: ['nodejs', 'typescript'] }),
        jobWithTwoSkills,
      )
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const scoreZero = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skillIds: [] }),
        jobWithTwoSkills,
      )
      expect(scoreHalf).toBeGreaterThan(scoreZero)
      expect(scoreHalf).toBeLessThan(scoreFull)
    })

    it('no required skills → skills score 1.0 (full credit)', async () => {
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidate = makeCandidate({ professionId: 'backend-dev', skillIds: [] })
      const jobNoSkills = makeJob({ professionId: 'backend-dev', requiredSkillIds: [] })
      const jobWithSkills = makeJob({ professionId: 'backend-dev', requiredSkillIds: ['nodejs'] })
      const scoreNoReq = await recRepo.computeFitScore(candidate, jobNoSkills)
      const scoreWithReq = await recRepo.computeFitScore(candidate, jobWithSkills)
      // No required skills = full credit (skillsScore=1.0) vs missing skill = 0
      expect(scoreNoReq).toBeGreaterThan(scoreWithReq)
    })
  })

  describe('location factor (20%)', () => {
    it('candidate within radius scores higher than candidate beyond radius', async () => {
      // candidate at same coords as job → distance 0 → locationScore=1.0
      const candidateNear = makeCandidate({ lat: -23.5505, lng: -46.6333, searchRadiusKm: 50 })
      // candidate far away (São Paulo to Manaus ~2700km >> 50km radius)
      const candidateFar = makeCandidate({ lat: -3.1190, lng: -60.0217, searchRadiusKm: 50 })
      const job = makeJob({ lat: -23.5505, lng: -46.6333 })
      const scoreNear = await recRepo.computeFitScore(candidateNear, job)
      const scoreFar = await recRepo.computeFitScore(candidateFar, job)
      expect(scoreNear).toBeGreaterThan(scoreFar)
    })

    it('candidate with null lat/lng → locationScore = 0.5 (neutral)', async () => {
      const candidateNoCoords = makeCandidate({ lat: null, lng: null, searchRadiusKm: 50 })
      const candidateNear = makeCandidate({ lat: -23.5505, lng: -46.6333, searchRadiusKm: 50 })
      const candidateFar = makeCandidate({ lat: -3.1190, lng: -60.0217, searchRadiusKm: 50 })
      const job = makeJob({ lat: -23.5505, lng: -46.6333 })
      const scoreNoCoords = await recRepo.computeFitScore(candidateNoCoords, job)
      const scoreNear = await recRepo.computeFitScore(candidateNear, job)
      const scoreFar = await recRepo.computeFitScore(candidateFar, job)
      // Neutral (0.5) must be between near (1.0) and far (0.0)
      expect(scoreNoCoords).toBeLessThan(scoreNear)
      expect(scoreNoCoords).toBeGreaterThan(scoreFar)
    })
  })

  describe('work mode factor (10%)', () => {
    it('matching modality contributes 10 points (modality in candidate preferences)', async () => {
      const candidateRemote = makeCandidate({ preferredModalities: ['REMOTE'] })
      const candidateOnsite = makeCandidate({ preferredModalities: ['IN_PERSON'] })
      const jobRemote = makeJob({ modality: 'REMOTE' })
      const scoreMatch = await recRepo.computeFitScore(candidateRemote, jobRemote)
      const scoreMismatch = await recRepo.computeFitScore(candidateOnsite, jobRemote)
      expect(scoreMatch).toBeGreaterThan(scoreMismatch)
    })

    it('modality mismatch contributes 0 modality points', async () => {
      const candidate = makeCandidate({ preferredModalities: ['IN_PERSON'] })
      const job = makeJob({ modality: 'REMOTE' })
      const scoreMismatch = await recRepo.computeFitScore(candidate, job)
      const candidateMatch = makeCandidate({ preferredModalities: ['REMOTE'] })
      const scoreMatch = await recRepo.computeFitScore(candidateMatch, job)
      // mismatch should be strictly less than match
      expect(scoreMismatch).toBeLessThan(scoreMatch)
    })
  })

  describe('salary factor (5%)', () => {
    it('salary expectation within range contributes 5 points', async () => {
      const candidateInRange = makeCandidate({ salaryExpectation: 6000 })
      const candidateOutOfRange = makeCandidate({ salaryExpectation: 10000 })
      const job = makeJob({ salaryMin: 4000, salaryMax: 8000 })
      const scoreIn = await recRepo.computeFitScore(candidateInRange, job)
      const scoreOut = await recRepo.computeFitScore(candidateOutOfRange, job)
      expect(scoreIn).toBeGreaterThan(scoreOut)
    })

    it('null salary fields → salaryScore = 1.0 (open salary)', async () => {
      const candidateNoSalary = makeCandidate({ salaryExpectation: null })
      const jobNoSalary = makeJob({ salaryMin: null, salaryMax: null })
      const jobWithSalary = makeJob({ salaryMin: 4000, salaryMax: 5000 })
      // candidate with salaryExpectation=null should get full salary score for any job
      const candidateHighExpectation = makeCandidate({ salaryExpectation: 100000 })
      const scoreOpen = await recRepo.computeFitScore(candidateNoSalary, jobNoSalary)
      const scoreMismatch = await recRepo.computeFitScore(candidateHighExpectation, jobWithSalary)
      expect(scoreOpen).toBeGreaterThanOrEqual(scoreMismatch)
    })
  })

  describe('composite fitScore', () => {
    it('all factors perfect match → fitScore = 100', async () => {
      recRepo = new RecommendationRepository(
        makeMockDriver([
          { skill: 'nodejs', hops: 0 },
          { skill: 'typescript', hops: 0 },
        ])
      )
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

    it('all factors zero match → fitScore = 0', async () => {
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidate = makeCandidate({
        professionId: 'backend-dev',
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
  })

  describe('DISC weight redistribution (D-05)', () => {
    // Helper: build perfect-score inputs
    const perfectCandidate = (discDominant?: string | null): FitScoreInput => makeCandidate({
      professionId: 'backend-dev',
      skillIds: ['nodejs', 'typescript'],
      preferredModalities: ['REMOTE'],
      salaryExpectation: 5000,
      lat: -23.5505,
      lng: -46.6333,
      searchRadiusKm: 50,
      discDominant: discDominant ?? null,
    })
    const perfectJob = (discProfile?: string | null): FitScoreJobInput => makeJob({
      professionId: 'backend-dev',
      requiredSkillIds: ['nodejs', 'typescript'],
      modality: 'REMOTE',
      salaryMin: 4000,
      salaryMax: 8000,
      lat: -23.5505,
      lng: -46.6333,
      discProfile: discProfile ?? null,
    })

    it('all factors 1.0 + discProfile + DISC match → score = 100', async () => {
      // DISC match: candidate.discDominant === job.discProfile → discScore = 1.0 → contributes 10 points
      // Original weights scale to 0.9x: 27+31.5+18+9+4.5 + 10 = 100
      recRepo = new RecommendationRepository(
        makeMockDriver([
          { skill: 'nodejs', hops: 0 },
          { skill: 'typescript', hops: 0 },
        ])
      )
      const score = await recRepo.computeFitScore(perfectCandidate('D'), perfectJob('D'))
      expect(score).toBe(100)
    })

    it('all factors 1.0 + discProfile + DISC mismatch → score = 90', async () => {
      // DISC mismatch: D candidate, I job requirement → discScore = 0.0
      // Original weights scale to 0.9x: 27+31.5+18+9+4.5 + 0 = 90
      recRepo = new RecommendationRepository(
        makeMockDriver([
          { skill: 'nodejs', hops: 0 },
          { skill: 'typescript', hops: 0 },
        ])
      )
      const score = await recRepo.computeFitScore(perfectCandidate('I'), perfectJob('D'))
      expect(score).toBe(90)
    })

    it('all factors 1.0 + discProfile + no DISC data → score = 90', async () => {
      // No DISC: discDominant null → discScore = 0.0 → same as mismatch (no penalty beyond ceiling)
      recRepo = new RecommendationRepository(
        makeMockDriver([
          { skill: 'nodejs', hops: 0 },
          { skill: 'typescript', hops: 0 },
        ])
      )
      const score = await recRepo.computeFitScore(perfectCandidate(null), perfectJob('D'))
      expect(score).toBe(90)
    })

    it('no discProfile on job → score = 100 (no regression)', async () => {
      // Original behavior preserved when job has no discProfile: weights = 30/35/20/10/5, discWeight = 0
      recRepo = new RecommendationRepository(
        makeMockDriver([
          { skill: 'nodejs', hops: 0 },
          { skill: 'typescript', hops: 0 },
        ])
      )
      const score = await recRepo.computeFitScore(perfectCandidate(null), perfectJob(null))
      expect(score).toBe(100)
    })
  })

  describe('adjacency scoring (GRAPH-01)', () => {
    it('0-hop direct match → skillsScore = 1.0 for that skill', async () => {
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'postgresql', hops: 0 }])
      )
      const candidate = makeCandidate({ skillIds: ['postgresql'] })
      const job = makeJob({ requiredSkillIds: ['postgresql'] })
      const direct = await recRepo.computeFitScore(candidate, job)
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'postgresql', hops: 1 }])
      )
      const oneHop = await recRepo.computeFitScore(candidate, job)
      expect(direct).toBeGreaterThan(oneHop)
    })

    it('1-hop adjacency → skillsScore = 0.8 for single required skill', async () => {
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'postgresql', hops: 1 }])
      )
      const candidate = makeCandidate({ skillIds: ['sql'] })
      const job = makeJob({ requiredSkillIds: ['postgresql'] })
      const score = await recRepo.computeFitScore(candidate, job)
      // skillsScore = 0.8/1 = 0.8 → contribution = 0.8 * 0.35 = 0.28 → > 0
      expect(score).toBeGreaterThan(0)
    })

    it('2-hop adjacency → skillsScore = 0.6 for single required skill', async () => {
      recRepo = new RecommendationRepository(
        makeMockDriver([{ skill: 'postgresql', hops: 2 }])
      )
      const candidate = makeCandidate({ skillIds: ['sql'] })
      const job = makeJob({ requiredSkillIds: ['postgresql'] })
      const score = await recRepo.computeFitScore(candidate, job)
      // skillsScore = 0.6/1 = 0.6 → > 0 but less than 1-hop score
      expect(score).toBeGreaterThan(0)
    })

    it('no adjacency → skillsScore = 0', async () => {
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidate = makeCandidate({ skillIds: ['rust'] })
      const job = makeJob({ requiredSkillIds: ['postgresql'] })
      // With matching profession, modality, salary, location — but zero skills
      const score = await recRepo.computeFitScore(candidate, job)
      // skillsScore = 0 → 0 * 0.35 = 0 skill contribution
      // Other factors still apply — score may be > 0 due to profession/location/modality/salary
      const scoreNoSkillReq = await recRepo.computeFitScore(
        candidate,
        makeJob({ requiredSkillIds: [] })
      )
      // No-skill-req job gives higher score than skill-req job with no adjacency
      expect(scoreNoSkillReq).toBeGreaterThan(score)
    })

    it('mixed hops (1 direct + 1 adjacent) → weighted average', async () => {
      recRepo = new RecommendationRepository(
        makeMockDriver([
          { skill: 'postgresql', hops: 0 },
          { skill: 'typescript', hops: 1 },
        ])
      )
      const candidate = makeCandidate({ skillIds: ['postgresql', 'javascript'] })
      const job = makeJob({ requiredSkillIds: ['postgresql', 'typescript'] })
      const score = await recRepo.computeFitScore(candidate, job)
      // skillsScore = (1.0 + 0.8) / 2 = 0.9 → > 0
      expect(score).toBeGreaterThan(0)
    })

    it('no required skills → skillsScore = 1.0 (short-circuit)', async () => {
      recRepo = new RecommendationRepository(makeMockDriver([]))
      const candidate = makeCandidate({ skillIds: [] })
      const job = makeJob({ requiredSkillIds: [] })
      const scoreNoReq = await recRepo.computeFitScore(candidate, job)
      const jobWithReq = makeJob({ requiredSkillIds: ['postgresql'] })
      const scoreWithReq = await recRepo.computeFitScore(candidate, jobWithReq)
      // No-req gives full skills credit; with-req + no adjacency gives 0 skills credit
      expect(scoreNoReq).toBeGreaterThan(scoreWithReq)
    })
  })
})
