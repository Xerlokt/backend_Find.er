import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { FastifyInstance } from 'fastify'
import { Role } from '@prisma/client'
import { AuthRepository } from './auth.repository'
import { AppError } from '../../shared/errors/AppError'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

const DUMMY_HASH = '$2b$12$invalidhashpadding00000000000000000000000000000000000000'

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
    const stored = await this.repo.findRefreshTokenByHash(tokenHash)

    if (!stored) {
      throw new AppError('Invalid token', 401, 'UNAUTHORIZED')
    }

    if (stored.revokedAt !== null) {
      // Replay attack — revogar toda a família (D-02)
      await this.repo.revokeRefreshTokenFamily(stored.familyId)
      throw new AppError('Token revoked', 401, 'TOKEN_EXPIRED')
    }

    if (stored.expiresAt < new Date()) {
      throw new AppError('Token expired', 401, 'TOKEN_EXPIRED')
    }

    // Rotação single-use: revogar token atual, emitir novo na mesma família
    await this.repo.revokeRefreshToken(stored.id)

    const user = await this.repo.findUserById(stored.userId)
    if (!user) {
      throw new AppError('User not found', 401, 'UNAUTHORIZED')
    }

    return this.generateTokenPair(user.id, user.role as string, stored.familyId)
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
}
