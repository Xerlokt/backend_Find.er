export interface Company {
  id: string
  name: string
  cnpj?: string | null
  legalName?: string | null
  tradeName?: string | null
  city?: string | null
  state?: string | null
  logoUrl: string | null
  description: string | null
  rating: number
  plan: string
  planExpiresAt: Date | null
  credits: number
  createdAt: Date
  photos?: CompanyPhoto[]
}

export interface CompanyPhoto {
  id: string
  url: string
  position: number
}
