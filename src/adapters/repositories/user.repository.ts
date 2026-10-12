import { Role } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { IUserRepository, UserPublic } from '../../domain/interfaces/user.repository.interface'
import { User, UserRole } from '../../domain/entities/user.entity'
import { DomainError } from '../../application/errors/domain.error'

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

  async markEmailVerified(id: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } })
  }

  async updateEmail(id: string, email: string): Promise<void> {
    try {
      await prisma.user.update({ where: { id }, data: { email } })
    } catch (e: any) {
      if (e?.code === 'P2002') throw new DomainError('Email already in use', 'CONFLICT', 409)
      throw e
    }
  }

  async deleteUnverifiedByEmail(email: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email },
        include: { recruiterProfile: true },
      })
      if (!user || user.emailVerifiedAt || user.role === 'ADMIN') return false

      await tx.user.delete({ where: { id: user.id } })
      const companyId = user.recruiterProfile?.companyId
      if (companyId) {
        // conta nova nunca verificou o email, então não pode ter vagas/chats: só remove empresa órfã
        const left = await tx.recruiterProfile.count({ where: { companyId } })
        const jobs = await tx.job.count({ where: { companyId } })
        if (left === 0 && jobs === 0) await tx.company.delete({ where: { id: companyId } })
      }
      return true
    })
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
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
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
          emailVerifiedAt: new Date(),
        },
      })
      return { user: this.toDomain(created), isNew: true }
    })
  }

  async findMany(opts: { skip: number; take: number }): Promise<UserPublic[]> {
    const rows = await prisma.user.findMany({
      skip: opts.skip,
      take: opts.take,
      select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true, emailVerifiedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return rows as UserPublic[]
  }

  async findByIdPublic(id: string): Promise<UserPublic | null> {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, avatarUrl: true, createdAt: true, emailVerifiedAt: true },
    })
    return row as UserPublic | null
  }

  private toDomain(row: {
    id: string
    email: string
    passwordHash: string | null
    googleId: string | null
    avatarUrl: string | null
    role: Role
    createdAt: Date
    emailVerifiedAt: Date | null
  }): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      googleId: row.googleId,
      avatarUrl: row.avatarUrl,
      role: row.role as UserRole,
      createdAt: row.createdAt,
      emailVerifiedAt: row.emailVerifiedAt,
    }
  }
}
