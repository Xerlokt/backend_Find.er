import { prisma } from '../../shared/db/prisma'
import { SwipeDirection } from '@prisma/client'

export class SwipeRepository {
  async createSwipe(data: { candidateId: string; jobId: string; direction: SwipeDirection }) {
    return prisma.$transaction(async (tx) => {
      return tx.swipe.create({ data })
    })
  }

  async findJobById(id: string) {
    return prisma.job.findUnique({ where: { id } })
  }

  async findCandidateProfileByUserId(userId: string) {
    // Direct Prisma call — NEVER import CandidateRepository (module isolation, ARCH-04)
    return prisma.candidateProfile.findUnique({ where: { userId } })
  }

  async findRecruiterProfileByUserId(userId: string) {
    // Direct Prisma call — NEVER import RecruiterRepository (module isolation, ARCH-04)
    return prisma.recruiterProfile.findUnique({ where: { userId } })
  }

  async findFeedJobs(candidateId: string, cursor: string | undefined, limit: number) {
    return prisma.job.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
        NOT: { swipes: { some: { candidateId } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
  }

  async findSwipesByJobId(jobId: string) {
    return prisma.swipe.findMany({
      where: { jobId },
      orderBy: [{ swipedAt: 'desc' }],
      include: {
        candidate: {
          include: { user: { select: { avatarUrl: true } } },
        },
      },
    })
  }

  async findUnlocksByJobAndCompany(jobId: string, companyId: string): Promise<Set<string>> {
    // Direct prisma.unlock query — ARCH-04 compliant: repositories may query any Prisma model directly
    // SwipeService must never import from src/modules/credits/
    const unlocks = await prisma.unlock.findMany({
      where: { jobId, companyId },
      select: { candidateId: true },
    })
    return new Set(unlocks.map((u) => u.candidateId))
  }
}
