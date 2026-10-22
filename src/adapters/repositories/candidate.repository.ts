import { prisma } from '../../infrastructure/database/prisma'
import { CandidateMetricsData, ICandidateRepository } from '../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { Modality } from '../../domain/entities/job.entity'

export class CandidateRepository implements ICandidateRepository {
  async upsertProfile(
    userId: string,
    data: {
      name: string
      bio?: string | null
      lat?: number | null
      lng?: number | null
      professionId: string
      skills: string[]
      preferredModalities: Modality[]
      salaryExpectation?: number | null
      searchRadiusKm?: number
    },
  ): Promise<CandidateProfile> {
    const row = await prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    const row = await prisma.candidateProfile.findUnique({ where: { userId } })
    return row ? this.toDomain(row) : null
  }

  async getMetrics(candidateId: string, since: Date): Promise<CandidateMetricsData> {
    const [swipes, chats, unlocks, recentSwipes, disc] = await Promise.all([
      prisma.swipe.groupBy({ by: ['direction'], where: { candidateId }, _count: { _all: true } }),
      prisma.chat.groupBy({ by: ['initiatedBy'], where: { candidateId }, _count: { _all: true } }),
      prisma.unlock.findMany({ where: { candidateId }, distinct: ['companyId'], select: { companyId: true } }),
      prisma.swipe.findMany({ where: { candidateId, swipedAt: { gte: since } }, select: { direction: true, swipedAt: true } }),
      prisma.discResult.findUnique({ where: { candidateId }, select: { dominant: true } }),
    ])
    const swipeCount = (d: string) => swipes.find((s) => s.direction === d)?._count._all ?? 0
    const chatCount = (i: string) => chats.find((c) => c.initiatedBy === i)?._count._all ?? 0
    return {
      likes: swipeCount('LIKE'),
      dislikes: swipeCount('DISLIKE'),
      chatsViaMatch: chatCount('MATCH'),
      chatsViaCredit: chatCount('CREDIT'),
      companiesUnlockedYou: unlocks.length,
      recentSwipes,
      discDominant: disc?.dominant ?? null,
    }
  }

  private toDomain(row: any): CandidateProfile {
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
}
