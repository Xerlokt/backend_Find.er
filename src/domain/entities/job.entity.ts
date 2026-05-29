export type Modality = 'REMOTE' | 'HYBRID' | 'IN_PERSON'

export interface Job {
  id: string
  companyId: string
  recruiterId: string
  title: string
  description: string
  professionId: string
  salaryMin: number | null
  salaryMax: number | null
  lat: number | null
  lng: number | null
  modality: Modality
  requiredSkills: string[]
  expiresAt: Date
  isActive: boolean
  createdAt: Date
  discProfile?: string | null   // DISC-03: optional desired DISC profile (D/I/S/C)
}
