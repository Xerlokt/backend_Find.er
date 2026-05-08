import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../../domain/entities/candidate.entity'
import { Modality } from '../../../domain/entities/job.entity'

export class UpsertCandidateProfileUseCase {
  constructor(private readonly repo: ICandidateRepository) {}

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
    return this.repo.upsertProfile(userId, data)
  }
}
