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

  async findOrCreateGoogleUser(data: {
    googleId: string
    email: string
    name?: string
    avatarUrl?: string
    role: 'CANDIDATE' | 'RECRUITER'
  }): Promise<{ user: Awaited<ReturnType<typeof prisma.user.findUnique>>; isNew: boolean }> {
    // Tentar encontrar por googleId primeiro (já vinculado)
    const byGoogleId = await prisma.user.findUnique({
      where: { googleId: data.googleId },
    })
    if (byGoogleId) {
      return { user: byGoogleId, isNew: false }
    }

    // D-06: email existente → vincular googleId ao usuário existente (upsert por email)
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId: data.googleId,
          avatarUrl: data.avatarUrl ?? existing.avatarUrl,
        },
      })
      return { user: updated, isNew: false }
    }

    // D-05: primeira autenticação Google → criar novo usuário
    const created = await prisma.user.create({
      data: {
        email: data.email,
        googleId: data.googleId,
        avatarUrl: data.avatarUrl,
        role: data.role as Role,
        // passwordHash: null — conta Google não tem senha local
      },
    })
    return { user: created, isNew: true }
  }
}
