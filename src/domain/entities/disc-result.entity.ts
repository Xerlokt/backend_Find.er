export type DiscDimension = 'D' | 'I' | 'S' | 'C'

export interface DiscResult {
  id: string
  candidateId: string
  scoreD: number
  scoreI: number
  scoreS: number
  scoreC: number
  dominant: DiscDimension
  createdAt: Date
  updatedAt: Date
}
