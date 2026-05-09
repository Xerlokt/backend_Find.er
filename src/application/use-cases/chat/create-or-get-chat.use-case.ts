import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'
import { ChatInitiator } from '../../../domain/entities/chat.entity'

export class CreateOrGetChatUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }> {
    const chat = await this.repo.createOrGetChat(candidateId, companyId, jobId, initiator)
    return { chatId: chat.id }
  }
}
