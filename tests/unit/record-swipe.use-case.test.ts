import { RecordSwipeUseCase } from '../../src/application/use-cases/swipe/record-swipe.use-case'
import type { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import type { IChatPort } from '../../src/application/ports/chat.port'
import type { ICachePort } from '../../src/application/ports/cache.port'
import type { IWeightsRepository } from '../../src/domain/interfaces/weights.repository.interface'

const makeSwipeRepo = (): jest.Mocked<ISwipeRepository> => ({
  findCandidateProfileByUserId: jest.fn(),
  findJobById: jest.fn(),
  createSwipe: jest.fn(),
  findSwipesByJobId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  findUnlocksByJobAndCompany: jest.fn(),
  findFeedJobs: jest.fn(),
} as jest.Mocked<ISwipeRepository>)

const makeChatPort = (): jest.Mocked<IChatPort> => ({
  createOrGetChat: jest.fn().mockResolvedValue({ chatId: 'chat-1' }),
} as jest.Mocked<IChatPort>)

const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})

const makeWeightsRepo = (): jest.Mocked<IWeightsRepository> => ({
  upsertWeights: jest.fn().mockResolvedValue({
    id: 'w-1',
    candidateId: 'cand-1',
    professionWeight: 0.30,
    skillsWeight: 0.35,
    locationWeight: 0.20,
    modalityWeight: 0.10,
    salaryWeight: 0.05,
    likeCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  findByCandidateId: jest.fn().mockResolvedValue(null),
})

const activeJob = { id: 'job-1', companyId: 'comp-1', isActive: true, expiresAt: new Date(Date.now() + 86400000) }

describe('RecordSwipeUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws NOT_FOUND (404) when candidate profile does not exist', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue(null)
    const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), makeWeightsRepo())
    await expect(uc.execute('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('throws NOT_FOUND (404) when job does not exist', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(null)
    const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), makeWeightsRepo())
    await expect(uc.execute('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('calls chat.createOrGetChat and returns chatId when direction is LIKE', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(activeJob as any)
    repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
    const chat = makeChatPort()
    const uc = new RecordSwipeUseCase(repo, chat, makeCache(), makeWeightsRepo())
    const result = await uc.execute('user-1', 'job-1', 'LIKE')
    expect(chat.createOrGetChat).toHaveBeenCalledWith('cand-1', 'comp-1', 'job-1', 'MATCH')
    expect(result.chatId).toBe('chat-1')
  })

  it('does not call chat.createOrGetChat when direction is DISLIKE', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(activeJob as any)
    repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'DISLIKE' } as any)
    const chat = makeChatPort()
    const uc = new RecordSwipeUseCase(repo, chat, makeCache(), makeWeightsRepo())
    await uc.execute('user-1', 'job-1', 'DISLIKE')
    expect(chat.createOrGetChat).not.toHaveBeenCalled()
  })

  it('calls cache.del with feed key after successful LIKE swipe', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(activeJob as any)
    repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
    const cache = makeCache()
    const uc = new RecordSwipeUseCase(repo, makeChatPort(), cache, makeWeightsRepo())
    await uc.execute('user-1', 'job-1', 'LIKE')
    expect(cache.del).toHaveBeenCalledWith('feed:cand-1')
  })

  it('calls cache.del with feed key after successful DISLIKE swipe', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(activeJob as any)
    repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'DISLIKE' } as any)
    const cache = makeCache()
    const uc = new RecordSwipeUseCase(repo, makeChatPort(), cache, makeWeightsRepo())
    await uc.execute('user-1', 'job-1', 'DISLIKE')
    expect(cache.del).toHaveBeenCalledWith('feed:cand-1')
  })

  describe('EMA weight update (LEARN-01)', () => {
    const candidateWithProfession = {
      id: 'cand-1',
      professionId: 'backend-dev',
      skills: ['nodejs'],
      preferredModalities: ['REMOTE'],
      salaryExpectation: null,
      lat: null,
      lng: null,
      searchRadiusKm: 50,
    }
    const matchingJob = {
      ...activeJob,
      professionId: 'backend-dev',
      requiredSkills: ['nodejs'],
      modality: 'REMOTE',
      salaryMin: null,
      salaryMax: null,
      lat: null,
      lng: null,
      companyId: 'comp-1',
    }

    it('calls weights.upsertWeights with likeCount=1 on first LIKE (no existing record)', async () => {
      const repo = makeSwipeRepo()
      repo.findCandidateProfileByUserId.mockResolvedValue(candidateWithProfession as any)
      repo.findJobById.mockResolvedValue(matchingJob as any)
      repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
      const weightsRepo = makeWeightsRepo()
      weightsRepo.findByCandidateId.mockResolvedValue(null)  // no existing weights — cold-start
      const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), weightsRepo)
      await uc.execute('user-1', 'job-1', 'LIKE')
      expect(weightsRepo.upsertWeights).toHaveBeenCalledWith(
        'cand-1',
        expect.objectContaining({ likeCount: 1 }),
      )
    })

    it('applies EMA: professionWeight drifts when profession matches (profession-only match scenario)', async () => {
      // Use a job where ONLY profession matches; other factors score 0 or 0.5
      // This ensures profession's share in the renormalized sum actually increases
      const professionOnlyJob = {
        ...activeJob,
        professionId: 'backend-dev',          // matches → professionScore=1.0
        requiredSkills: ['java', 'spring'],    // candidate has ['nodejs'] → skillsScore=0.0
        modality: 'ONSITE',                    // candidate prefers ['REMOTE'] → modalityScore=0.0
        salaryMin: null,
        salaryMax: null,
        lat: null,
        lng: null,
        companyId: 'comp-1',
      }
      // observed = { profession:1.0, skills:0.0, location:1.0, modality:0.0, salary:1.0 }
      // raw (from GLOBAL_DEFAULTS): { profession:0.37, skills:0.315, location:0.28, modality:0.09, salary:0.095 }
      // sum = 1.15; normalized profession = 0.37/1.15 ≈ 0.322 > 0.30 ✓
      const repo = makeSwipeRepo()
      repo.findCandidateProfileByUserId.mockResolvedValue(candidateWithProfession as any)
      repo.findJobById.mockResolvedValue(professionOnlyJob as any)
      repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
      const weightsRepo = makeWeightsRepo()
      weightsRepo.findByCandidateId.mockResolvedValue(null)  // use GLOBAL_DEFAULTS as baseline
      const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), weightsRepo)
      await uc.execute('user-1', 'job-1', 'LIKE')
      const callArgs = weightsRepo.upsertWeights.mock.calls[0][1]
      // After EMA + renormalization, profession weight increases when profession matches but modality/skills don't
      expect(callArgs.professionWeight).toBeGreaterThan(0.30)
    })

    it('renormalizes weights so they sum to approximately 1.0 after EMA update', async () => {
      const repo = makeSwipeRepo()
      repo.findCandidateProfileByUserId.mockResolvedValue(candidateWithProfession as any)
      repo.findJobById.mockResolvedValue(matchingJob as any)
      repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
      const weightsRepo = makeWeightsRepo()
      weightsRepo.findByCandidateId.mockResolvedValue(null)
      const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), weightsRepo)
      await uc.execute('user-1', 'job-1', 'LIKE')
      const { professionWeight, skillsWeight, locationWeight, modalityWeight, salaryWeight } =
        weightsRepo.upsertWeights.mock.calls[0][1]
      const sum = professionWeight + skillsWeight + locationWeight + modalityWeight + salaryWeight
      expect(sum).toBeCloseTo(1.0, 5)
    })

    it('does NOT call weights.upsertWeights when direction is DISLIKE', async () => {
      const repo = makeSwipeRepo()
      repo.findCandidateProfileByUserId.mockResolvedValue(candidateWithProfession as any)
      repo.findJobById.mockResolvedValue(matchingJob as any)
      repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'DISLIKE' } as any)
      const weightsRepo = makeWeightsRepo()
      const uc = new RecordSwipeUseCase(repo, makeChatPort(), makeCache(), weightsRepo)
      await uc.execute('user-1', 'job-1', 'DISLIKE')
      expect(weightsRepo.upsertWeights).not.toHaveBeenCalled()
    })
  })
})
