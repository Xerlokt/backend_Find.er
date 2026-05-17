import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { haversineKm } from '../../utils/haversine'
import { ICachePort } from '../../ports/cache.port'

// ─── Phase 16: Recruiter Skill Preview — types and pure functions ────────────

export interface FullProfile {
  name: string
  avatarUrl: string | null
  bio: string | null
  skills: string[]
  professionId: string
  preferredModalities: string[]
  salaryExpectation: number | null
}

export interface CensoredProfile {
  // Identity fields — always null for DISLIKE-locked candidates (REC-03)
  name: null
  avatarUrl: null
  bio: null
  // Non-identity preview (REC-01, REC-02)
  matchingSkills: string[]
  fitReasons: string[]
}

export type RankingProfile = FullProfile | CensoredProfile

/**
 * Generates human-readable fit reason strings for a censored candidate card.
 * Pure function — no side effects, no DB access (REC-02).
 * RED stub: throws until 16-02 implements the body.
 */
export function buildFitReasons(
  candidate: { salaryExpectation: number | null; professionId: string },
  job: { requiredSkills: string[]; salaryMin: number | null; salaryMax: number | null; professionId: string },
  matchingSkills: string[],
): string[] {
  const reasons: string[] = []

  // Skill reason — canonical format: "N/M skills match" (ROADMAP Phase 16 success criteria)
  // Guard: omit "0/0 skills match" when job has no required skills — emit informative fallback instead
  if (job.requiredSkills.length > 0) {
    reasons.push(`${matchingSkills.length}/${job.requiredSkills.length} skills match`)
  } else {
    reasons.push('no required skills listed')
  }

  // Salary reason — only emitted when candidate and job both have salary data
  if (candidate.salaryExpectation !== null && (job.salaryMin !== null || job.salaryMax !== null)) {
    const inRange =
      (job.salaryMin === null || candidate.salaryExpectation >= job.salaryMin) &&
      (job.salaryMax === null || candidate.salaryExpectation <= job.salaryMax)
    reasons.push(inRange ? 'salary in range' : 'salary outside range')
  }

  // Profession reason
  reasons.push(candidate.professionId === job.professionId ? 'profession match' : 'different profession')

  return reasons
}

/**
 * Single code path for all reveal/conceal decisions (REC-03, Success Criterion 4).
 * Returns FullProfile when candidate is revealed (LIKE or unlocked DISLIKE).
 * Returns CensoredProfile when candidate is locked (DISLIKE + not unlocked).
 * Pure function — no side effects, no DB access.
 * RED stub: throws until 16-02 implements the body.
 */
export function censorProfile(
  swipe: { direction: string; candidate: { name: string; avatarUrl: string | null; bio: string | null; skills: string[]; professionId: string; preferredModalities: string[]; salaryExpectation: number | null } },
  job: { requiredSkills: string[]; salaryMin: number | null; salaryMax: number | null; professionId: string },
  isUnlocked: boolean,
): FullProfile | CensoredProfile {
  const isRevealed = swipe.direction === 'LIKE' || isUnlocked

  if (isRevealed) {
    return {
      name: swipe.candidate.name,
      avatarUrl: swipe.candidate.avatarUrl,
      bio: swipe.candidate.bio,
      skills: swipe.candidate.skills,
      professionId: swipe.candidate.professionId,
      preferredModalities: swipe.candidate.preferredModalities,
      salaryExpectation: swipe.candidate.salaryExpectation,
      // lat/lng intentionally excluded — location privacy (unchanged from previous implementation)
    }
  }

  // DISLIKE + locked: preview only — no identity (REC-01, REC-02, REC-03)
  // matchingSkills = candidate perspective: which of their skills appear in job requirements
  const matchingSkills = swipe.candidate.skills.filter(s => job.requiredSkills.includes(s))
  const fitReasons = buildFitReasons(swipe.candidate, job, matchingSkills)

  return {
    name: null,
    avatarUrl: null,
    bio: null,
    matchingSkills,
    fitReasons,
  }
}

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
      if (cached) {
        const parsed = JSON.parse(cached)
        // Guard against pre-Phase-16 cache entries where profile was null — discard stale entry and recompute
        if (parsed.every((item: any) => item.profile != null)) {
          return parsed
        }
        // Stale cache — fall through to recompute
      }
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

        // Step 7: censorProfile() is the single code path for all reveal/conceal decisions
        // LIKE or unlocked → FullProfile; DISLIKE + locked → CensoredProfile (Phase 16, REC-01/02/03)
        const profile = censorProfile(swipe, job, unlockedCandidateIds.has(swipe.candidateId))

        // Step 8: Compute distance — returns number | null when any coordinate is null (WR-04)
        const distanceKm: number | null = haversineKm(
          swipe.candidate.lat,
          swipe.candidate.lng,
          job.lat,
          job.lng,
        )

        // REC-03 privacy: omit candidateId for DISLIKE-locked candidates — revealed only for LIKE or unlocked
        const isRevealed = swipe.direction === 'LIKE' || unlockedCandidateIds.has(swipe.candidateId)
        return {
          ...(isRevealed ? { candidateId: swipe.candidateId } : {}),
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
