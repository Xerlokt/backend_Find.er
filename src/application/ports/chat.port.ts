import { ChatInitiator } from '../../domain/entities/chat.entity'

export interface IChatPort {
  createOrGetChat(
    candidateId: string,
    companyId: string,
    jobId: string,
    initiator: ChatInitiator,
  ): Promise<{ chatId: string }>
}
