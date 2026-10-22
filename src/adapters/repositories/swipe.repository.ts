import { Prisma } from '@prisma/client'
import { prisma } from '../../infrastructure/database/prisma'
import { ISwipeRepository, SwipeWithCandidateInfo, PoolCandidate } from '../../domain/interfaces/swipe.repository.interface'
import { Swipe, SwipeDirection } from '../../domain/entities/swipe.entity'
import { Job, Modality } from '../../domain/entities/job.entity'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { RecruiterProfile } from '../../domain/entities/recruiter.entity'
import { DomainError } from '../../application/errors/domain.error'

export class SwipeRepository implements ISwipeRepository {
  async createSwipe(data: {
    candidateId: string
    jobId: string
    direction: SwipeDirection
  }): Promise<Swipe> {
    return prisma.$transaction(async (tx) => {
      try {
        const row = await tx.swipe.create({ data })
        return this.toSwipeDomain(row)
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new DomainError('Duplicate swipe', 'DUPLICATE_SWIPE', 409)
        }
        throw err
      }
    })
  }

  async findJobById(id: string): Promise<Job | null> {
    // Direct Prisma call — NEVER import JobRepository (ARCH-04 module isolation)
    const row = await prisma.job.findUnique({ where: { id } })
    return row ? this.toJobDomain(row) : null
  }

  async findCandidateProfileByUserId(userId: string): Promise<CandidateProfile | null> {
    // Direct Prisma call — NEVER import CandidateRepository (ARCH-04 module isolation)
    const row = await prisma.candidateProfile.findUnique({ where: { userId } })
    return row ? this.toCandidateDomain(row) : null
  }

  async findRecruiterProfileByUserId(userId: string): Promise<RecruiterProfile | null> {
    // Direct Prisma call — NEVER import RecruiterRepository (ARCH-04 module isolation)
    const row = await prisma.recruiterProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, companyId: true },
    })
    return row ? this.toRecruiterDomain(row) : null
  }

  async findFeedJobs(
    candidateId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Job[]> {
    const rows = await prisma.job.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
        swipes: { none: { candidateId } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    return rows.map((r) => this.toJobDomain(r))
  }

  async recordViews(candidateId: string, jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return
    await prisma.jobView.createMany({
      data: jobIds.map((jobId) => ({ jobId, candidateId })),
      skipDuplicates: true,
    })
  }

  async findSwipesByJobId(jobId: string): Promise<SwipeWithCandidateInfo[]> {
    const rows = await prisma.swipe.findMany({
      where: { jobId },
      include: {
        candidate: {
          include: {
            user: { select: { avatarUrl: true } },
            discResult: { select: { dominant: true } },  // DISC-02/04: include DISC result
          },
        },
      },
    })
    return rows.map((row) => ({
      id: row.id,
      candidateId: row.candidateId,
      jobId: row.jobId,
      direction: row.direction as SwipeDirection,
      swipedAt: row.swipedAt,
      candidate: {
        ...this.toCandidateDomain(row.candidate),
        avatarUrl: row.candidate.user.avatarUrl, // flatten nested user relation (Pitfall 5)
        discDominant: row.candidate.discResult?.dominant ?? null, // DISC-02/04: flatten nested relation (Pitfall 10)
      },
    }))
  }

  async findCandidatePoolForJob(
    jobId: string,
    professionId: string,
    limit: number,
  ): Promise<PoolCandidate[]> {
    const rows = await prisma.candidateProfile.findMany({
      where: { professionId, swipes: { none: { jobId } } },
      include: {
        user: { select: { avatarUrl: true } },
        discResult: { select: { dominant: true } },
      },
      take: limit,
    })
    return rows.map((row) => ({
      candidateId: row.id,
      candidate: {
        ...this.toCandidateDomain(row),
        avatarUrl: row.user.avatarUrl,
        discDominant: row.discResult?.dominant ?? null,
      },
    }))
  }

  async findUnlocksByJobAndCompany(
    jobId: string,
    companyId: string,
  ): Promise<Set<string>> {
    const results = await prisma.unlock.findMany({
      where: { jobId, companyId },
      select: { candidateId: true },
    })
    return new Set(results.map((u) => u.candidateId))
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toSwipeDomain(row: any): Swipe {
    return {
      id: row.id,
      candidateId: row.candidateId,
      jobId: row.jobId,
      direction: row.direction as SwipeDirection,
      swipedAt: row.swipedAt,
    }
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
      discProfile: row.discProfile ?? null,  // DISC-03: optional desired DISC profile
    }
  }

  private toCandidateDomain(row: any): CandidateProfile {
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
    }
  }

  private toRecruiterDomain(row: any): RecruiterProfile {
    return {
      id: row.id,
      userId: row.userId,
      companyId: row.companyId,
    }
  }
}
