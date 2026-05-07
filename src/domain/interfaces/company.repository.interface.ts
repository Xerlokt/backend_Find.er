import { Company } from '../entities/company.entity'

export interface ICompanyRepository {
  create(data: {
    name: string
    logoUrl?: string
    description?: string
  }): Promise<Company>
  findById(id: string): Promise<Company | null>
  adjustCredits(companyId: string, delta: number, reason?: string): Promise<Company>
}
