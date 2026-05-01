import { SwipeRepository } from './swipe.repository'
import { AppError } from '../../shared/errors/AppError'
import { Prisma, SwipeDirection } from '@prisma/client'

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
}
