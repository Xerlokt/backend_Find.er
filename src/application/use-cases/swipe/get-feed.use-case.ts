import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'

export class GetFeedUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
  ) {}

  async execute(userId: string, cursor: string | undefined, limit: number) {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    const jobs = await this.repo.findFeedJobs(candidate.id, cursor, limit)
    const hasNext = jobs.length > limit
    const data = hasNext ? jobs.slice(0, limit) : jobs
    const nextCursor = hasNext ? data[data.length - 1].id : null

    // FitScoreInput requires id field — construct explicitly (Pitfall 3 — old IRecommendationService did not require id)
    const scoredData = await Promise.all(
      data.map(async (job) => ({
        ...job,
        fitScore: await this.rec.computeFitScore(
          {
            id: candidate.id,
            professionId: candidate.professionId,
            skills: candidate.skills,
            preferredModalities: candidate.preferredModalities,
            salaryExpectation: candidate.salaryExpectation ?? null,
            lat: candidate.lat ?? null,
            lng: candidate.lng ?? null,
            searchRadiusKm: candidate.searchRadiusKm ?? 50,
          } satisfies FitScoreInput,
          {
            id: job.id,
            professionId: job.professionId,
            requiredSkills: job.requiredSkills,
            modality: job.modality,
            salaryMin: job.salaryMin ?? null,
            salaryMax: job.salaryMax ?? null,
            lat: job.lat ?? null,
            lng: job.lng ?? null,
          } satisfies FitScoreJobInput,
        ),
      })),
    )
    return { data: scoredData, nextCursor }
  }
}
