import { randomBytes } from 'crypto'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../ports/hash.port'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

// Generated via: bcryptjs.hashSync('__dummy__', 12)
// Timing safety: bcrypt.compare always runs a full comparison even when user not found
const DUMMY_HASH = '$2b$12$LVfxFJGoT4lbSwHhLU8kCOy8xQpBLaIH5TNXLilzj5Wky3l2KBKP2'

interface LoginInput {
  email: string
  password: string
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly hash: IHashPort,
    private readonly token: ITokenPort,
  ) {}

  async execute(input: LoginInput): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepo.findByEmail(input.email)

    // Timing-safe: always run compare even when user not found (prevents timing oracle attack)
    const passwordMatch = await this.hash.compare(
      input.password,
      user?.passwordHash ?? DUMMY_HASH,
    )

    if (!user || !passwordMatch) {
      throw new DomainError('Invalid credentials', 'INVALID_CREDENTIALS', 401)
    }

    const accessToken = this.token.signAccess({ id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt })
    const { raw, hashed } = this.token.generateRefreshToken()
    const familyId = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })

    return { accessToken, refreshToken: raw }
  }
}
