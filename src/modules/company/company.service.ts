import { CompanyRepository } from './company.repository'
import { AppError } from '../../shared/errors/AppError'

export class CompanyService {
  constructor(private readonly repo: CompanyRepository) {}

  async createCompany(data: { name: string; logoUrl?: string; description?: string }) {
    return this.repo.create(data)
  }

  async getCompany(id: string) {
    const company = await this.repo.findById(id)
    if (!company) {
      throw new AppError('Company not found', 404, 'NOT_FOUND')
    }
    return company
  }

  async adjustCredits(companyId: string, delta: number, reason: string = 'admin_grant') {
    // Guard and write are atomic inside the repository transaction.
    return this.repo.adjustCredits(companyId, delta, reason)
  }
}
