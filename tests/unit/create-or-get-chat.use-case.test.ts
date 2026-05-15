import { CreateOrGetChatUseCase } from '../../src/application/use-cases/chat/create-or-get-chat.use-case'
import type { IChatRepository } from '../../src/domain/interfaces/chat.repository.interface'

const makeRepo = (): jest.Mocked<IChatRepository> => ({
  createOrGetChat: jest.fn(),
  createMessage: jest.fn(),
  findMessages: jest.fn(),
  findById: jest.fn(),
  findParticipants: jest.fn(),
  countRecruiterMessages: jest.fn(),
  findByUserId: jest.fn(),
  markMessagesRead: jest.fn(),
} as jest.Mocked<IChatRepository>)

describe('CreateOrGetChatUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns chatId from repo.createOrGetChat', async () => {
    const repo = makeRepo()
    repo.createOrGetChat.mockResolvedValue({ id: 'chat-1' } as any)
    const uc = new CreateOrGetChatUseCase(repo)
    const result = await uc.execute('cand-1', 'comp-1', 'job-1', 'MATCH')
    expect(result).toEqual({ chatId: 'chat-1' })
    expect(repo.createOrGetChat).toHaveBeenCalledWith('cand-1', 'comp-1', 'job-1', 'MATCH')
  })

  it('is idempotent — second call with same args returns same chatId', async () => {
    const repo = makeRepo()
    repo.createOrGetChat.mockResolvedValue({ id: 'existing-chat' } as any)
    const uc = new CreateOrGetChatUseCase(repo)
    const r1 = await uc.execute('cand-1', 'comp-1', 'job-1', 'MATCH')
    const r2 = await uc.execute('cand-1', 'comp-1', 'job-1', 'CREDIT')
    expect(r1.chatId).toBe('existing-chat')
    expect(r2.chatId).toBe('existing-chat')
  })
})
