import { IChatRepository, ChatListItem } from '../../../domain/interfaces/chat.repository.interface'

export class ListChatsUseCase {
  constructor(private readonly repo: IChatRepository) {}

  async execute(userId: string): Promise<ChatListItem[]> {
    return this.repo.findByUserId(userId)
  }
}
