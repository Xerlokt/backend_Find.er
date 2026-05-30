import { CandidateWeights } from '../entities/candidate-weights.entity'

export type WeightSet = {
  profession: number
  skills: number
  location: number
  modality: number
  salary: number
}

export interface IWeightsRepository {
  upsertWeights(
    candidateId: string,
    data: {
      professionWeight: number
      skillsWeight: number
      locationWeight: number
      modalityWeight: number
      salaryWeight: number
      likeCount: number
    }
  ): Promise<CandidateWeights>
  findByCandidateId(candidateId: string): Promise<CandidateWeights | null>
}
