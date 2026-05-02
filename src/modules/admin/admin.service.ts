import { prisma } from '../../shared/db/prisma'
import { AppError } from '../../shared/errors/AppError'

// ICreditService — ARCH-04: AdminService depends on interface, not concrete CreditRepository
export interface ICreditService {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export class AdminService {
  constructor(private readonly creditService: ICreditService) {}

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
    return this.creditService.grantCredits(companyId, amount, 'admin_grant')
  }
}
