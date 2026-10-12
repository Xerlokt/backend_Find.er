import { randomBytes } from 'crypto'
import { User } from '../../../domain/entities/user.entity'
import { IRefreshTokenRepository } from '../../../domain/interfaces/refresh-token.repository.interface'
import { ITokenPort } from '../../ports/token.port'

/** Emite access + refresh token novos para o usuário (família nova). */
export async function issueTokens(
  user: Pick<User, 'id' | 'email' | 'role'>,
  emailVerified: boolean,
  refreshTokenRepo: IRefreshTokenRepository,
  token: ITokenPort,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = token.signAccess({ id: user.id, email: user.email, role: user.role, emailVerified })
  const { raw, hashed } = token.generateRefreshToken()
  const familyId = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await refreshTokenRepo.create({ tokenHash: hashed, familyId, userId: user.id, expiresAt })
  return { accessToken, refreshToken: raw }
}
