import { GetRankingUseCase } from '../../src/application/use-cases/swipe/get-ranking.use-case'
import type { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import type { IRecommendationRepository } from '../../src/domain/interfaces/recommendation.repository.interface'
import type { ICachePort } from '../../src/application/ports/cache.port'

const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
} as jest.Mocked<ISwipeRepository>)

const makeRecRepo = (): jest.Mocked<IRecommendationRepository> => ({
  computeFitScore: jest.fn(),
  seedTaxonomy: jest.fn(),
} as jest.Mocked<IRecommendationRepository>)

const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),        // default: cache miss
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})

const recruiterProfile = {
  id: 'rec-1',
  userId: 'user-1',
  companyId: 'comp-1',
  name: 'Bob Recruiter',
}

const jobItem = {
  id: 'job-1',
  companyId: 'comp-1',
  recruiterId: 'rec-1',
  professionId: 'backend-dev',
  requiredSkills: ['nodejs'],
  modality: 'REMOTE',
  salaryMin: null,
  salaryMax: null,
  lat: null,
  lng: null,
  isActive: true,
  expiresAt: new Date(Date.now() + 86400000),
  title: 'Backend Dev',
  description: 'Build stuff',
}

describe('GetRankingUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns cached result (cache HIT) without calling repo.findSwipesByJobId or rec.computeFitScore', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(jobItem as any)
    const cachedRanking = [{ candidateId: 'cand-1', fitScore: 0.9, rank: 1, profile: null, distanceKm: null }]
    cache.get.mockResolvedValue(JSON.stringify(cachedRanking))

    const uc = new GetRankingUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', 'job-1')

    expect(result).toEqual(cachedRanking)
    expect(repo.findSwipesByJobId).not.toHaveBeenCalled()
    expect(rec.computeFitScore).not.toHaveBeenCalled()
    expect(cache.get).toHaveBeenCalledWith('ranking:job-1')
  })

  it('fetches from repo on cache MISS and calls cache.set with key ranking:jobId and TTL 30', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(jobItem as any)
    const candidateProfile = {
      id: 'cand-1',
      name: 'Alice',
      professionId: 'backend-dev',
      skills: ['nodejs'],
      preferredModalities: ['REMOTE'],
      salaryExpectation: null,
      lat: null,
      lng: null,
      searchRadiusKm: 50,
      bio: null,
      avatarUrl: null,
    }
    repo.findSwipesByJobId.mockResolvedValue([
      {
        id: 'swipe-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
        direction: 'LIKE',
        swipedAt: new Date(),
        candidate: candidateProfile,
      },
    ] as any)
    repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set<string>())
    rec.computeFitScore.mockResolvedValue(0.88)
    // cache.get returns null by default (cache MISS)

    const uc = new GetRankingUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', 'job-1')

    expect(repo.findSwipesByJobId).toHaveBeenCalledWith('job-1')
    expect(rec.computeFitScore).toHaveBeenCalled()
    expect(cache.set).toHaveBeenCalledWith('ranking:job-1', expect.any(String), 30)
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ candidateId: 'cand-1', rank: 1 })]))
  })

  it('throws FORBIDDEN (403) when caller is not a recruiter', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(null)

    const uc = new GetRankingUseCase(repo, rec, cache)
    await expect(uc.execute('user-1', 'job-1')).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
    expect(cache.get).not.toHaveBeenCalled()
  })

  it('throws NOT_FOUND (404) when job does not exist', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(null)

    const uc = new GetRankingUseCase(repo, rec, cache)
    await expect(uc.execute('user-1', 'job-1')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
