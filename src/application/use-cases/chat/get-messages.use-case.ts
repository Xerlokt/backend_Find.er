import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { Message } from '../../../domain/entities/message.entity'
import { DomainError } from '../../errors/domain.error'

export interface GetMessagesResult {
  data: Message[]
  nextCursor: string | null
}

export class GetMessagesUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(
    chatId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<GetMessagesResult> {
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) {
      throw new DomainError('Chat not found', 'NOT_FOUND', 404)
    }

    const { candidateUserId, recruiterUserId } = participants
    if (userId !== candidateUserId && userId !== recruiterUserId) {
      throw new DomainError('Not a participant', 'FORBIDDEN', 403)
    }

    const messages = await this.repo.findMessages(chatId, cursor, limit + 1)
    const hasNext = messages.length > limit
    const data = hasNext ? messages.slice(0, limit) : messages
    const nextCursor = hasNext ? data[data.length - 1].id : null

    await this.repo.markMessagesRead(chatId, userId)

    return { data, nextCursor }
  }
}
