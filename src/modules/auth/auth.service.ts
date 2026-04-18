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
}
