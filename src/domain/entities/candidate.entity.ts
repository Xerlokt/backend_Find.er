import { Modality } from './job.entity'

export interface CandidateProfile {
  id: string
  userId: string
  name: string
  bio: string | null
  lat: number | null
  lng: number | null
  professionId: string
  skills: string[]
  preferredModalities: Modality[]
  searchRadiusKm: number
  salaryExpectation: number | null
}
