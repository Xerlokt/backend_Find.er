import { RecordSwipeUseCase } from '../../src/application/use-cases/swipe/record-swipe.use-case'
import type { ISwipeRepository } from '../../src/domain/interfaces/swipe.repository.interface'
import type { IChatPort } from '../../src/application/ports/chat.port'

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

const activeJob = { id: 'job-1', companyId: 'comp-1', isActive: true, expiresAt: new Date(Date.now() + 86400000) }

describe('RecordSwipeUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws NOT_FOUND (404) when candidate profile does not exist', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue(null)
    const uc = new RecordSwipeUseCase(repo, makeChatPort())
    await expect(uc.execute('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('throws NOT_FOUND (404) when job does not exist', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(null)
    const uc = new RecordSwipeUseCase(repo, makeChatPort())
    await expect(uc.execute('user-1', 'job-1', 'LIKE')).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('calls chat.createOrGetChat and returns chatId when direction is LIKE', async () => {
    const repo = makeSwipeRepo()
    repo.findCandidateProfileByUserId.mockResolvedValue({ id: 'cand-1' } as any)
    repo.findJobById.mockResolvedValue(activeJob as any)
    repo.createSwipe.mockResolvedValue({ candidateId: 'cand-1', jobId: 'job-1', direction: 'LIKE' } as any)
    const chat = makeChatPort()
    const uc = new RecordSwipeUseCase(repo, chat)
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
    const uc = new RecordSwipeUseCase(repo, chat)
    await uc.execute('user-1', 'job-1', 'DISLIKE')
    expect(chat.createOrGetChat).not.toHaveBeenCalled()
  })
})
