import { SwipeService } from '../../src/modules/swipe/swipe.service'
import { SwipeRepository } from '../../src/modules/swipe/swipe.repository'
import { AppError } from '../../src/shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'

// Mock do SwipeRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<SwipeRepository> => ({
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findFeedJobs: jest.fn(),
  findCandidateProfileByUserId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
} as unknown as jest.Mocked<SwipeRepository>)

const makeRecRepo = (): jest.Mocked<RecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
} as unknown as jest.Mocked<RecommendationRepository>)

const makeCandidate = (overrides: Partial<{ id: string; userId: string; lat: number | null; lng: number | null }> = {}) => ({
  id: overrides.id ?? 'candidate-1',
  userId: overrides.userId ?? 'user-1',
  name: 'Test Candidate',
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  bio: null,
  skills: ['Node.js'],
  professionId: 'backend-dev',
  preferredModalities: ['REMOTE'],
  salaryExpectation: null,
  user: { avatarUrl: null },
})

const makeJob = (overrides: Partial<{ id: string; recruiterId: string; isActive: boolean; lat: number | null; lng: number | null; expiresAt: Date }> = {}) => ({
  id: overrides.id ?? 'job-1',
  recruiterId: overrides.recruiterId ?? 'recruiter-profile-1',
  isActive: overrides.isActive ?? true,
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86400000),
})

