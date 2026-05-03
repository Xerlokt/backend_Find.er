import { ChatRepository } from './chat.repository'
import { AppError } from '../../shared/errors/AppError'
import { ChatInitiator } from '@prisma/client'
import type { IChatService } from '../../shared/interfaces/chat.interface'

export class ChatService implements IChatService {
  constructor(private readonly repo: ChatRepository) {}

  async createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }> {
    const chat = await this.repo.createOrGetChat(candidateId, companyId, jobId, initiator)
    return { chatId: chat.id }
  }

  async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
  ): Promise<{
    id: string
    chatId: string
    senderId: string
    content: string
    createdAt: Date
    readAt: Date | null
  }> {
    const chat = await this.repo.findChatWithParticipants(chatId)
    if (!chat) throw new AppError('Chat not found', 404, 'NOT_FOUND')

    const candidateUserId = chat.candidate?.userId ?? null
    const recruiterUserId = chat.job?.recruiter?.userId ?? null

    // Participant check (D-09): sender must be candidate or recruiter
    if (senderId !== candidateUserId && senderId !== recruiterUserId) {
      throw new AppError('Not a participant', 403, 'NOT_PARTICIPANT')
    }

    // Recruiter-first rule (D-04): check by senderId vs recruiter's userId, NOT by role
    const recruiterMessageCount = recruiterUserId
      ? await this.repo.countRecruiterMessages(chatId, recruiterUserId)
      : 0
    if (recruiterMessageCount === 0 && senderId !== recruiterUserId) {
      throw new AppError('Recruiter must send first message', 403, 'RECRUITER_MUST_INITIATE')
    }

    return this.repo.createMessage(chatId, senderId, content)
  }

  async verifyParticipant(chatId: string, userId: string): Promise<boolean> {
    const chat = await this.repo.findChatWithParticipants(chatId)
    if (!chat) return false
    const candidateUserId = chat.candidate.userId
    const recruiterUserId = chat.job.recruiter.userId
    return userId === candidateUserId || userId === recruiterUserId
  }

  async getMessages(
    chatId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ data: object[]; nextCursor: string | null }> {
    const isParticipant = await this.verifyParticipant(chatId, userId)
    if (!isParticipant) throw new AppError('Not a participant', 403, 'NOT_PARTICIPANT')

    const results = await this.repo.findMessages(chatId, cursor, limit)
    const hasNext = results.length > limit
    const data = hasNext ? results.slice(0, limit) : results
    const nextCursor = hasNext ? data[data.length - 1].id : null

    // Mark-as-read: update messages from the OTHER participant (D-14)
    await this.repo.markMessagesRead(chatId, userId)

    return { data, nextCursor }
  }

  async listChats(userId: string) {
    const chats = await this.repo.findChatsByUserId(userId)
    return chats.map((chat) => ({
      chatId: chat.id,
      jobId: chat.jobId,
      initiatedBy: chat.initiatedBy,
      isActive: chat.isActive,
      createdAt: chat.createdAt,
      // Other participant's display name (D-12)
      otherParticipantName:
        chat.candidate.userId === userId
          ? chat.job.company.name // candidate sees company name
          : chat.candidate.name,  // recruiter sees candidate name
    }))
  }
}
