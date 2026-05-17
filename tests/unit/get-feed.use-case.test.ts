import { GetFeedUseCase } from '../../src/application/use-cases/swipe/get-feed.use-case'
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

const candidateProfile = {
  id: 'cand-1',
  userId: 'user-1',
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

describe('GetFeedUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns cached result (cache HIT, no cursor) without calling repo.findFeedJobs or rec.computeFitScore', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findCandidateProfileByUserId.mockResolvedValue(candidateProfile as any)
    const cachedResult = { data: [{ id: 'job-1', fitScore: 0.9 }], nextCursor: null }
    cache.get.mockResolvedValue(JSON.stringify(cachedResult))

    const uc = new GetFeedUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', undefined, 20)

    expect(result).toEqual(cachedResult)
    expect(repo.findFeedJobs).not.toHaveBeenCalled()
    expect(rec.computeFitScore).not.toHaveBeenCalled()
    expect(cache.get).toHaveBeenCalledWith('feed:cand-1')
  })

  it('fetches from repo on cache MISS (no cursor) and calls cache.set with TTL 60', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findCandidateProfileByUserId.mockResolvedValue(candidateProfile as any)
    repo.findFeedJobs.mockResolvedValue([jobItem] as any)
    rec.computeFitScore.mockResolvedValue(0.85)
    // cache.get returns null by default (cache MISS)

    const uc = new GetFeedUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', undefined, 20)

    expect(repo.findFeedJobs).toHaveBeenCalledWith('cand-1', undefined, 20)
    expect(rec.computeFitScore).toHaveBeenCalled()
    expect(cache.set).toHaveBeenCalledWith('feed:cand-1', expect.any(String), 60)
    expect(result).toMatchObject({ data: expect.any(Array), nextCursor: expect.anything() })
  })

  it('skips cache.get and cache.set when cursor is provided (paginated request)', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findCandidateProfileByUserId.mockResolvedValue(candidateProfile as any)
    repo.findFeedJobs.mockResolvedValue([jobItem] as any)
    rec.computeFitScore.mockResolvedValue(0.85)

    const uc = new GetFeedUseCase(repo, rec, cache)
    await uc.execute('user-1', 'some-cursor-uuid', 20)

    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
    expect(repo.findFeedJobs).toHaveBeenCalledWith('cand-1', 'some-cursor-uuid', 20)
  })

  it('falls through to repo when cache.get throws (Redis error fallthrough)', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findCandidateProfileByUserId.mockResolvedValue(candidateProfile as any)
    repo.findFeedJobs.mockResolvedValue([jobItem] as any)
    rec.computeFitScore.mockResolvedValue(0.75)
    cache.get.mockRejectedValue(new Error('Redis connection refused'))

    const uc = new GetFeedUseCase(repo, rec, cache)
    // Should NOT throw — falls through to repo
    const result = await uc.execute('user-1', undefined, 20)

    expect(repo.findFeedJobs).toHaveBeenCalled()
    expect(result).toMatchObject({ data: expect.any(Array) })
  })
})
