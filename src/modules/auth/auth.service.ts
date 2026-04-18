import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { FastifyInstance } from 'fastify'
import { Role } from '@prisma/client'
import { OAuth2Client } from 'google-auth-library'
import { AuthRepository } from './auth.repository'
import { AppError } from '../../shared/errors/AppError'
import { prisma } from '../../shared/db/prisma'

// Singleton Google OAuth2 client — instanciado uma vez por módulo
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

// Generated via: bcryptjs.hashSync('__dummy__', 12)
// Verify: length === 60 and starts with '$2b$12$'
const DUMMY_HASH = '$2b$12$LVfxFJGoT4lbSwHhLU8kCOy8xQpBLaIH5TNXLilzj5Wky3l2KBKP2'

export function generateRefreshToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  return { rawToken, tokenHash }
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly app: FastifyInstance,
  ) {}

  async register(input: { email: string; password: string; role: 'CANDIDATE' | 'RECRUITER' }): Promise<TokenPair> {
    const existing = await this.repo.findUserByEmail(input.email)
    if (existing) {
      throw new AppError('Email already in use', 409, 'CONFLICT')
    }

    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await this.repo.createUser({
      email: input.email,
      passwordHash,
      role: input.role as Role,
    })

    return this.generateTokenPair(user.id, user.role as string, randomBytes(16).toString('hex'))
  }

  async login(input: { email: string; password: string }): Promise<TokenPair> {
    const user = await this.repo.findUserByEmail(input.email)

    // Timing-safe: sempre roda bcrypt.compare mesmo quando user não existe
    const passwordMatch = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? DUMMY_HASH,
    )

    if (!user || !passwordMatch) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    }

    return this.generateTokenPair(user.id, user.role as string, randomBytes(16).toString('hex'))
  }

  async generateTokenPair(userId: string, role: string, familyId: string): Promise<TokenPair> {
    const accessToken = this.app.jwt.sign(
      { id: userId, role },
      { expiresIn: '15m' },
    )

    const { rawToken, tokenHash } = generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await this.repo.createRefreshToken({ tokenHash, familyId, userId, expiresAt })

    return { accessToken, refreshToken: rawToken }
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken)

    return prisma.$transaction(async (tx) => {
      // Atomic find-and-revoke: only one concurrent request will get count === 1
      const revoked = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      const stored = await tx.refreshToken.findUnique({ where: { tokenHash } })
      if (!stored) throw new AppError('Invalid token', 401, 'UNAUTHORIZED')

      if (revoked.count === 0) {
        // Replay attack — revogar toda a família (D-02)
        await tx.refreshToken.updateMany({ where: { familyId: stored.familyId }, data: { revokedAt: new Date() } })
        throw new AppError('Token revoked', 401, 'TOKEN_EXPIRED')
      }

      if (stored.expiresAt < new Date()) throw new AppError('Token expired', 401, 'TOKEN_EXPIRED')

      const user = await tx.user.findUnique({ where: { id: stored.userId } })
      if (!user) throw new AppError('User not found', 401, 'UNAUTHORIZED')

      const { rawToken: newRaw, tokenHash: newHash } = generateRefreshToken()
      await tx.refreshToken.create({
        data: {
          tokenHash: newHash,
          familyId: stored.familyId,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
      const accessToken = this.app.jwt.sign({ id: user.id, role: user.role }, { expiresIn: '15m' })
      return { accessToken, refreshToken: newRaw }
    })
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken)
    const stored = await this.repo.findRefreshTokenByHash(tokenHash)

    if (!stored || stored.revokedAt !== null) {
      // Token inexistente ou já revogado — idempotente, não lançar erro
      return
    }

    await this.repo.revokeRefreshToken(stored.id)
  }

  async loginWithGoogle(input: {
    idToken: string
    role: 'CANDIDATE' | 'RECRUITER'
  }): Promise<TokenPair> {
    let googlePayload: { sub: string; email: string; name?: string; picture?: string }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      const payload = ticket.getPayload()!
      googlePayload = {
        sub: payload.sub,
        email: payload.email!,
        name: payload.name,
        picture: payload.picture,
      }
    } catch {
      // google-auth-library lança Error genérico — não subclasse tipada (Pitfall 3)
      throw new AppError('Invalid Google token', 401, 'INVALID_CREDENTIALS')
    }

    const { user } = await this.repo.findOrCreateGoogleUser({
      googleId: googlePayload.sub,
      email: googlePayload.email,
      name: googlePayload.name,
      avatarUrl: googlePayload.picture,
      role: input.role,
    })

    const familyId = randomBytes(16).toString('hex')
    return this.generateTokenPair(user.id, user.role as string, familyId)
  }
}
