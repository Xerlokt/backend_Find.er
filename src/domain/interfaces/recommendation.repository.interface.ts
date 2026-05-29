export interface FitScoreInput {
  id: string
  professionId: string
  skillIds: string[]
  lat: number | null
  lng: number | null
  preferredModalities: string[]
  salaryExpectation: number | null
  searchRadiusKm: number
  discDominant?: string | null  // DISC-04: candidate's dominant DISC profile, if completed
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
  discProfile?: string | null   // DISC-03: job's desired DISC profile, if any
}

export interface IRecommendationRepository {
  computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>
  seedTaxonomy(): Promise<void>
}
