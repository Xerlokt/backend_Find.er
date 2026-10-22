import { GetRankingUseCase, censorProfile, buildFitReasons, type CensoredProfile, type FullProfile } from '../../src/application/use-cases/swipe/get-ranking.use-case'
import type { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import type { IRecommendationRepository } from '../../src/domain/interfaces/recommendation.repository.interface'
import type { ICachePort } from '../../src/application/ports/cache.port'

const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findCandidatePoolForJob: jest.fn().mockResolvedValue([]),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
  recordViews: jest.fn().mockResolvedValue(undefined),
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

describe('GetRankingUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns cached result (cache HIT) without calling repo.findSwipesByJobId or rec.computeFitScore', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(jobItem as any)
    const validProfile = { name: 'Alice', avatarUrl: null, bio: null, skills: ['nodejs'], professionId: 'backend-dev', preferredModalities: ['REMOTE'], salaryExpectation: null }
    const cachedRanking = [{ candidateId: 'cand-1', fitScore: 0.9, rank: 1, profile: validProfile, distanceKm: null }]
    cache.get.mockResolvedValue(JSON.stringify(cachedRanking))

    const uc = new GetRankingUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', 'job-1')

    expect(result).toEqual(cachedRanking)
    expect(repo.findSwipesByJobId).not.toHaveBeenCalled()
    expect(rec.computeFitScore).not.toHaveBeenCalled()
    expect(cache.get).toHaveBeenCalledWith('ranking:job-1')
  })

  it('stale cache with profile: null is discarded — falls through to repo (WR-01 guard)', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(jobItem as any)
    // Pre-Phase-16 stale entry with profile: null
    const staleRanking = [{ candidateId: 'cand-1', fitScore: 0.9, rank: 1, profile: null, distanceKm: null }]
    cache.get.mockResolvedValue(JSON.stringify(staleRanking))
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
    rec.computeFitScore.mockResolvedValue(0.9)

    const uc = new GetRankingUseCase(repo, rec, cache)
    await uc.execute('user-1', 'job-1')

    // Guard discarded the stale entry — repo must have been called to recompute
    expect(repo.findSwipesByJobId).toHaveBeenCalled()
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

  it('DISLIKE + locked candidate → profile is CensoredProfile with name: null and matchingSkills array', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue({ ...jobItem, requiredSkills: ['nodejs'] } as any)
    repo.findSwipesByJobId.mockResolvedValue([
      {
        id: 'swipe-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
        direction: 'DISLIKE',
        swipedAt: new Date(),
        candidate: { ...candidateProfile, skills: ['nodejs'] },
      },
    ] as any)
    repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set<string>()) // cand-1 NOT unlocked
    rec.computeFitScore.mockResolvedValue(0.5)

    const uc = new GetRankingUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', 'job-1')

    expect(result[0].profile).not.toBeNull()
    expect((result[0].profile as any).name).toBeNull()
    expect(Array.isArray((result[0].profile as any).matchingSkills)).toBe(true)
  })

  it('DISLIKE + unlocked candidate → profile is FullProfile with name: "Alice"', async () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(jobItem as any)
    repo.findSwipesByJobId.mockResolvedValue([
      {
        id: 'swipe-1',
        candidateId: 'cand-1',
        jobId: 'job-1',
        direction: 'DISLIKE',
        swipedAt: new Date(),
        candidate: { ...candidateProfile, skills: ['nodejs'] },
      },
    ] as any)
    repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set<string>(['cand-1'])) // cand-1 IS unlocked
    rec.computeFitScore.mockResolvedValue(0.5)

    const uc = new GetRankingUseCase(repo, rec, cache)
    const result = await uc.execute('user-1', 'job-1')

    expect((result[0].profile as any).name).toBe('Alice')
  })
})

