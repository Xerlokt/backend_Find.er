import { Prisma } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { ICreditRepository, RecruiterWithCompany, UnlockResult } from '../../domain/interfaces/credit.repository.interface'
import { Swipe, SwipeDirection } from '../../domain/entities/swipe.entity'
import { Unlock } from '../../domain/entities/unlock.entity'
import { Job, Modality } from '../../domain/entities/job.entity'
import { Company } from '../../domain/entities/company.entity'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { DomainError } from '../../application/errors/domain.error'

export class CreditRepository implements ICreditRepository {
  async findRecruiterByUserId(userId: string): Promise<RecruiterWithCompany | null> {
    const row = await prisma.recruiterProfile.findUnique({
      where: { userId },
      include: { company: { select: { id: true, plan: true, credits: true } } },
    })
    if (!row) return null
    return {
      id: row.id,
      userId: row.userId,
      companyId: row.companyId,
      company: {
        id: row.company.id,
        plan: row.company.plan,
        credits: row.company.credits,
      },
    }
  }

  async findJobById(id: string): Promise<Job | null> {
    const row = await prisma.job.findUnique({ where: { id } })
    if (!row) return null
    return this.toJobDomain(row)
  }

  async findSwipe(candidateId: string, jobId: string): Promise<Swipe | null> {
    const row = await prisma.swipe.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    })
    if (!row) return null
    return {
      id: row.id,
      candidateId: row.candidateId,
      jobId: row.jobId,
      direction: row.direction as SwipeDirection,
      swipedAt: row.swipedAt,
    }
  }

  async findUnlock(companyId: string, candidateId: string, jobId: string): Promise<Unlock | null> {
    const row = await prisma.unlock.findUnique({
      where: { companyId_candidateId_jobId: { companyId, candidateId, jobId } },
    })
    if (!row) return null
    return {
      id: row.id,
      companyId: row.companyId,
      candidateId: row.candidateId,
      jobId: row.jobId,
      unlockedAt: row.unlockedAt,
      creditsCost: row.creditsCost,
    }
  }

  async findCandidateProfileById(
    id: string,
  ): Promise<(CandidateProfile & { avatarUrl: string | null }) | null> {
    const row = await prisma.candidateProfile.findUnique({
      where: { id },
      include: { user: { select: { avatarUrl: true } } },
    })
    if (!row) return null
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      bio: row.bio,
      lat: row.lat,
      lng: row.lng,
      professionId: row.professionId,
      skills: row.skills,
      preferredModalities: row.preferredModalities as Modality[],
      searchRadiusKm: row.searchRadiusKm,
      salaryExpectation: row.salaryExpectation,
      avatarUrl: row.user.avatarUrl,
    }
  }

  async executeUnlock(
    companyId: string,
    candidateId: string,
    jobId: string,
    creditsCost: number,
  ): Promise<UnlockResult> {
    return prisma.$transaction(async (tx) => {
      // Read inside the transaction — in-transaction credit check is REQUIRED for TOCTOU protection.
      // Concurrent requests cannot change the balance between check and update.
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
      if (company.credits < creditsCost) {
        throw new DomainError('Insufficient credits', 'INSUFFICIENT_CREDITS', 402)
      }

      await tx.company.update({
        where: { id: companyId },
        data: { credits: { decrement: creditsCost } },
      })

      try {
        const unlock = await tx.unlock.create({
          data: { companyId, candidateId, jobId, creditsCost },
        })
        await tx.creditTransaction.create({
          data: { companyId, amount: -creditsCost, reason: 'candidate_unlock' },
        })
        return {
          id: unlock.id,
          companyId: unlock.companyId,
          candidateId: unlock.candidateId,
          jobId: unlock.jobId,
          unlockedAt: unlock.unlockedAt,
          creditsCost: unlock.creditsCost,
        }
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)
        }
        throw err
      }
    })
  }

  async grantCredits(companyId: string, amount: number, reason: string): Promise<Company> {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId } })
      if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { credits: { increment: amount } },
      })
      await tx.creditTransaction.create({
        data: { companyId, amount, reason },
      })
      return this.toCompanyDomain(updated)
    })
  }

  private toJobDomain(row: any): Job {
    return {
      id: row.id,
      companyId: row.companyId,
      recruiterId: row.recruiterId,
      title: row.title,
      description: row.description,
      professionId: row.professionId,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      lat: row.lat,
      lng: row.lng,
      modality: row.modality as Modality,
      requiredSkills: row.requiredSkills,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
      createdAt: row.createdAt,
    }
  }

  private toCompanyDomain(row: any): Company {
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
