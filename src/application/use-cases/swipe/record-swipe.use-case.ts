import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IChatPort } from '../../ports/chat.port'
import { ICachePort } from '../../ports/cache.port'
import { IWeightsRepository } from '../../../domain/interfaces/weights.repository.interface'
import { GLOBAL_WEIGHT_DEFAULTS } from './weights.constants'
import { haversineKm } from '../../utils/haversine'
import { Swipe, SwipeDirection } from '../../../domain/entities/swipe.entity'
import { DomainError } from '../../errors/domain.error'

// NOTE: No @prisma/client imports — SwipeDirection is domain union type; 'MATCH' is a ChatInitiator string literal
export class RecordSwipeUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly chat: IChatPort,
    private readonly cache: ICachePort,
    private readonly weights: IWeightsRepository,
  ) {}

  private static computeFactorScores(
    candidate: {
      professionId?: string | null
      skills?: string[] | null
      preferredModalities?: string[] | null
      salaryExpectation?: number | null
      lat?: number | null
      lng?: number | null
      searchRadiusKm?: number | null
    },
    job: {
      professionId?: string | null
      requiredSkills?: string[] | null
      modality?: string | null
      salaryMin?: number | null
      salaryMax?: number | null
      lat?: number | null
      lng?: number | null
    },
  ): { profession: number; skills: number; location: number; modality: number; salary: number } {
    // Factor 1: Profession (exact match — neutral 0.5 if either side missing)
    const profession =
      candidate.professionId == null || job.professionId == null
        ? 0.5
        : candidate.professionId === job.professionId ? 1.0 : 0.0

    // Factor 2: Skills (direct intersection — no Neo4j per Pitfall 2; neutral 1.0 if no requirements or missing data)
    const requiredSkills = job.requiredSkills ?? []
    const candidateSkills = candidate.skills ?? []
    const skills =
      requiredSkills.length === 0
        ? 1.0
        : candidateSkills.filter((s) => requiredSkills.includes(s)).length / requiredSkills.length

    // Factor 3: Location proximity
    let location: number
    if (job.lat == null || job.lng == null) {
      location = 1.0
    } else if (candidate.lat == null || candidate.lng == null) {
      location = 0.5
    } else {
      const radius = (candidate.searchRadiusKm ?? 0) > 0 ? candidate.searchRadiusKm! : 50
      const distKm = haversineKm(candidate.lat, candidate.lng, job.lat, job.lng) ?? 0
      location = Math.max(0, 1 - distKm / radius)
    }

    // Factor 4: Work mode
    const preferredModalities = candidate.preferredModalities ?? []
    const modality = job.modality == null ? 0.5 : preferredModalities.includes(job.modality) ? 1.0 : 0.0

    // Factor 5: Salary compatibility
    let salary: number
    if (candidate.salaryExpectation == null) {
      salary = 1.0
    } else if (job.salaryMin == null && job.salaryMax == null) {
      salary = 1.0
    } else {
      const aboveMin = job.salaryMin == null || candidate.salaryExpectation >= job.salaryMin
      const belowMax = job.salaryMax == null || candidate.salaryExpectation <= job.salaryMax
      salary = aboveMin && belowMax ? 1.0 : 0.0
    }

    return { profession, skills, location, modality, salary }
  }

  async execute(
    userId: string,
    jobId: string,
    direction: SwipeDirection,
  ): Promise<Swipe & { chatId: string | null }> {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (!job.isActive || job.expiresAt <= new Date())
      throw new DomainError('Job not found', 'NOT_FOUND', 404)

    // P2002 duplicate swipe → DomainError is handled inside SwipeRepository.createSwipe
    const swipe = await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })

    // SCALE-01: invalidate candidate's feed cache after swipe
    try { await this.cache.del(`feed:${candidate.id}`) } catch { /* Redis down — ok */ }
    // A swipe changes who is revealed/locked in the recruiter's ranking for this job
    try { await this.cache.del(`ranking:${jobId}`) } catch { /* Redis down — ok */ }

    let chatId: string | null = null
    if (direction === 'LIKE') {
      const result = await this.chat.createOrGetChat(candidate.id, job.companyId, jobId, 'MATCH')
      chatId = result.chatId

      // EMA weight update (LEARN-01, D-01 through D-11)
      // Factor scores: inline pure math — no Neo4j session per LIKE (RESEARCH Pitfall 2)
      const observed = RecordSwipeUseCase.computeFactorScores(candidate, job)
      const existing = await this.weights.findByCandidateId(candidate.id)
      const old = existing
        ? {
            profession: existing.professionWeight,
            skills: existing.skillsWeight,
            location: existing.locationWeight,
            modality: existing.modalityWeight,
            salary: existing.salaryWeight,
          }
        : { ...GLOBAL_WEIGHT_DEFAULTS }

      // α = 0.1 (D-01): new_w = 0.1 * observed_score + 0.9 * old_weight
      const ALPHA = 0.1
      const raw = {
        profession: ALPHA * observed.profession + (1 - ALPHA) * old.profession,
        skills:     ALPHA * observed.skills     + (1 - ALPHA) * old.skills,
        location:   ALPHA * observed.location   + (1 - ALPHA) * old.location,
        modality:   ALPHA * observed.modality   + (1 - ALPHA) * old.modality,
        salary:     ALPHA * observed.salary     + (1 - ALPHA) * old.salary,
      }

      // Renormalize to sum = 1.0 (D-04 — prevent float precision drift)
      const sum = Object.values(raw).reduce((a, b) => a + b, 0)
      const normalized =
        sum > 0
          ? {
              profession: raw.profession / sum,
              skills:     raw.skills     / sum,
              location:   raw.location   / sum,
              modality:   raw.modality   / sum,
              salary:     raw.salary     / sum,
            }
          : { ...GLOBAL_WEIGHT_DEFAULTS }

      await this.weights.upsertWeights(candidate.id, {
        professionWeight: normalized.profession,
        skillsWeight:     normalized.skills,
        locationWeight:   normalized.location,
        modalityWeight:   normalized.modality,
        salaryWeight:     normalized.salary,
        likeCount: (existing?.likeCount ?? 0) + 1,
      })
    }

    return { ...swipe, chatId }
  }
}
