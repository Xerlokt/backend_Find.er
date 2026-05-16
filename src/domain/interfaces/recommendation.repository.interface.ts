export interface FitScoreInput {
  id: string
  professionId: string
  skillIds: string[]
  lat: number | null
  lng: number | null
  preferredModalities: string[]
  salaryExpectation: number | null
  searchRadiusKm: number
}

export interface FitScoreJobInput {
  id: string
  professionId: string
  requiredSkillIds: string[]
  lat: number | null
  lng: number | null
  modality: string
  salaryMin: number | null
  salaryMax: number | null
}

export interface IRecommendationRepository {
  computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>
  seedTaxonomy(): Promise<void>
}
