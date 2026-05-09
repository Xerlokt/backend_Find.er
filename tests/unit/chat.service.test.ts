import { ChatService } from '../../src/modules/chat/chat.service'
import { IChatRepository, ChatParticipants, ChatListItem } from '../../src/domain/interfaces/chat.repository.interface'
import { AppError } from '../../src/shared/errors/AppError'

// Mock repository — no DB in unit tests
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

const makeParticipants = (overrides: Partial<ChatParticipants> = {}): ChatParticipants => ({
  candidateUserId: overrides.candidateUserId ?? 'candidate-user-1',
  recruiterUserId: overrides.recruiterUserId ?? 'recruiter-user-1',
})

const makeMessage = (overrides: Partial<{
  id: string
  chatId: string
  senderId: string
  content: string
  createdAt: Date
  readAt: Date | null
}> = {}) => ({
  id: overrides.id ?? 'msg-1',
  chatId: overrides.chatId ?? 'chat-1',
  senderId: overrides.senderId ?? 'user-1',
  content: overrides.content ?? 'Hello',
  createdAt: overrides.createdAt ?? new Date(),
  readAt: overrides.readAt ?? null,
})

const makeChatListItem = (overrides: Partial<ChatListItem> = {}): ChatListItem => ({
  id: overrides.id ?? 'chat-1',
  jobId: overrides.jobId ?? 'job-1',
  initiatedBy: overrides.initiatedBy ?? 'MATCH' as any,
  isActive: overrides.isActive ?? true,
  createdAt: overrides.createdAt ?? new Date(),
  candidateName: overrides.candidateName ?? 'John Candidate',
  candidateUserId: overrides.candidateUserId ?? 'candidate-user-1',
  companyName: overrides.companyName ?? 'Acme Corp',
  recruiterUserId: overrides.recruiterUserId ?? 'recruiter-user-1',
})

