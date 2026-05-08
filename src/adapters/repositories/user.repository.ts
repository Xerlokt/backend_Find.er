import { Role } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { IUserRepository } from '../../domain/interfaces/user.repository.interface'
import { User, UserRole } from '../../domain/entities/user.entity'

export class UserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { email } })
    return row ? this.toDomain(row) : null
  }

  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async create(data: { email: string; passwordHash: string; role: UserRole }): Promise<User> {
    const row = await prisma.user.create({ data: { ...data, role: data.role as Role } })
    return this.toDomain(row)
  }

  async updateGoogleId(id: string, googleId: string, avatarUrl?: string): Promise<User> {
    const row = await prisma.user.update({
      where: { id },
      data: { googleId, ...(avatarUrl !== undefined ? { avatarUrl } : {}) },
    })
    return this.toDomain(row)
  }

  async findOrCreateGoogle(data: {
    googleId: string
    email: string
    avatarUrl?: string
    role: UserRole
  }): Promise<{ user: User; isNew: boolean }> {
    return prisma.$transaction(async (tx) => {
      // Try to find by googleId first (already linked)
      const byGoogleId = await tx.user.findUnique({ where: { googleId: data.googleId } })
      if (byGoogleId) return { user: this.toDomain(byGoogleId), isNew: false }

      // Link googleId to existing account by email
      const existing = await tx.user.findUnique({ where: { email: data.email } })
      if (existing) {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            googleId: data.googleId,
            avatarUrl: data.avatarUrl ?? existing.avatarUrl,
          },
        })
        return { user: this.toDomain(updated), isNew: false }
      }

      // First Google auth — create new user
      const created = await tx.user.create({
        data: {
          email: data.email,
          googleId: data.googleId,
          avatarUrl: data.avatarUrl,
          role: data.role as Role,
        },
      })
      return { user: this.toDomain(created), isNew: true }
    })
  }

  private toDomain(row: {
    id: string
    email: string
    passwordHash: string | null
    googleId: string | null
    avatarUrl: string | null
    role: Role
    createdAt: Date
  }): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      googleId: row.googleId,
      avatarUrl: row.avatarUrl,
      role: row.role as UserRole,
      createdAt: row.createdAt,
    }
  }
}
