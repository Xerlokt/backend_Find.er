import { prisma } from '../../shared/db/prisma'
import { AppError } from '../../shared/errors/AppError'

export class CompanyRepository {
  async create(data: { name: string; logoUrl?: string; description?: string }) {
    return prisma.company.create({ data })
  }

  async findById(id: string) {
    return prisma.company.findUnique({ where: { id } })
  }

  async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant') {
    return prisma.$transaction(async (tx) => {
      // Read inside the transaction so the guard and write are atomic —
      // no concurrent request can change the balance between check and update.
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
      if (company.credits + delta < 0) {
        throw new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS')
      }
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { credits: { increment: delta } },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount: delta, reason },
      })
      return updated
    })
  }
}
