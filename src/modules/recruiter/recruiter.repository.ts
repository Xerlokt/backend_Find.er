import { prisma } from '../../shared/db/prisma'

export class RecruiterRepository {
  async upsertProfile(userId: string, data: { companyId: string }) {
    return prisma.recruiterProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
  }

  async findProfileByUserId(userId: string) {
    return prisma.recruiterProfile.findUnique({ where: { userId } })
  }

  async findCompanyById(id: string) {
    // Direct Prisma call — NEVER import CompanyRepository (module isolation, ARCH-04)
    return prisma.company.findUnique({ where: { id } })
  }
}
