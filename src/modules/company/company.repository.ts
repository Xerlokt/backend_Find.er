import { prisma } from '../../shared/db/prisma'

export class CompanyRepository {
  async create(data: { name: string; logoUrl?: string; description?: string }) {
    return prisma.company.create({ data })
  }

  async findById(id: string) {
    return prisma.company.findUnique({ where: { id } })
  }

  async adjustCredits(companyId: string, delta: number) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { credits: { increment: delta } },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount: delta, reason: 'admin_grant' },
      })
      return updated
    })
  }
}
