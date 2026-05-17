import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { haversineKm } from '../../utils/haversine'
import { ICachePort } from '../../ports/cache.port'

export class GetRankingUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly rec: IRecommendationRepository,
    private readonly cache: ICachePort,
  ) {}

  async execute(userId: string, jobId: string) {
    // Step 1: Verify the caller is a recruiter
    const recruiterProfile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!recruiterProfile) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    // Step 2: Find the job
    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)

    // Step 3: Verify the recruiter owns the job (T-12-03-02 — elevation of privilege guard)
    if (job.recruiterId !== recruiterProfile.id)
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    // SCALE-02: cache read before expensive Neo4j traversal
    const cacheKey = `ranking:${jobId}`
    try {
      const cached = await this.cache.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch { /* Redis down or corrupt cache entry — fall through */ }

    // Step 4: Fetch all swipes for this job
    const swipes = await this.repo.findSwipesByJobId(jobId)

    // Step 5: Fetch unlocked candidate IDs for this job+company
    const unlockedCandidateIds = await this.repo.findUnlocksByJobAndCompany(
      jobId,
      recruiterProfile.companyId,
    )

    // Step 6: Compute fitScore for each candidate (FitScoreInput with id — Pitfall 3)
    const items = await Promise.all(
      swipes.map(async (swipe) => {
        const fitScore = await this.rec.computeFitScore(
          {
            id: swipe.candidate.id,
            professionId: swipe.candidate.professionId,
            skillIds: swipe.candidate.skills, // CandidateProfile.skills stores Neo4j skill IDs (e.g. 'nodejs') — Phase 14 convention
            preferredModalities: swipe.candidate.preferredModalities,
            salaryExpectation: swipe.candidate.salaryExpectation ?? null,
            lat: swipe.candidate.lat ?? null,
            lng: swipe.candidate.lng ?? null,
            searchRadiusKm: swipe.candidate.searchRadiusKm ?? 50,
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
        )

        // Step 7: DISLIKE censoring — profile null unless LIKE or unlocked (T-12-03-03)
        const profile =
          swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
            ? {
                name: swipe.candidate.name,
                avatarUrl: swipe.candidate.avatarUrl,
                bio: swipe.candidate.bio,
                skills: swipe.candidate.skills,
                professionId: swipe.candidate.professionId,
                preferredModalities: swipe.candidate.preferredModalities,
                salaryExpectation: swipe.candidate.salaryExpectation,
                // lat/lng intentionally excluded — location privacy
              }
            : null // DISLIKE not unlocked — identity fully censored

        // Step 8: Compute distance — returns number | null when any coordinate is null (WR-04)
        const distanceKm: number | null = haversineKm(
          swipe.candidate.lat,
          swipe.candidate.lng,
          job.lat,
          job.lng,
        )

        return {
          candidateId: swipe.candidateId,
          fitScore,
          distanceKm,
          profile,
        }
      }),
    )

    // Step 9: Sort by fitScore DESC, add rank
    const result = items
      .sort((a, b) => b.fitScore - a.fitScore)
      .map((item, index) => ({ ...item, rank: index + 1 }))

    // SCALE-02: cache write after compute — TTL 30s
    try { await this.cache.set(cacheKey, JSON.stringify(result), 30) } catch { /* Redis down — ok */ }
    return result
  }
}
