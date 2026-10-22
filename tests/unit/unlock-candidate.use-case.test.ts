import { UnlockCandidateUseCase } from '../../src/application/use-cases/credits/unlock-candidate.use-case'
import { DomainError } from '../../src/application/errors/domain.error'
import type { ICreditRepository } from '../../src/domain/interfaces/credit.repository.interface'
import type { IChatPort } from '../../src/application/ports/chat.port'
import type { ICachePort } from '../../src/application/ports/cache.port'
import { encodeUnlockToken } from '../../src/application/utils/unlock-token'

const makeRepo = (): jest.Mocked<ICreditRepository> => ({
  findRecruiterByUserId: jest.fn(),
  findJobById: jest.fn(),
  findSwipe: jest.fn(),
  findUnlock: jest.fn(),
  findCandidateProfileById: jest.fn(),
  executeUnlock: jest.fn(),
  grantCredits: jest.fn(),
} as jest.Mocked<ICreditRepository>)

const makeChatPort = (): jest.Mocked<IChatPort> => ({
  createOrGetChat: jest.fn().mockResolvedValue({ chatId: 'chat-uuid-1' }),
} as jest.Mocked<IChatPort>)

const recruiterWithFreeCompany = {
  id: 'rec-1',
  userId: 'user-1',
  companyId: 'comp-1',
  company: { id: 'comp-1', plan: 'FREE', credits: 0 },
}

const job = { id: 'job-1', recruiterId: 'rec-1', companyId: 'comp-1', isActive: true }

