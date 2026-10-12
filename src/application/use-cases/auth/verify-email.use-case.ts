import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IEmailVerificationRepository } from '../../../domain/interfaces/email-verification.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'
import { MAX_ATTEMPTS, codesMatch } from './email-code'
import { issueTokens } from './issue-tokens'

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly verificationRepo: IEmailVerificationRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly token: ITokenPort,
  ) {}

  /** Confere o código e devolve tokens novos (com emailVerified: true). */
  async execute(userId: string, code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new DomainError('User not found', 'UNAUTHORIZED', 401)

    if (!user.emailVerifiedAt) {
      const record = await this.verificationRepo.findByUserId(userId)
      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw new DomainError('Código expirado', 'CODE_EXPIRED', 410)
      }
      if (record.attempts >= MAX_ATTEMPTS) {
        throw new DomainError('Muitas tentativas. Peça um novo código', 'TOO_MANY_ATTEMPTS', 429)
      }
      if (!codesMatch(record.codeHash, userId, code)) {
        await this.verificationRepo.incrementAttempts(userId)
        throw new DomainError('Código inválido', 'INVALID_CODE', 400)
      }
      await this.userRepo.markEmailVerified(userId)
      await this.verificationRepo.deleteByUserId(userId)
    }

    return issueTokens(user, true, this.refreshTokenRepo, this.token)
  }
}
