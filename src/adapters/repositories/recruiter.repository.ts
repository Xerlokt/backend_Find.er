import { prisma } from '../../infrastructure/database/prisma'
import { IRecruiterRepository } from '../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../domain/entities/recruiter.entity'
import { Company } from '../../domain/entities/company.entity'

export class RecruiterRepository implements IRecruiterRepository {
  async upsertProfile(userId: string, data: { companyId: string }): Promise<RecruiterProfile> {
    const row = await prisma.recruiterProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return this.toDomainProfile(row)
  }

  async findByUserId(userId: string): Promise<RecruiterProfile | null> {
    const row = await prisma.recruiterProfile.findUnique({ where: { userId } })
    return row ? this.toDomainProfile(row) : null
  }

  async findCompanyById(id: string): Promise<Company | null> {
    // Direct Prisma call — NEVER import CompanyRepository (module isolation, ARCH-04)
    const row = await prisma.company.findUnique({ where: { id } })
    return row ? this.toDomainCompany(row) : null
  }

  private toDomainProfile(row: any): RecruiterProfile {
    return {
      id: row.id,
      userId: row.userId,
      companyId: row.companyId,
    }
  }

  private toDomainCompany(row: any): Company {
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
