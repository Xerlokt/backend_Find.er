import { DomainError } from '../../application/errors/domain.error'
import { ChatInitiator } from '../../domain/entities/chat.entity'
import type { IChatPort } from '../../application/ports/chat.port'
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface'

export class ChatService implements IChatPort {
  constructor(private readonly repo: IChatRepository) {}

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
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) throw new DomainError('Chat not found', 'NOT_FOUND', 404)

    const { candidateUserId, recruiterUserId } = participants

    // Participant check (D-09): sender must be candidate or recruiter
    if (senderId !== candidateUserId && senderId !== recruiterUserId) {
      throw new DomainError('Not a participant', 'NOT_PARTICIPANT', 403)
    }

    // Recruiter-first rule (D-04): check by senderId vs recruiter's userId, NOT by role
    const recruiterMessageCount = await this.repo.countRecruiterMessages(chatId, recruiterUserId)
    if (recruiterMessageCount === 0 && senderId !== recruiterUserId) {
      throw new DomainError('Recruiter must send first message', 'RECRUITER_MUST_INITIATE', 403)
    }

    return this.repo.createMessage(chatId, senderId, content)
  }

  async verifyParticipant(chatId: string, userId: string): Promise<boolean> {
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) return false
    return userId === participants.candidateUserId || userId === participants.recruiterUserId
  }

  async getMessages(
    chatId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ data: object[]; nextCursor: string | null }> {
    const isParticipant = await this.verifyParticipant(chatId, userId)
    if (!isParticipant) throw new DomainError('Not a participant', 'NOT_PARTICIPANT', 403)

    const results = await this.repo.findMessages(chatId, cursor, limit + 1)
    const hasNext = results.length > limit
    const data = hasNext ? results.slice(0, limit) : results
    const nextCursor = hasNext ? data[data.length - 1].id : null

    // Mark-as-read: update messages from the OTHER participant (D-14)
    await this.repo.markMessagesRead(chatId, userId)

    return { data, nextCursor }
  }

  async listChats(userId: string) {
    const chats = await this.repo.findByUserId(userId)
    return chats.map((chat) => ({
      chatId: chat.id,
      jobId: chat.jobId,
      initiatedBy: chat.initiatedBy,
      isActive: chat.isActive,
      createdAt: chat.createdAt,
      // Other participant's display name (D-12)
      otherParticipantName:
        chat.candidateUserId === userId
          ? chat.companyName   // candidate sees company name
          : chat.candidateName, // recruiter sees candidate name
    }))
  }
}
