// src/shared/interfaces/recommendation.interface.ts
// ARCH-04: This interface is the boundary between the swipe module and the recommendation module.
// swipe.service.ts depends on IRecommendationService — NOT on RecommendationRepository directly.

export interface CandidateData {
  professionId: string | null
  skills: string[]
  preferredModalities: string[]
  salaryExpectation: number | null
  lat: number | null
  lng: number | null
  searchRadiusKm: number
}

export interface JobData {
  professionId: string | null
  requiredSkills: string[]
  modality: string
  salaryMin: number | null
  salaryMax: number | null
  lat: number | null
  lng: number | null
}

export interface IRecommendationService {
  computeFitScore(candidate: CandidateData, job: JobData): Promise<number>
}