describe('ChatService', () => {
  let repo: jest.Mocked<IChatRepository>
  let service: ChatService

  beforeEach(() => {
    repo = makeRepo()
    service = new ChatService(repo)
    jest.clearAllMocks()
  })

  describe('createOrGetChat', () => {
    it('retorna chatId quando chat criado com sucesso', async () => {
      repo.createOrGetChat.mockResolvedValue({ id: 'chat-1' } as any)
      const result = await service.createOrGetChat('cand-1', 'comp-1', 'job-1', 'MATCH' as any)
      expect(result).toEqual({ chatId: 'chat-1' })
      expect(repo.createOrGetChat).toHaveBeenCalledWith('cand-1', 'comp-1', 'job-1', 'MATCH')
    })

    it('retorna chatId do chat existente (idempotente)', async () => {
      repo.createOrGetChat.mockResolvedValue({ id: 'existing-chat' } as any)
      const r1 = await service.createOrGetChat('cand-1', 'comp-1', 'job-1', 'MATCH' as any)
      const r2 = await service.createOrGetChat('cand-1', 'comp-1', 'job-1', 'CREDIT' as any)
      expect(r1.chatId).toBe('existing-chat')
      expect(r2.chatId).toBe('existing-chat')
    })
  })

  describe('sendMessage', () => {
    it('lança AppError 404 NOT_FOUND quando chat não existe', async () => {
      repo.findParticipants.mockResolvedValue(null)
      await expect(service.sendMessage('chat-x', 'user-1', 'Hello'))
        .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
      expect(repo.createMessage).not.toHaveBeenCalled()
    })

    it('lança AppError 403 NOT_PARTICIPANT quando user não é participante', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-OTHER',
        recruiterUserId: 'recruiter-user-OTHER',
      }))
      await expect(service.sendMessage('chat-1', 'user-UNKNOWN', 'Hello'))
        .rejects.toMatchObject({ statusCode: 403, code: 'NOT_PARTICIPANT' })
      expect(repo.createMessage).not.toHaveBeenCalled()
    })

    it('lança AppError 403 RECRUITER_MUST_INITIATE quando candidato tenta enviar antes do recrutador', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
      }))
      repo.countRecruiterMessages.mockResolvedValue(0)
      await expect(service.sendMessage('chat-1', 'candidate-user-1', 'Hello first'))
        .rejects.toMatchObject({ statusCode: 403, code: 'RECRUITER_MUST_INITIATE' })
      expect(repo.createMessage).not.toHaveBeenCalled()
    })

    it('persiste e retorna mensagem quando recrutador envia primeira mensagem', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
      }))
      repo.countRecruiterMessages.mockResolvedValue(0)
      repo.createMessage.mockResolvedValue(makeMessage({ senderId: 'recruiter-user-1' }) as any)
      const result = await service.sendMessage('chat-1', 'recruiter-user-1', 'Welcome!')
      expect(repo.createMessage).toHaveBeenCalledWith('chat-1', 'recruiter-user-1', 'Welcome!')
      expect(result).toMatchObject({ chatId: 'chat-1', senderId: 'recruiter-user-1' })
    })

    it('persiste mensagem do candidato quando recrutador já enviou antes', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
      }))
      repo.countRecruiterMessages.mockResolvedValue(1) // recruiter has sent a message
      repo.createMessage.mockResolvedValue(makeMessage({ senderId: 'candidate-user-1' }) as any)
      const result = await service.sendMessage('chat-1', 'candidate-user-1', 'Thanks!')
      expect(repo.createMessage).toHaveBeenCalledWith('chat-1', 'candidate-user-1', 'Thanks!')
      expect(result).toMatchObject({ chatId: 'chat-1' })
    })
  })

  describe('getMessages', () => {
    it('retorna { data, nextCursor: null } quando não há próxima página', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants())
      const msgs = [makeMessage({ id: 'msg-1' }), makeMessage({ id: 'msg-2' })]
      repo.findMessages.mockResolvedValue(msgs as any)
      repo.markMessagesRead.mockResolvedValue(undefined as any)
      const result = await service.getMessages('chat-1', 'candidate-user-1', undefined, 20)
      expect(result.data).toHaveLength(2)
      expect(result.nextCursor).toBeNull()
    })

    it('retorna nextCursor quando há mais mensagens', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants())
      // Return limit+1 items to signal there is a next page
      const msgs = Array.from({ length: 21 }, (_, i) => makeMessage({ id: `msg-${i}` }))
      repo.findMessages.mockResolvedValue(msgs as any)
      repo.markMessagesRead.mockResolvedValue(undefined as any)
      const result = await service.getMessages('chat-1', 'candidate-user-1', undefined, 20)
      expect(result.data).toHaveLength(20)
      expect(result.nextCursor).toBe('msg-19')
    })
  })

  describe('verifyParticipant', () => {
    it('retorna true quando userId é o candidato', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
      }))
      const result = await service.verifyParticipant('chat-1', 'candidate-user-1')
      expect(result).toBe(true)
    })

    it('retorna true quando userId é o recrutador do job', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
      }))
      const result = await service.verifyParticipant('chat-1', 'recruiter-user-1')
      expect(result).toBe(true)
    })

    it('retorna false quando userId não é participante', async () => {
      repo.findParticipants.mockResolvedValue(makeParticipants({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
      }))
      const result = await service.verifyParticipant('chat-1', 'random-user-id')
      expect(result).toBe(false)
    })

    it('retorna false quando chat não encontrado', async () => {
      repo.findParticipants.mockResolvedValue(null)
      const result = await service.verifyParticipant('chat-99', 'any-user')
      expect(result).toBe(false)
    })
  })

  describe('listChats', () => {
    it('mapeia chats com otherParticipantName correto para candidato', async () => {
      const chat = makeChatListItem({
        candidateUserId: 'candidate-user-1',
        companyName: 'Acme Corp',
        candidateName: 'John Doe',
      })
      repo.findByUserId.mockResolvedValue([chat])
      const result = await service.listChats('candidate-user-1')
      expect(result[0].otherParticipantName).toBe('Acme Corp')
    })

    it('mapeia chats com otherParticipantName correto para recrutador', async () => {
      const chat = makeChatListItem({
        candidateUserId: 'candidate-user-1',
        recruiterUserId: 'recruiter-user-1',
        companyName: 'Acme Corp',
        candidateName: 'John Doe',
      })
      repo.findByUserId.mockResolvedValue([chat])
      const result = await service.listChats('recruiter-user-1')
      expect(result[0].otherParticipantName).toBe('John Doe')
    })
  })
})
