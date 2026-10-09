import { prisma } from '../../infrastructure/database/prisma'
import type { IPushTokenRepository } from '../../domain/interfaces/push-token.repository.interface'

export class PushTokenRepository implements IPushTokenRepository {
  async upsert(userId: string, token: string): Promise<void> {
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, userId },
      update: { userId },
    })
  }

  async remove(userId: string, token: string): Promise<void> {
    await prisma.pushToken.deleteMany({ where: { token, userId } })
  }

  async findByUserId(userId: string): Promise<string[]> {
    const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
    return rows.map((r) => r.token)
  }

  async removeMany(tokens: string[]): Promise<void> {
    await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } })
  }
}
