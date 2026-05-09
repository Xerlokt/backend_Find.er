import { IChatRepository } from '../../../domain/interfaces/chat.repository.interface'

export class VerifyParticipantUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(chatId: string, userId: string): Promise<boolean> {
    const participants = await this.repo.findParticipants(chatId)
    if (!participants) return false
    const { candidateUserId, recruiterUserId } = participants
    return userId === candidateUserId || userId === recruiterUserId
  }
}
