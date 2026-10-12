import { createHash } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly token: ITokenPort,
  ) {}

  async execute(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    // Atomic revoke — Prisma updateMany is a single SQL UPDATE.
    // count=1: we revoked it (valid use). count=0: already revoked (replay attack).
    const count = await this.refreshTokenRepo.revokeByHash(tokenHash)
    const stored = await this.refreshTokenRepo.findByHash(tokenHash)

    if (!stored) {
      throw new DomainError('Invalid token', 'UNAUTHORIZED', 401)
    }

    if (count === 0) {
      // Replay attack detected — revoke entire token family to invalidate all sessions
      await this.refreshTokenRepo.revokeFamily(stored.familyId)
      throw new DomainError('Token revoked', 'TOKEN_EXPIRED', 401)
    }

    if (stored.expiresAt < new Date()) {
      throw new DomainError('Token expired', 'TOKEN_EXPIRED', 401)
    }

    const user = await this.userRepo.findById(stored.userId)
    if (!user) {
      throw new DomainError('User not found', 'UNAUTHORIZED', 401)
    }

    const accessToken = this.token.signAccess({ id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt })
    const { raw, hashed } = this.token.generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({
      tokenHash: hashed,
      familyId: stored.familyId,
      userId: user.id,
      expiresAt,
    })

    return { accessToken, refreshToken: raw }
  }
}
