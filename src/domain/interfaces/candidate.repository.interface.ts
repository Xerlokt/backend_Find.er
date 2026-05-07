import { CandidateProfile } from '../entities/candidate.entity'
import { Modality } from '../entities/job.entity'

export interface ICandidateRepository {
  upsertProfile(
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
  ): Promise<CandidateProfile>
  findByUserId(userId: string): Promise<CandidateProfile | null>
}
