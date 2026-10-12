import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IEmailVerificationRepository } from '../../../domain/interfaces/email-verification.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'
import { ISendEmailVerification } from './send-email-verification.use-case'
import { issueTokens } from './issue-tokens'

/** Corrige o email de uma conta ainda não verificada e manda um código novo para o endereço certo. */
export class ChangeUnverifiedEmailUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly verificationRepo: IEmailVerificationRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly token: ITokenPort,
    private readonly sendVerification: ISendEmailVerification,
  ) {}

  async execute(userId: string, newEmail: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new DomainError('User not found', 'UNAUTHORIZED', 401)
    if (user.emailVerifiedAt) throw new DomainError('Email já verificado', 'ALREADY_VERIFIED', 409)

    if (newEmail !== user.email) {
      const other = await this.userRepo.findByEmail(newEmail)
      if (other && other.id !== user.id) {
        // outra conta que nunca verificou o email não segura o endereço
        const freed = await this.userRepo.deleteUnverifiedByEmail(newEmail)
        if (!freed) throw new DomainError('Email already in use', 'CONFLICT', 409)
      }
      await this.userRepo.updateEmail(userId, newEmail)
      // o código antigo era do endereço errado
      await this.verificationRepo.deleteByUserId(userId)
    }

    await this.sendVerification.execute(userId)
    return issueTokens({ ...user, email: newEmail }, false, this.refreshTokenRepo, this.token)
  }
}
