import { UnlockCandidateUseCase } from '../../src/application/use-cases/credits/unlock-candidate.use-case'
import { DomainError } from '../../src/application/errors/domain.error'
import type { ICreditRepository } from '../../src/domain/interfaces/credit.repository.interface'
import type { IChatPort } from '../../src/application/ports/chat.port'

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
})
