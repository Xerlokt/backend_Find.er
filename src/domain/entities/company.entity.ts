export interface Company {
  id: string
  name: string
  logoUrl: string | null
  description: string | null
  rating: number
  plan: string
  planExpiresAt: Date | null
  credits: number
  createdAt: Date
}
