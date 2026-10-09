import type { IPushTokenRepository } from '../../../domain/interfaces/push-token.repository.interface'

export class UnregisterPushTokenUseCase {
  constructor(private readonly repo: IPushTokenRepository) {}

  async execute(userId: string, token: string): Promise<void> {
    await this.repo.remove(userId, token)
  }
}
