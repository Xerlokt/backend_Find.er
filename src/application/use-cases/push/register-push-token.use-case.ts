import { DomainError } from '../../errors/domain.error'
import type { IPushTokenRepository } from '../../../domain/interfaces/push-token.repository.interface'

export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]+\]$/

export class RegisterPushTokenUseCase {
  constructor(private readonly repo: IPushTokenRepository) {}

  async execute(userId: string, token: string): Promise<void> {
    if (!EXPO_TOKEN_RE.test(token)) throw new DomainError('Invalid push token', 'INVALID_PUSH_TOKEN', 400)
    await this.repo.upsert(userId, token)
  }
}
