import { randomBytes } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../ports/hash.port'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'
import { ISendEmailVerification } from './send-email-verification.use-case'

interface RegisterInput {
  email: string
  password: string
  role: 'CANDIDATE' | 'RECRUITER'
}

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly hash: IHashPort,
    private readonly token: ITokenPort,
    private readonly sendVerification?: ISendEmailVerification,
  ) {}

  async execute(input: RegisterInput): Promise<{ accessToken: string; refreshToken: string }> {
    const existing = await this.userRepo.findByEmail(input.email)
    if (existing) {
      // quem nunca verificou o email não segura o endereço: recadastro substitui a conta antiga
      const freed = !existing.emailVerifiedAt && (await this.userRepo.deleteUnverifiedByEmail(input.email))
      if (!freed) throw new DomainError('Email already in use', 'CONFLICT', 409)
    }

    const passwordHash = await this.hash.hash(input.password)
    const user = await this.userRepo.create({ email: input.email, passwordHash, role: input.role })

    const accessToken = this.token.signAccess({ id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt })
    const { raw, hashed } = this.token.generateRefreshToken()
    const familyId = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })

    // falha no envio não derruba o cadastro: o usuário pode pedir reenvio
    await this.sendVerification?.execute(user.id).catch(() => undefined)

    return { accessToken, refreshToken: raw }
  }
}
