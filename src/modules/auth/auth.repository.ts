import { prisma } from '../../shared/db/prisma'
import { Role } from '@prisma/client'

export class AuthRepository {
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } })
  }

  async createUser(data: { email: string; passwordHash: string; role: Role }) {
    return prisma.user.create({ data })
  }

  async createRefreshToken(data: {
    tokenHash: string
    familyId: string
    userId: string
    expiresAt: Date
  }) {
    return prisma.refreshToken.create({ data })
  }

  async findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } })
  }

  async revokeRefreshToken(id: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    })
  }

  async revokeRefreshTokenFamily(familyId: string) {
    return prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } })
  }
}