describe('UnlockCandidateUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws FORBIDDEN (403) when recruiter profile does not exist', async () => {
    const repo = makeRepo()
    repo.findRecruiterByUserId.mockResolvedValue(null)
    const uc = new UnlockCandidateUseCase(repo, makeChatPort())
    await expect(uc.execute('user-1', 'job-1', 'cand-1')).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('throws INSUFFICIENT_CREDITS (402) when repo.executeUnlock raises it', async () => {
    const repo = makeRepo()
    repo.findRecruiterByUserId.mockResolvedValue(recruiterWithFreeCompany as any)
    repo.findJobById.mockResolvedValue(job as any)
    repo.findSwipe.mockResolvedValue({ direction: 'DISLIKE' } as any)
    repo.findCandidateProfileById.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findUnlock.mockResolvedValue(null)
    // Repo raises INSUFFICIENT_CREDITS when company has insufficient credits
    repo.executeUnlock.mockRejectedValue(new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 402))
    const uc = new UnlockCandidateUseCase(repo, makeChatPort())
    await expect(uc.execute('user-1', 'job-1', 'cand-1')).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      statusCode: 402,
    })
  })

  it('calls executeUnlock with cost=2 for FREE plan when credits sufficient', async () => {
    const repo = makeRepo()
    const recruiter = { ...recruiterWithFreeCompany, company: { ...recruiterWithFreeCompany.company, credits: 10 } }
    repo.findRecruiterByUserId.mockResolvedValue(recruiter as any)
    repo.findJobById.mockResolvedValue(job as any)
    repo.findSwipe.mockResolvedValue({ direction: 'DISLIKE' } as any)
    repo.findCandidateProfileById.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findUnlock.mockResolvedValue(null)
    repo.executeUnlock.mockResolvedValue({
      id: 'unlock-1',
      companyId: 'comp-1',
      candidateId: 'cand-1',
      jobId: 'job-1',
      unlockedAt: new Date(),
      creditsCost: 2,
    })
    const uc = new UnlockCandidateUseCase(repo, makeChatPort())
    await uc.execute('user-1', 'job-1', 'cand-1')
    expect(repo.executeUnlock).toHaveBeenCalledWith('comp-1', 'cand-1', 'job-1', 2)
  })

  describe('best-fit candidates without swipe', () => {
    const rich = { ...recruiterWithFreeCompany, company: { ...recruiterWithFreeCompany.company, credits: 10 } }
    const unlockRow = { id: 'u1', companyId: 'comp-1', candidateId: 'cand-9', jobId: 'job-1', unlockedAt: new Date(), creditsCost: 2 }
    const makeCache = (): jest.Mocked<ICachePort> => ({
      get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(undefined), invalidatePattern: jest.fn(),
    } as jest.Mocked<ICachePort>)
    const ready = (repo: jest.Mocked<ICreditRepository>) => {
      repo.findRecruiterByUserId.mockResolvedValue(rich as any)
      repo.findJobById.mockResolvedValue(job as any)
    }

    beforeEach(() => { process.env.JWT_SECRET = 'test-secret' })

    it('unlocks a candidate who never swiped, resolving the opaque unlockToken, and charges credits', async () => {
      const repo = makeRepo()
      ready(repo)
      repo.findCandidateProfileById.mockResolvedValue({ id: 'cand-9' } as any)
      repo.findSwipe.mockResolvedValue(null)
      repo.findUnlock.mockResolvedValue(null)
      repo.executeUnlock.mockResolvedValue(unlockRow)
      const chat = makeChatPort()

      const uc = new UnlockCandidateUseCase(repo, chat)
      const result = await uc.execute('user-1', 'job-1', encodeUnlockToken('cand-9', 'job-1'))

      expect(repo.executeUnlock).toHaveBeenCalledWith('comp-1', 'cand-9', 'job-1', 2)
      expect(chat.createOrGetChat).toHaveBeenCalledWith('cand-9', 'comp-1', 'job-1', 'CREDIT')
      expect(result.candidateId).toBe('cand-9')
    })

    it('rejects an unlockToken issued for another job (404, no charge)', async () => {
      const repo = makeRepo()
      ready(repo)
      repo.findCandidateProfileById.mockResolvedValue(null)
      const uc = new UnlockCandidateUseCase(repo, makeChatPort())

      await expect(uc.execute('user-1', 'job-1', encodeUnlockToken('cand-9', 'job-2')))
        .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
      expect(repo.executeUnlock).not.toHaveBeenCalled()
    })

    it('404 when the candidate does not exist', async () => {
      const repo = makeRepo()
      ready(repo)
      repo.findCandidateProfileById.mockResolvedValue(null)
      const uc = new UnlockCandidateUseCase(repo, makeChatPort())

      await expect(uc.execute('user-1', 'job-1', 'ghost')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    })

    it('422 when the candidate already liked the job (already visible, no charge)', async () => {
      const repo = makeRepo()
      ready(repo)
      repo.findCandidateProfileById.mockResolvedValue({ id: 'cand-1' } as any)
      repo.findSwipe.mockResolvedValue({ direction: 'LIKE' } as any)
      const uc = new UnlockCandidateUseCase(repo, makeChatPort())

      await expect(uc.execute('user-1', 'job-1', 'cand-1')).rejects.toMatchObject({ code: 'CANDIDATE_ALREADY_VISIBLE', statusCode: 422 })
      expect(repo.executeUnlock).not.toHaveBeenCalled()
    })

    it('409 on second unlock without charging again', async () => {
      const repo = makeRepo()
      ready(repo)
      repo.findCandidateProfileById.mockResolvedValue({ id: 'cand-9' } as any)
      repo.findSwipe.mockResolvedValue(null)
      repo.findUnlock.mockResolvedValue({ id: 'u1' } as any)
      const uc = new UnlockCandidateUseCase(repo, makeChatPort())

      await expect(uc.execute('user-1', 'job-1', encodeUnlockToken('cand-9', 'job-1')))
        .rejects.toMatchObject({ code: 'ALREADY_UNLOCKED', statusCode: 409 })
      expect(repo.executeUnlock).not.toHaveBeenCalled()
    })

    it('invalidates the job ranking cache after a successful unlock', async () => {
      const repo = makeRepo()
      ready(repo)
      repo.findCandidateProfileById.mockResolvedValue({ id: 'cand-9' } as any)
      repo.findSwipe.mockResolvedValue(null)
      repo.findUnlock.mockResolvedValue(null)
      repo.executeUnlock.mockResolvedValue(unlockRow)
      const cache = makeCache()

      const uc = new UnlockCandidateUseCase(repo, makeChatPort(), cache)
      await uc.execute('user-1', 'job-1', encodeUnlockToken('cand-9', 'job-1'))

      expect(cache.del).toHaveBeenCalledWith('ranking:job-1')
    })
  })
})
