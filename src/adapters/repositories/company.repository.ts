import { prisma } from '../../infrastructure/database/prisma'
import { ICompanyRepository } from '../../domain/interfaces/company.repository.interface'
import { User } from '../../domain/entities/user.entity'
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

  async findByCnpj(cnpj: string): Promise<Company | null> {
    const row = await prisma.company.findUnique({ where: { cnpj } })
    return row ? this.toDomain(row) : null
  }

  async hasVerifiedOwner(cnpj: string): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { cnpj },
      include: { recruiters: { include: { user: { select: { emailVerifiedAt: true } } } } },
    })
    return !!company?.recruiters.some((r) => r.user.emailVerifiedAt)
  }

  async removeUnverifiedByCnpj(cnpj: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { cnpj },
        include: { recruiters: { include: { user: { select: { id: true, emailVerifiedAt: true } } } } },
      })
      if (!company) return true
      if (company.recruiters.some((r) => r.user.emailVerifiedAt)) return false
      if ((await tx.job.count({ where: { companyId: company.id } })) > 0) return false

      await tx.user.deleteMany({ where: { id: { in: company.recruiters.map((r) => r.user.id) } } })
      await tx.company.delete({ where: { id: company.id } })
      return true
    })
  }

  async createWithRecruiter(data: Parameters<ICompanyRepository['createWithRecruiter']>[0]) {
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: data.email, passwordHash: data.passwordHash, role: 'RECRUITER' },
        })
        const company = await tx.company.create({ data: data.company })
        await tx.recruiterProfile.create({ data: { userId: user.id, companyId: company.id } })
        return {
          user: { ...user, role: user.role as User['role'] },
          company: this.toDomain(company),
        }
      })
    } catch (e: any) {
      // corrida entre dois cadastros com o mesmo email/CNPJ (unique)
      if (e?.code === 'P2002') {
        throw new DomainError('Email ou CNPJ já cadastrado', 'CONFLICT', 409)
      }
      throw e
    }
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
      cnpj: row.cnpj,
      legalName: row.legalName,
      tradeName: row.tradeName,
      city: row.city,
      state: row.state,
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
