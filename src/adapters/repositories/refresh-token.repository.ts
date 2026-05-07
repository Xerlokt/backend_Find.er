import { prisma } from '../../infrastructure/database/prisma'
import { IRefreshTokenRepository } from '../../domain/interfaces/refresh-token.repository.interface'
import { RefreshToken } from '../../domain/entities/refresh-token.entity'

export class RefreshTokenRepository implements IRefreshTokenRepository {
  async create(data: {
    tokenHash: string
    familyId: string
    userId: string
    expiresAt: Date
  }): Promise<RefreshToken> {
    const row = await prisma.refreshToken.create({ data })
    return this.toDomain(row)
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash } })
    return row ? this.toDomain(row) : null
  }

  async revoke(id: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    })
  }

  async revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async revokeByHash(tokenHash: string): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return result.count
  }

  private toDomain(row: {
    id: string
    tokenHash: string
    familyId: string
    userId: string
    expiresAt: Date
    revokedAt: Date | null
    createdAt: Date
  }): RefreshToken {
    return {
      id: row.id,
      tokenHash: row.tokenHash,
      familyId: row.familyId,
      userId: row.userId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    }
  }
}