describe('SwipeService', () => {
  let repo: jest.Mocked<SwipeRepository>
  let recRepo: jest.Mocked<RecommendationRepository>
  let service: SwipeService

  beforeEach(() => {
    repo = makeRepo()
    recRepo = makeRecRepo()
    service = new SwipeService(repo, recRepo)
    jest.clearAllMocks()
    recRepo.computeFitScore.mockResolvedValue(0)  // set AFTER clearAllMocks — preserve existing test behaviors
    repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set())  // default: empty unlock set — no behavior change for existing tests
  })

  describe('recordSwipe', () => {
    it('lança AppError 404 NOT_FOUND quando candidato não tem perfil', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(null)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando job não existe', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(null)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando job.isActive === false (D-14)', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(makeJob({ isActive: false }) as any)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando job está expirado (expiresAt <= now)', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(makeJob({ expiresAt: new Date(Date.now() - 1000) }) as any)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createSwipe).not.toHaveBeenCalled()
    })

    it('lança AppError 409 DUPLICATE_SWIPE quando repo.createSwipe rejeita com P2002', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(makeCandidate() as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '7.0.0' })
      repo.createSwipe.mockRejectedValue(p2002)
      await expect(service.recordSwipe('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_SWIPE' })
    })

    it('chama repo.createSwipe com candidateId derivado do perfil (prevenção IDOR)', async () => {
      const candidate = makeCandidate({ id: 'real-candidate-id' })
      const job = makeJob()
      const swipe = { id: 'swipe-1', candidateId: 'real-candidate-id', jobId: 'job-1', direction: 'LIKE' as SwipeDirection, swipedAt: new Date() }
      repo.findCandidateProfileByUserId.mockResolvedValue(candidate as any)
      repo.findJobById.mockResolvedValue(job as any)
      repo.createSwipe.mockResolvedValue(swipe as any)
      const result = await service.recordSwipe('user-1', 'job-1', 'LIKE')
      expect(repo.createSwipe).toHaveBeenCalledWith({ candidateId: 'real-candidate-id', jobId: 'job-1', direction: 'LIKE' })
      expect(result).toEqual(swipe)
    })
  })

  describe('getFeed', () => {
    it('lança AppError 404 NOT_FOUND quando candidato não tem perfil', async () => {
      repo.findCandidateProfileByUserId.mockResolvedValue(null)
      await expect(service.getFeed('user-1', undefined, 20)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.findFeedJobs).not.toHaveBeenCalled()
    })

    it('chama repo.findFeedJobs com candidateId do perfil e retorna { data, nextCursor }', async () => {
      const candidate = makeCandidate({ id: 'cand-profile-id' })
      const jobs = [{ id: 'job-1', createdAt: new Date() }, { id: 'job-2', createdAt: new Date() }]
      repo.findCandidateProfileByUserId.mockResolvedValue(candidate as any)
      repo.findFeedJobs.mockResolvedValue(jobs as any)
      const result = await service.getFeed('user-1', undefined, 2)
      expect(repo.findFeedJobs).toHaveBeenCalledWith('cand-profile-id', undefined, 2)
      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('nextCursor')
    })

    it('getFeed retorna fitScore por job chamando recommendation.computeFitScore (CAND-03)', async () => {
      const candidate = makeCandidate({ id: 'cand-profile-id' })
      const jobs = [{ id: 'job-1', professionId: 'backend-dev', requiredSkills: [], modality: 'REMOTE', salaryMin: null, salaryMax: null, lat: null, lng: null, createdAt: new Date() }]
      repo.findCandidateProfileByUserId.mockResolvedValue(candidate as any)
      repo.findFeedJobs.mockResolvedValue(jobs as any)
      recRepo.computeFitScore.mockResolvedValue(55)
      const result = await service.getFeed('user-1', undefined, 20)
      expect(recRepo.computeFitScore).toHaveBeenCalledTimes(1)
      expect(result.data[0]).toHaveProperty('fitScore', 55)
    })
  })

  describe('getRanking', () => {
    const makeRecruiterProfile = (overrides: Partial<{ id: string }> = {}) => ({
      id: overrides.id ?? 'recruiter-profile-1',
      userId: 'rec-user-1',
      companyId: 'company-1',
    })

    const makeJobWithCoords = (overrides: Partial<{ id: string; recruiterId: string; lat: number | null; lng: number | null }> = {}) => ({
      id: overrides.id ?? 'job-1',
      recruiterId: overrides.recruiterId ?? 'recruiter-profile-1',
      isActive: true,
      lat: overrides.lat ?? null,
      lng: overrides.lng ?? null,
      expiresAt: new Date(Date.now() + 86400000),
    })

    const makeSwipeWithCandidate = (overrides: Partial<{
      candidateId: string
      direction: 'LIKE' | 'DISLIKE'
      candidateLat: number | null
      candidateLng: number | null
    }> = {}) => ({
      candidateId: overrides.candidateId ?? 'cand-1',
      jobId: 'job-1',
      direction: (overrides.direction ?? 'LIKE') as SwipeDirection,
      swipedAt: new Date(),
      candidate: {
        id: overrides.candidateId ?? 'cand-1',
        name: 'Alice',
        bio: 'A bio',
        lat: overrides.candidateLat ?? null,
        lng: overrides.candidateLng ?? null,
        professionId: 'backend-dev',
        skills: ['Node.js'],
        preferredModalities: ['REMOTE'],
        salaryExpectation: 5000,
        searchRadiusKm: 50,
        user: { avatarUrl: 'https://example.com/avatar.jpg' },
      },
    })

    it('lança AppError 403 FORBIDDEN quando usuário não tem perfil de recruiter', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(null)
      await expect(service.getRanking('user-1', 'job-1')).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
      expect(repo.findSwipesByJobId).not.toHaveBeenCalled()
    })

    it('lança AppError 403 FORBIDDEN quando job.recruiterId !== recruiterProfile.id (ownership mismatch)', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile({ id: 'profile-A' }) as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords({ recruiterId: 'profile-B' }) as any)
      await expect(service.getRanking('user-1', 'job-1')).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
      expect(repo.findSwipesByJobId).not.toHaveBeenCalled()
    })

    it('LIKE swipe: item retornado tem profile completo com todos os campos esperados', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([makeSwipeWithCandidate({ direction: 'LIKE' })] as any)
      const result = await service.getRanking('user-1', 'job-1')
      expect(result[0].profile).not.toBeNull()
      expect(result[0].profile).toHaveProperty('name', 'Alice')
      expect(result[0].profile).toHaveProperty('avatarUrl')
      expect(result[0].profile).toHaveProperty('bio')
      expect(result[0].profile).toHaveProperty('skills')
      expect(result[0].profile).toHaveProperty('professionId')
      expect(result[0].profile).toHaveProperty('preferredModalities')
      expect(result[0].profile).toHaveProperty('salaryExpectation')
    })

    it('DISLIKE swipe: item retornado tem profile: null (identidade censurada)', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([makeSwipeWithCandidate({ direction: 'DISLIKE' })] as any)
      const result = await service.getRanking('user-1', 'job-1')
      expect(result[0].profile).toBeNull()
    })

    it('NUNCA retorna lat ou lng nos itens do ranking (privacidade de localização)', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([
        makeSwipeWithCandidate({ direction: 'LIKE', candidateLat: -23.5, candidateLng: -46.6 }),
        makeSwipeWithCandidate({ direction: 'DISLIKE', candidateLat: -23.5, candidateLng: -46.6 }),
      ] as any)
      const result = await service.getRanking('user-1', 'job-1')
      for (const item of result) {
        expect((item as any).lat).toBeUndefined()
        expect((item as any).lng).toBeUndefined()
        if (item.profile !== null) {
          expect((item.profile as any).lat).toBeUndefined()
          expect((item.profile as any).lng).toBeUndefined()
        }
      }
    })

    it('distanceKm é null quando candidato não tem coordenadas', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords({ lat: -23.5, lng: -46.6 }) as any)
      repo.findSwipesByJobId.mockResolvedValue([makeSwipeWithCandidate({ candidateLat: null, candidateLng: null })] as any)
      const result = await service.getRanking('user-1', 'job-1')
      expect(result[0].distanceKm).toBeNull()
    })

    it('distanceKm é 0 quando candidato e vaga estão nas mesmas coordenadas', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords({ lat: -23.5, lng: -46.6 }) as any)
      repo.findSwipesByJobId.mockResolvedValue([makeSwipeWithCandidate({ candidateLat: -23.5, candidateLng: -46.6 })] as any)
      const result = await service.getRanking('user-1', 'job-1')
      expect(result[0].distanceKm).toBe(0)
    })

    it('rank é 1-based e cresce com a posição no array', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([
        makeSwipeWithCandidate({ candidateId: 'cand-A', direction: 'LIKE' }),
        makeSwipeWithCandidate({ candidateId: 'cand-B', direction: 'DISLIKE' }),
      ] as any)
      const result = await service.getRanking('user-1', 'job-1')
      expect(result[0].rank).toBe(1)
      expect(result[1].rank).toBe(2)
    })

    it('chama recommendation.computeFitScore para cada swipe e retorna fitScore correto', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([
        makeSwipeWithCandidate({ candidateId: 'cand-A', direction: 'LIKE' }),
        makeSwipeWithCandidate({ candidateId: 'cand-B', direction: 'DISLIKE' }),
      ] as any)
      recRepo.computeFitScore.mockResolvedValue(75)
      const result = await service.getRanking('user-1', 'job-1')
      expect(recRepo.computeFitScore).toHaveBeenCalledTimes(2)
      expect(result[0].fitScore).toBe(75)
      expect(result[1].fitScore).toBe(75)
    })

    it('ordena candidatos por fitScore DESC antes de atribuir rank', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([
        makeSwipeWithCandidate({ candidateId: 'cand-low', direction: 'LIKE' }),
        makeSwipeWithCandidate({ candidateId: 'cand-high', direction: 'LIKE' }),
      ] as any)
      // cand-low gets score 20, cand-high gets score 90
      recRepo.computeFitScore
        .mockResolvedValueOnce(20)  // first swipe (cand-low) gets 20
        .mockResolvedValueOnce(90)  // second swipe (cand-high) gets 90
      const result = await service.getRanking('user-1', 'job-1')
      // After sorting DESC: cand-high (90) is rank 1, cand-low (20) is rank 2
      expect(result[0].candidateId).toBe('cand-high')
      expect(result[0].fitScore).toBe(90)
      expect(result[0].rank).toBe(1)
      expect(result[1].candidateId).toBe('cand-low')
      expect(result[1].fitScore).toBe(20)
      expect(result[1].rank).toBe(2)
    })

    it('rank é atribuído após a ordenação por fitScore (não antes)', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(makeRecruiterProfile() as any)
      repo.findJobById.mockResolvedValue(makeJobWithCoords() as any)
      repo.findSwipesByJobId.mockResolvedValue([
        makeSwipeWithCandidate({ candidateId: 'cand-A' }),
        makeSwipeWithCandidate({ candidateId: 'cand-B' }),
        makeSwipeWithCandidate({ candidateId: 'cand-C' }),
      ] as any)
      recRepo.computeFitScore
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(60)
      const result = await service.getRanking('user-1', 'job-1')
      expect(result[0].rank).toBe(1)
      expect(result[1].rank).toBe(2)
      expect(result[2].rank).toBe(3)
      expect(result[0].fitScore).toBe(90)
      expect(result[1].fitScore).toBe(60)
      expect(result[2].fitScore).toBe(30)
    })

    it('revela perfil de candidato DISLIKE quando está no conjunto de desbloqueados', async () => {
      const recruiterProfile = { id: 'recruiter-profile-1', companyId: 'company-1' }
      repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
      repo.findJobById.mockResolvedValue(makeJob() as any)
      const candidateId = 'candidate-unlock-1'
      const swipesWithCandidate = [
        {
          candidateId,
          direction: 'DISLIKE',
          candidate: {
            id: candidateId,
            name: 'Unlocked Candidate',
            lat: null,
            lng: null,
            bio: 'bio',
            skills: ['Node.js'],
            professionId: 'backend-dev',
            preferredModalities: ['REMOTE'],
            salaryExpectation: null,
            searchRadiusKm: 50,
            user: { avatarUrl: null },
          },
        },
      ]
      repo.findSwipesByJobId.mockResolvedValue(swipesWithCandidate as any)
      // Set contains the candidateId — this DISLIKE is unlocked
      repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set([candidateId]))
      recRepo.computeFitScore.mockResolvedValue(75)

      const result = await service.getRanking('user-1', 'job-1')

      expect(result[0].profile).not.toBeNull()
      expect(result[0].profile!.name).toBe('Unlocked Candidate')
    })
  })
})
