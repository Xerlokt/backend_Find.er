import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { Message } from '../../../domain/entities/message.entity'
import { DomainError } from '../../errors/domain.error'

export class SendMessageUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(chatId: string, senderId: string, content: string): Promise<Message> {
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) {
      throw new DomainError('Chat not found', 'NOT_FOUND', 404)
    }

    const { candidateUserId, recruiterUserId } = participants

    if (senderId !== candidateUserId && senderId !== recruiterUserId) {
      throw new DomainError('Not a participant', 'NOT_PARTICIPANT', 403)
    }

    const recruiterMessageCount = await this.repo.countRecruiterMessages(chatId, recruiterUserId)
    if (recruiterMessageCount === 0 && senderId !== recruiterUserId) {
      throw new DomainError('Recruiter must send first message', 'RECRUITER_MUST_INITIATE', 403)
    }

    return this.repo.createMessage(chatId, senderId, content)
  }
}
