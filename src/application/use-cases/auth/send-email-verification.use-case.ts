import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IEmailVerificationRepository } from '../../../domain/interfaces/email-verification.repository.interface'
import { IMailerPort } from '../../ports/mailer.port'
import { DomainError } from '../../errors/domain.error'
import { CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, generateCode, hashCode } from './email-code'

export interface ISendEmailVerification {
  execute(userId: string): Promise<void>
}

export class SendEmailVerificationUseCase implements ISendEmailVerification {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly verificationRepo: IEmailVerificationRepository,
    private readonly mailer: IMailerPort,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new DomainError('User not found', 'UNAUTHORIZED', 401)
    if (user.emailVerifiedAt) return

    const current = await this.verificationRepo.findByUserId(userId)
    if (current) {
      const waitMs = current.lastSentAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()
      if (waitMs > 0) {
        throw new DomainError('Aguarde para pedir outro código', 'RESEND_TOO_SOON', 429)
      }
    }

    const code = generateCode()
    await this.verificationRepo.upsert({
      userId,
      codeHash: hashCode(userId, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
    })

    try {
      await this.mailer.sendVerificationCode(user.email, code, CODE_TTL_MINUTES)
    } catch (err) {
      console.error('[mailer] falha ao enviar código', err)
      throw new DomainError('Não foi possível enviar o email', 'EMAIL_SEND_FAILED', 502)
    }
  }
}
