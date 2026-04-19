import { prisma } from '../../shared/db/prisma'
import { AppError } from '../../shared/errors/AppError'

export class AdminService {
  async listUsers(page: number, limit: number) {
    return prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        // passwordHash: NOT included — never expose (T-03-03-05)
        // googleId: NOT included — sensitive (T-03-03-05)
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        // passwordHash: NOT included — never expose (T-03-03-05)
        // googleId: NOT included — sensitive (T-03-03-05)
      },
    })
    if (!user) throw new AppError('User not found', 404, 'NOT_FOUND')
    return user
  }

  async adjustCredits(companyId: string, amount: number) {
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    return prisma.company.update({
      where: { id: companyId },
      data: { credits: { increment: amount } },
    })
  }
}
