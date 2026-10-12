import { prisma } from '../../infrastructure/database/prisma'
import {
  EmailVerification,
  IEmailVerificationRepository,
} from '../../domain/interfaces/email-verification.repository.interface'

export class EmailVerificationRepository implements IEmailVerificationRepository {
  async upsert(data: { userId: string; codeHash: string; expiresAt: Date }): Promise<void> {
    const fresh = { codeHash: data.codeHash, expiresAt: data.expiresAt, attempts: 0, lastSentAt: new Date() }
    await prisma.emailVerification.upsert({
      where: { userId: data.userId },
      create: { userId: data.userId, ...fresh },
      update: fresh,
    })
  }

  async findByUserId(userId: string): Promise<EmailVerification | null> {
    return prisma.emailVerification.findUnique({ where: { userId } })
  }

  async incrementAttempts(userId: string): Promise<void> {
    await prisma.emailVerification.update({ where: { userId }, data: { attempts: { increment: 1 } } })
  }

  async deleteByUserId(userId: string): Promise<void> {
    await prisma.emailVerification.deleteMany({ where: { userId } })
  }
}