describe('censorProfile() pure function', () => {
  const job = {
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

  const makeSwipe = (overrides: { direction?: string; candidateSkills?: string[] } = {}) => ({
    id: 'swipe-1',
    candidateId: 'cand-1',
    jobId: 'job-1',
    direction: overrides.direction ?? 'LIKE',
    swipedAt: new Date(),
    candidate: {
      ...candidateProfile,
      skills: overrides.candidateSkills ?? candidateProfile.skills,
    },
  })

  it('LIKE direction → FullProfile: name is not null, matchingSkills not in result', () => {
    const result = censorProfile(makeSwipe({ direction: 'LIKE' }) as any, job as any, false)
    expect(result.name).toBe('Alice')
    expect('matchingSkills' in result).toBe(false)
  })

  it('DISLIKE + isUnlocked=true → FullProfile: name is not null', () => {
    const result = censorProfile(makeSwipe({ direction: 'DISLIKE' }) as any, job as any, true)
    expect(result.name).toBe('Alice')
  })

  it('DISLIKE + isUnlocked=false → CensoredProfile: name, avatarUrl, bio all null; matchingSkills present', () => {
    const result = censorProfile(makeSwipe({ direction: 'DISLIKE' }) as any, job as any, false)
    expect(result.name).toBeNull()
    expect(result.avatarUrl).toBeNull()
    expect(result.bio).toBeNull()
    expect('matchingSkills' in result).toBe(true)
  })

  it('DISLIKE + locked: matchingSkills is the intersection of candidate skills and job requiredSkills', () => {
    const result = censorProfile(
      makeSwipe({ direction: 'DISLIKE', candidateSkills: ['nodejs', 'python'] }) as any,
      { ...job, requiredSkills: ['nodejs', 'typescript'] } as any,
      false,
    ) as CensoredProfile
    expect(result.matchingSkills).toEqual(['nodejs'])
  })

  it('DISLIKE + locked: matchingSkills is empty array when no skills overlap', () => {
    const result = censorProfile(
      makeSwipe({ direction: 'DISLIKE', candidateSkills: ['python'] }) as any,
      { ...job, requiredSkills: ['nodejs'] } as any,
      false,
    ) as CensoredProfile
    expect(result.matchingSkills).toEqual([])
  })

  it('DISLIKE + locked: fitReasons contains skill count string in canonical format', () => {
    const result = censorProfile(
      makeSwipe({ direction: 'DISLIKE', candidateSkills: ['nodejs'] }) as any,
      { ...job, requiredSkills: ['nodejs', 'typescript'] } as any,
      false,
    ) as CensoredProfile
    expect(result.fitReasons).toContain('1/2 skills match')
  })

  describe('censorProfile DISC extension (D-06)', () => {
    it('includes discProfile in CensoredProfile when candidate has discDominant', () => {
      // DISLIKE + locked candidate with discDominant set → CensoredProfile includes discProfile
      const swipeWithDisc = {
        ...makeSwipe({ direction: 'DISLIKE' }),
        candidate: {
          ...candidateProfile,
          skills: candidateProfile.skills,
          discDominant: 'D',
        },
      }
      const result = censorProfile(swipeWithDisc as any, job as any, false) as CensoredProfile
      expect((result as any).discProfile).toBe('D')
    })

    it('omits discProfile field entirely when candidate has no discDominant (null)', () => {
      // DISLIKE + locked candidate with discDominant null → discProfile field must not exist in result
      const swipeNoDisc = {
        ...makeSwipe({ direction: 'DISLIKE' }),
        candidate: {
          ...candidateProfile,
          skills: candidateProfile.skills,
          discDominant: null,
        },
      }
      const result = censorProfile(swipeNoDisc as any, job as any, false) as CensoredProfile
      expect('discProfile' in result).toBe(false)
    })
  })
})

describe('buildFitReasons() pure function', () => {
  const baseJob = {
    requiredSkills: ['nodejs', 'typescript'],
    salaryMin: null,
    salaryMax: null,
    professionId: 'backend-dev',
  }
  const baseCandidate = { salaryExpectation: null, professionId: 'backend-dev' }

  it('returns skill count string in format "N/M skills match"', () => {
    const reasons = buildFitReasons(baseCandidate, baseJob, ['nodejs'])
    expect(reasons).toContain('1/2 skills match')
  })

  it('returns "salary in range" when salaryExpectation is within salaryMin/salaryMax', () => {
    const reasons = buildFitReasons(
      { ...baseCandidate, salaryExpectation: 5000 },
      { ...baseJob, salaryMin: 3000, salaryMax: 6000 },
      [],
    )
    expect(reasons).toContain('salary in range')
  })

  it('returns "salary outside range" when salaryExpectation is below salaryMin', () => {
    const reasons = buildFitReasons(
      { ...baseCandidate, salaryExpectation: 2000 },
      { ...baseJob, salaryMin: 3000, salaryMax: 6000 },
      [],
    )
    expect(reasons).toContain('salary outside range')
  })

  it('returns "profession match" when professionIds are equal', () => {
    const reasons = buildFitReasons(
      { ...baseCandidate, professionId: 'backend-dev' },
      { ...baseJob, professionId: 'backend-dev' },
      [],
    )
    expect(reasons).toContain('profession match')
  })

  it('returns "different profession" when professionIds differ', () => {
    const reasons = buildFitReasons(
      { ...baseCandidate, professionId: 'frontend-dev' },
      { ...baseJob, professionId: 'backend-dev' },
      [],
    )
    expect(reasons).toContain('different profession')
  })
})

describe('GetRankingUseCase — candidates without swipe (best-fit pool)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret'
  })

  const setup = () => {
    const repo = makeSwipeRepo()
    const rec = makeRecRepo()
    const cache = makeCache()
    repo.findRecruiterProfileByUserId.mockResolvedValue(recruiterProfile as any)
    repo.findJobById.mockResolvedValue(jobItem as any)
    repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set<string>())
    return { repo, rec, cache, uc: new GetRankingUseCase(repo, rec, cache) }
  }
  const pooled = (id: string) => ({
    candidateId: id,
    candidate: { ...candidateProfile, id, name: `Name-${id}`, avatarUrl: 'http://img/' + id, bio: 'secret bio', discDominant: null },
  })

  it('includes candidates who never swiped, censored, with an opaque unlockToken and no candidateId', async () => {
    const { repo, rec, uc } = setup()
    repo.findSwipesByJobId.mockResolvedValue([])
    repo.findCandidatePoolForJob.mockResolvedValue([pooled('cand-9')] as any)
    rec.computeFitScore.mockResolvedValue(0.8)

    const result = await uc.execute('user-1', 'job-1')

    expect(repo.findCandidatePoolForJob).toHaveBeenCalledWith('job-1', 'backend-dev', expect.any(Number))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('LOCKED')
    expect(result[0]).not.toHaveProperty('candidateId')
    expect(result[0].unlockToken).toEqual(expect.any(String))
    expect(result[0].profile.name).toBeNull()
    const raw = JSON.stringify(result)
    expect(raw).not.toContain('cand-9')
    expect(raw).not.toContain('Name-cand-9')
    expect(raw).not.toContain('secret bio')
    expect(raw).not.toContain('http://img/')
  })

  it('unlockToken resolves back to the candidate for this job only', async () => {
    const { repo, rec, uc } = setup()
    repo.findSwipesByJobId.mockResolvedValue([])
    repo.findCandidatePoolForJob.mockResolvedValue([pooled('cand-9')] as any)
    rec.computeFitScore.mockResolvedValue(0.8)

    const [item] = await uc.execute('user-1', 'job-1')

    const { decodeUnlockToken } = await import('../../src/application/utils/unlock-token')
    expect(decodeUnlockToken(item.unlockToken!, 'job-1')).toBe('cand-9')
    expect(decodeUnlockToken(item.unlockToken!, 'job-2')).toBeNull()
  })

  it('LIKE is revealed (status REVEALED, candidateId present, no unlockToken); DISLIKE stays LOCKED', async () => {
    const { repo, rec, uc } = setup()
    const sw = (id: string, direction: string) => ({ id: 's-' + id, candidateId: id, jobId: 'job-1', direction, swipedAt: new Date(), candidate: { ...candidateProfile, id } })
    repo.findSwipesByJobId.mockResolvedValue([sw('cand-like', 'LIKE'), sw('cand-dis', 'DISLIKE')] as any)
    rec.computeFitScore.mockResolvedValue(0.5)

    const result = await uc.execute('user-1', 'job-1')
    const like = result.find((r: any) => r.candidateId === 'cand-like')!
    const dis = result.find((r: any) => r.status === 'LOCKED')!

    expect(like.status).toBe('REVEALED')
    expect(like.unlockToken).toBeUndefined()
    expect(dis).not.toHaveProperty('candidateId')
    expect(dis.unlockToken).toEqual(expect.any(String))
  })

  it('unlocked pool candidate is revealed', async () => {
    const { repo, rec, uc } = setup()
    repo.findSwipesByJobId.mockResolvedValue([])
    repo.findCandidatePoolForJob.mockResolvedValue([pooled('cand-9')] as any)
    repo.findUnlocksByJobAndCompany.mockResolvedValue(new Set(['cand-9']))
    rec.computeFitScore.mockResolvedValue(0.8)

    const [item] = await uc.execute('user-1', 'job-1')
    expect(item.status).toBe('REVEALED')
    expect(item.candidateId).toBe('cand-9')
    expect(item.profile.name).toBe('Name-cand-9')
  })

  it('merges swipes and pool, sorted by fitScore DESC with ranks', async () => {
    const { repo, rec, uc } = setup()
    repo.findSwipesByJobId.mockResolvedValue([
      { id: 's1', candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE', swipedAt: new Date(), candidate: { ...candidateProfile, id: 'cand-1' } },
    ] as any)
    repo.findCandidatePoolForJob.mockResolvedValue([pooled('cand-9')] as any)
    rec.computeFitScore.mockImplementation(async (c: any) => (c.id === 'cand-9' ? 0.95 : 0.4))

    const result = await uc.execute('user-1', 'job-1')
    expect(result.map((r: any) => r.rank)).toEqual([1, 2])
    expect(result[0].status).toBe('LOCKED')
    expect(result[1].candidateId).toBe('cand-1')
  })
})

describe('censorProfile — no swipe', () => {
  it('direction null is censored unless unlocked', () => {
    const cand = { ...candidateProfile, discDominant: null } as any
    const job = { requiredSkills: ['nodejs'], salaryMin: null, salaryMax: null, professionId: 'backend-dev' }
    expect((censorProfile({ direction: null, candidate: cand }, job, false) as any).name).toBeNull()
    expect((censorProfile({ direction: null, candidate: cand }, job, true) as any).name).toBe('Alice')
  })
})
