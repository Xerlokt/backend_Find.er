import { Company } from '../entities/company.entity'
import { CreditTransaction } from '../entities/credit-transaction.entity'

export interface ICompanyRepository {
  create(data: {
    name: string
    logoUrl?: string
    description?: string
  }): Promise<Company>
  findById(id: string): Promise<Company | null>
  adjustCredits(companyId: string, delta: number, reason?: string): Promise<Company>
  getTransactions(companyId: string): Promise<CreditTransaction[]>
}
