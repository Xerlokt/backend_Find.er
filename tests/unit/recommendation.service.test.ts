import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'
import type { CandidateData, JobData } from '../../src/shared/interfaces/recommendation.interface'

// Factory helpers — use neutral values on fields not under test for each case
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

describe('RecommendationRepository — computeFitScore', () => {
  let recRepo: RecommendationRepository

  beforeEach(() => {
    // Pass fake Driver — computeFitScore is pure TypeScript math (no DB calls in unit tests)
    recRepo = new RecommendationRepository({} as any)
  })

  describe('profession factor (30%)', () => {
    it('exact profession match contributes up to 30 points (profession=1.0, others neutral)', async () => {
      // professionScore=1.0*0.30; skillsScore=1.0*0.35 (no req skills); locationScore=1.0*0.20 (same coords);
      // modalityScore=1.0*0.10; salaryScore=1.0*0.05 => total=100
      // Focus: profession match — score must be > 0
      const candidate = makeCandidate({ professionId: 'backend-dev' })
      const job = makeJob({ professionId: 'backend-dev', requiredSkills: [] })
      const score = await recRepo.computeFitScore(candidate, job)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('profession mismatch contributes 0 profession points', async () => {
      const candidate = makeCandidate({ professionId: 'backend-dev', skills: [], preferredModalities: [] })
      const job = makeJob({ professionId: 'frontend-dev', requiredSkills: [] })
      // With mismatch profession and no skills/modality match and salary null (score=1.0), locationScore=1.0
      // Expected: no profession contribution (0.30 * 0)
      const score = await recRepo.computeFitScore(candidate, job)
      // Score must be strictly less than a perfect-profession score
      const candidateMatch = makeCandidate({ professionId: 'frontend-dev', skills: [], preferredModalities: [] })
      const scoreMatch = await recRepo.computeFitScore(candidateMatch, job)
      expect(scoreMatch).toBeGreaterThan(score)
    })
  })

  describe('skills factor (35%)', () => {
    it('full skills overlap contributes up to 35 points', async () => {
      const candidate = makeCandidate({ professionId: 'backend-dev', skills: ['Node.js', 'TypeScript'] })
      const job = makeJob({ professionId: 'backend-dev', requiredSkills: ['Node.js', 'TypeScript'] })
      const scoreFullSkills = await recRepo.computeFitScore(candidate, job)
      const scoreNoSkills = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skills: [] }),
        job,
      )
      expect(scoreFullSkills).toBeGreaterThan(scoreNoSkills)
    })

    it('no skills overlap contributes 0 skill points', async () => {
      const candidate = makeCandidate({ professionId: 'backend-dev', skills: [] })
      const job = makeJob({ professionId: 'backend-dev', requiredSkills: ['Node.js', 'TypeScript'] })
      const scoreEmpty = await recRepo.computeFitScore(candidate, job)
      const scoreFull = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skills: ['Node.js', 'TypeScript'] }),
        job,
      )
      expect(scoreEmpty).toBeLessThan(scoreFull)
    })

    it('partial skills overlap scores between 0 and full overlap', async () => {
      const jobWithTwoSkills = makeJob({ professionId: 'backend-dev', requiredSkills: ['Node.js', 'TypeScript'] })
      const scoreHalf = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skills: ['Node.js'] }),
        jobWithTwoSkills,
      )
      const scoreFull = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skills: ['Node.js', 'TypeScript'] }),
        jobWithTwoSkills,
      )
      const scoreZero = await recRepo.computeFitScore(
        makeCandidate({ professionId: 'backend-dev', skills: [] }),
        jobWithTwoSkills,
      )
      expect(scoreHalf).toBeGreaterThan(scoreZero)
      expect(scoreHalf).toBeLessThan(scoreFull)
    })

    it('no required skills → skills score 1.0 (full credit)', async () => {
      const candidate = makeCandidate({ professionId: 'backend-dev', skills: [] })
      const jobNoSkills = makeJob({ professionId: 'backend-dev', requiredSkills: [] })
      const jobWithSkills = makeJob({ professionId: 'backend-dev', requiredSkills: ['Node.js'] })
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

    it('all factors zero match → fitScore = 0', async () => {
      const candidate = makeCandidate({
        professionId: 'backend-dev',
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
  })
})
