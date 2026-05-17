import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../../domain/entities/candidate.entity'
import { Modality } from '../../../domain/entities/job.entity'
import { ICachePort } from '../../ports/cache.port'

export class UpsertCandidateProfileUseCase {
  constructor(
    private readonly repo: ICandidateRepository,
    private readonly cache: ICachePort,
  ) {}

  async execute(
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
    const profile = await this.repo.upsertProfile(userId, data)
    // SCALE-02: blunt invalidation — all ranking keys stale after any candidate profile update
    try { await this.cache.invalidatePattern('ranking:*') } catch { /* Redis down — ok */ }
    return profile
  }
}
