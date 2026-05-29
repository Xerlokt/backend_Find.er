import { DiscResult } from '../entities/disc-result.entity'

export interface IDiscRepository {
  upsert(
    candidateId: string,
    data: {
      scoreD: number
      scoreI: number
      scoreS: number
      scoreC: number
      dominant: string
    }
  ): Promise<DiscResult>
  findByCandidateId(candidateId: string): Promise<DiscResult | null>
}
