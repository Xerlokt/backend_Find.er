import { SwipeRepository } from './swipe.repository'
import { AppError } from '../../shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'
import type { RankingItem } from '../job/job.routes'

function haversineKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export class SwipeService {
  constructor(private readonly repo: SwipeRepository) {}

  async recordSwipe(userId: string, jobId: string, direction: SwipeDirection) {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new AppError('Candidate profile not found', 404, 'NOT_FOUND')

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
    if (!job.isActive || job.expiresAt <= new Date()) {
      throw new AppError('Job not found', 404, 'NOT_FOUND')
    }

    try {
      return await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('Duplicate swipe', 409, 'DUPLICATE_SWIPE')
      }
      throw err
    }
  }

  async getFeed(userId: string, cursor: string | undefined, limit: number) {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new AppError('Candidate profile not found', 404, 'NOT_FOUND')

    const jobs = await this.repo.findFeedJobs(candidate.id, cursor, limit)
    const hasNext = jobs.length > limit
    const data = hasNext ? jobs.slice(0, limit) : jobs
    const nextCursor = hasNext ? data[data.length - 1].id : null
    return { data, nextCursor }
  }

  async getRanking(userId: string, jobId: string): Promise<Array<RankingItem & { rank: number; distanceKm: number | null }>> {
    const recruiterProfile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!recruiterProfile) throw new AppError('Forbidden', 403, 'FORBIDDEN')

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
    if (job.recruiterId !== recruiterProfile.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')

    const swipes = await this.repo.findSwipesByJobId(jobId)

    return swipes.map((swipe: any, index: number) => ({
      candidateId: swipe.candidateId,
      fitScore: 0, // Phase 5 placeholder — Phase 6 replaces with Neo4j fit score (D-13)
      rank: index + 1,
      distanceKm: haversineKm(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng),
      profile: swipe.direction === 'LIKE'
        ? {
            name: swipe.candidate.name,
            avatarUrl: swipe.candidate.user.avatarUrl,
            bio: swipe.candidate.bio,
            skills: swipe.candidate.skills,
            professionId: swipe.candidate.professionId,
            preferredModalities: swipe.candidate.preferredModalities,
            salaryExpectation: swipe.candidate.salaryExpectation,
            // lat/lng intentionally excluded — D-05, D-07 (location privacy)
          }
        : null, // DISLIKE — identity fully censored (D-06)
    }))
  }
}
