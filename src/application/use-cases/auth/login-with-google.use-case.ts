import { randomBytes } from 'crypto'
import { OAuth2Client } from 'google-auth-library'
import { IUserRepository } from '../../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ITokenPort } from '../../ports/token.port'
import { DomainError } from '../../errors/domain.error'

// OAuth2Client stays in use case for Phase 10 — no IGoogleAuthPort port yet (deferred)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

interface LoginWithGoogleInput {
  idToken: string
  role: 'CANDIDATE' | 'RECRUITER'
}

export class LoginWithGoogleUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly token: ITokenPort,
  ) {}

  async execute(input: LoginWithGoogleInput): Promise<{ accessToken: string; refreshToken: string; isNew: boolean }> {
    let googlePayload: { sub: string; email: string; picture?: string }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      const payload = ticket.getPayload()!
      googlePayload = {
        sub: payload.sub,
        email: payload.email!,
        picture: payload.picture,
      }
    } catch {
      throw new DomainError('Invalid Google token', 'INVALID_CREDENTIALS', 401)
    }

    const { user, isNew } = await this.userRepo.findOrCreateGoogle({
      googleId: googlePayload.sub,
      email: googlePayload.email,
      avatarUrl: googlePayload.picture,
      role: input.role,
    })

    const accessToken = this.token.signAccess({ id: user.id, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt })
    const { raw, hashed } = this.token.generateRefreshToken()
    const familyId = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await this.refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })

    return { accessToken, refreshToken: raw, isNew }
  }
}
