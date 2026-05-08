import { prisma } from '../../infrastructure/database/prisma'
import { ICompanyRepository } from '../../domain/interfaces/company.repository.interface'
import { Company } from '../../domain/entities/company.entity'
import { CreditTransaction } from '../../domain/entities/credit-transaction.entity'
import { DomainError } from '../../application/errors/domain.error'

export class CompanyRepository implements ICompanyRepository {
  async create(data: { name: string; logoUrl?: string; description?: string }): Promise<Company> {
    const row = await prisma.company.create({ data })
    return this.toDomain(row)
  }

  async findById(id: string): Promise<Company | null> {
    const row = await prisma.company.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant'): Promise<Company> {
    return prisma.$transaction(async (tx) => {
      // Read inside the transaction so the guard and write are atomic —
      // no concurrent request can change the balance between check and update.
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
      if (company.credits + delta < 0) {
        throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 400)
      }
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { credits: { increment: delta } },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount: delta, reason },
      })
      return this.toDomain(updated)
    })
  }

  async getTransactions(companyId: string): Promise<CreditTransaction[]> {
    return prisma.creditTransaction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
  }

  private toDomain(row: any): Company {
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl,
      description: row.description,
      rating: row.rating,
      plan: row.plan,
      planExpiresAt: row.planExpiresAt,
      credits: row.credits,
      createdAt: row.createdAt,
    }
  }
}
