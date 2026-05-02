import { SwipeRepository } from './swipe.repository'
import { AppError } from '../../shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'
import type { RankingItem } from '../job/job.routes'
import type { IRecommendationService } from '../../shared/interfaces/recommendation.interface'

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
  constructor(
    private readonly repo: SwipeRepository,
    private readonly recommendation: IRecommendationService,
  ) {}

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

    // CAND-03 / REC-01: attach fitScore per job (informational — feed is NOT sorted by fitScore)
    const scoredData = await Promise.all(
      data.map(async (job) => ({
        ...job,
        fitScore: await this.recommendation.computeFitScore(
          {
            professionId: candidate.professionId,
            skills: candidate.skills,
            preferredModalities: candidate.preferredModalities,
            salaryExpectation: candidate.salaryExpectation,
            lat: candidate.lat,
            lng: candidate.lng,
            searchRadiusKm: (candidate as any).searchRadiusKm ?? 50,
          },
          {
            professionId: job.professionId,
            requiredSkills: job.requiredSkills,
            modality: job.modality,
            salaryMin: job.salaryMin ?? null,
            salaryMax: job.salaryMax ?? null,
            lat: job.lat ?? null,
            lng: job.lng ?? null,
          },
        ),
      })),
    )
    return { data: scoredData, nextCursor }
  }

  async getRanking(userId: string, jobId: string): Promise<Array<RankingItem & { rank: number; distanceKm: number | null }>> {
    const recruiterProfile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!recruiterProfile) throw new AppError('Forbidden', 403, 'FORBIDDEN')

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
    if (job.recruiterId !== recruiterProfile.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')

    const swipes = await this.repo.findSwipesByJobId(jobId)

    const items = await Promise.all(
      swipes.map(async (swipe: any) => {
        const fitScore = await this.recommendation.computeFitScore(
          {
            professionId: swipe.candidate.professionId,
            skills: swipe.candidate.skills,
            preferredModalities: swipe.candidate.preferredModalities,
            salaryExpectation: swipe.candidate.salaryExpectation,
            lat: swipe.candidate.lat,
            lng: swipe.candidate.lng,
            searchRadiusKm: swipe.candidate.searchRadiusKm ?? 50,
          },
          {
            professionId: job.professionId,
            requiredSkills: job.requiredSkills,
            modality: job.modality,
            salaryMin: job.salaryMin ?? null,
            salaryMax: job.salaryMax ?? null,
            lat: job.lat ?? null,
            lng: job.lng ?? null,
          },
        )
        return {
          candidateId: swipe.candidateId,
          fitScore,
          distanceKm: haversineKm(swipe.candidate.lat, swipe.candidate.lng, job.lat, job.lng),
          profile:
            swipe.direction === 'LIKE'
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
        }
      }),
    )

    // Sort by fitScore DESC (REC-03); secondary tie-break: keep swipedAt DESC order from DB
    return items
      .sort((a, b) => b.fitScore - a.fitScore)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  }
}
