import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { IWeightsRepository, WeightSet } from '../../../domain/interfaces/weights.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { ICachePort } from '../../ports/cache.port'

export class GetFeedUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
    private readonly cache: ICachePort,
    private readonly weights: IWeightsRepository,  // LEARN-02: personal weights for feed (implemented in Plan 02)
  ) {}

  async execute(userId: string, cursor: string | undefined, limit: number) {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    // Only cache first page (no cursor) — paginated requests uncached (RESEARCH Pitfall 3)
    const cacheKey = `feed:${candidate.id}`
    if (!cursor) {
      try {
        const cached = await this.cache.get(cacheKey)
        if (cached) return JSON.parse(cached)
      } catch { /* Redis down or corrupt cache entry — fall through to source */ }
    }

    // Fetch personal weights AFTER cache check — skipped on warm cache hit (D-12, LEARN-02)
    // undefined when cold-start (< 5 LIKEs) or no CandidateWeights record exists (D-05, D-06)
    const candidateWeightsRecord = await this.weights.findByCandidateId(candidate.id)
    const personalWeights: WeightSet | undefined =
      candidateWeightsRecord && candidateWeightsRecord.likeCount >= 5
        ? {
            profession: candidateWeightsRecord.professionWeight,
            skills:     candidateWeightsRecord.skillsWeight,
            location:   candidateWeightsRecord.locationWeight,
            modality:   candidateWeightsRecord.modalityWeight,
            salary:     candidateWeightsRecord.salaryWeight,
          }
        : undefined

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
            skillIds: candidate.skills, // CandidateProfile.skills stores Neo4j skill IDs (e.g. 'nodejs') — Phase 14 convention
            preferredModalities: candidate.preferredModalities,
            salaryExpectation: candidate.salaryExpectation ?? null,
            lat: candidate.lat ?? null,
            lng: candidate.lng ?? null,
            searchRadiusKm: candidate.searchRadiusKm ?? 50,
          } satisfies FitScoreInput,
          {
            id: job.id,
            professionId: job.professionId,
            requiredSkillIds: job.requiredSkills,
            modality: job.modality,
            salaryMin: job.salaryMin ?? null,
            salaryMax: job.salaryMax ?? null,
            lat: job.lat ?? null,
            lng: job.lng ?? null,
          } satisfies FitScoreJobInput,
          personalWeights,  // D-13: undefined when cold-start (< 5 LIKEs), WeightSet when personalized
        ),
      })),
    )
    const result = { data: scoredData, nextCursor }

    if (!cursor) {
      try { await this.cache.set(cacheKey, JSON.stringify(result), 60) } catch { /* Redis down — ok */ }
    }
    return result
  }
}
