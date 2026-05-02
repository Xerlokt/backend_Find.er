import { prisma } from '../../shared/db/prisma'

export class CreditRepository {
  async findRecruiterByUserId(userId: string) {
    return prisma.recruiterProfile.findUnique({
      where: { userId },
      include: { company: { select: { id: true, plan: true, credits: true } } },
    })
  }

  async findJobById(id: string) {
    return prisma.job.findUnique({ where: { id } })
  }

  async findSwipe(candidateId: string, jobId: string) {
    return prisma.swipe.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    })
  }

  async findUnlock(companyId: string, candidateId: string, jobId: string) {
    return prisma.unlock.findUnique({
      where: { companyId_candidateId_jobId: { companyId, candidateId, jobId } },
    })
  }

  async findCandidateProfileById(id: string) {
    return prisma.candidateProfile.findUnique({
      where: { id },
      include: { user: { select: { avatarUrl: true } } },
    })
  }

  async executeUnlock(companyId: string, candidateId: string, jobId: string, creditsCost: number) {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new Error('COMPANY_NOT_FOUND')
      if (company.credits < creditsCost) throw new Error('INSUFFICIENT_CREDITS')

      await tx.company.update({
        where: { id: companyId },
        data: { credits: { decrement: creditsCost } },
      })
      const unlock = await tx.unlock.create({
        data: { companyId, candidateId, jobId, creditsCost },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount: -creditsCost, reason: 'candidate_unlock' },
      })
      return unlock
    })
  }

  async grantCredits(companyId: string, amount: number, reason: string) {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new Error('COMPANY_NOT_FOUND')
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { credits: { increment: amount } },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount, reason },
      })
      return updated
    })
  }
}
