import { CandidateProfile } from '../entities/candidate.entity'
import { Modality } from '../entities/job.entity'

export interface CandidateMetricsData {
  likes: number
  dislikes: number
  chatsViaMatch: number
  chatsViaCredit: number
  companiesUnlockedYou: number
  /** swipes desde `since`, para o gráfico diário */
  recentSwipes: { direction: string; swipedAt: Date }[]
  discDominant: string | null
}

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
  getMetrics(candidateId: string, since: Date): Promise<CandidateMetricsData>
}
