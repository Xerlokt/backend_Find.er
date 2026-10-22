import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IRecommendationRepository, FitScoreInput, FitScoreJobInput } from '../../../domain/interfaces/recommendation.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { haversineKm } from '../../utils/haversine'
import { ICachePort } from '../../ports/cache.port'
import { encodeUnlockToken } from '../../utils/unlock-token'

// Max never-swiped candidates scored per ranking (each costs a Neo4j fit computation)
const POOL_LIMIT = 50

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
  discProfile?: string   // DISC-02 — added in 17-01; present only when candidate has completed assessment (D-06)
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
 * Returns CensoredProfile when candidate is locked (DISLIKE or no swipe yet, and not unlocked).
 * Pure function — no side effects, no DB access.
 * RED stub: throws until 16-02 implements the body.
 */
export function censorProfile(
  swipe: { direction: string | null; candidate: { name: string; avatarUrl: string | null; bio: string | null; skills: string[]; professionId: string; preferredModalities: string[]; salaryExpectation: number | null; discDominant?: string | null } },
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

  // DISLIKE / no swipe + locked: preview only — no identity (REC-01, REC-02, REC-03)
  // matchingSkills = candidate perspective: which of their skills appear in job requirements
  const matchingSkills = swipe.candidate.skills.filter(s => job.requiredSkills.includes(s))
  const fitReasons = buildFitReasons(swipe.candidate, job, matchingSkills)

  const censored: CensoredProfile = {
    name: null,
    avatarUrl: null,
    bio: null,
    matchingSkills,
    fitReasons,
  }

  // D-06: omit discProfile field entirely when candidate has not completed assessment
  // NEVER use: censored.discProfile = swipe.candidate.discDominant ?? null (Pitfall 1)
  if (swipe.candidate.discDominant != null) {
    censored.discProfile = swipe.candidate.discDominant
  }

  return censored
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

    // Step 4: Fetch all swipes for this job, plus never-swiped candidates of the same profession
    // (best-fit pool). Pool entries have direction null → always censored until liked or unlocked.
    const [swipes, pool] = await Promise.all([
      this.repo.findSwipesByJobId(jobId),
      this.repo.findCandidatePoolForJob(jobId, job.professionId, POOL_LIMIT),
    ])
    const entries: { candidateId: string; direction: string | null; candidate: (typeof swipes)[number]['candidate'] }[] = [
      ...swipes.map((s) => ({ candidateId: s.candidateId, direction: s.direction as string | null, candidate: s.candidate })),
      ...pool.map((p) => ({ candidateId: p.candidateId, direction: null, candidate: p.candidate })),
    ]

    // Step 5: Fetch unlocked candidate IDs for this job+company
    const unlockedCandidateIds = await this.repo.findUnlocksByJobAndCompany(
      jobId,
      recruiterProfile.companyId,
    )

    // Step 6: Compute fitScore for each candidate (FitScoreInput with id — Pitfall 3)
    const items = await Promise.all(
      entries.map(async (entry) => {
        const { candidate } = entry
        const fitScore = await this.rec.computeFitScore(
          {
            id: candidate.id,
            professionId: candidate.professionId,
            skillIds: candidate.skills, // CandidateProfile.skills stores Neo4j skill IDs (e.g. 'nodejs') — Phase 14 convention
            preferredModalities: candidate.preferredModalities,
            salaryExpectation: candidate.salaryExpectation ?? null,
            lat: candidate.lat ?? null,
            lng: candidate.lng ?? null,
            searchRadiusKm: candidate.searchRadiusKm ?? 50,
            discDominant: candidate.discDominant ?? null,  // DISC-04
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
            discProfile: job.discProfile ?? null,   // DISC-03
          } satisfies FitScoreJobInput,
        )

        // Step 7: censorProfile() is the single code path for all reveal/conceal decisions
        const isRevealed = entry.direction === 'LIKE' || unlockedCandidateIds.has(entry.candidateId)
        const profile = censorProfile(entry, job, unlockedCandidateIds.has(entry.candidateId))

        // Step 8: Compute distance — returns number | null when any coordinate is null (WR-04)
        const distanceKm: number | null = haversineKm(candidate.lat, candidate.lng, job.lat, job.lng)

        // REC-03 privacy: the real candidateId only leaves the server for revealed candidates.
        // Locked ones get an opaque, job-bound unlockToken to be sent to the unlock endpoint.
        return {
          status: (isRevealed ? 'REVEALED' : 'LOCKED') as 'REVEALED' | 'LOCKED',
          ...(isRevealed
            ? { candidateId: entry.candidateId }
            : { unlockToken: encodeUnlockToken(entry.candidateId, jobId) }),
          fitScore,
          distanceKm,
          profile,
        } as {
          status: 'REVEALED' | 'LOCKED'
          candidateId?: string
          unlockToken?: string
          fitScore: number
          distanceKm: number | null
          profile: RankingProfile
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
