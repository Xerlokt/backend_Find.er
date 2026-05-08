import { createHash } from 'crypto'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'

export class LogoutUseCase {
  constructor(
    private readonly refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(rawToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const stored = await this.refreshTokenRepo.findByHash(tokenHash)

    if (!stored || stored.revokedAt !== null) {
      // Idempotent — token not found or already revoked; no error thrown
      return
    }

    // Revoke entire family — invalidates all active sessions
    await this.refreshTokenRepo.revokeFamily(stored.familyId)
  }
}
