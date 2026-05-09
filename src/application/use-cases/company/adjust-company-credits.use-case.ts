import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'

export class AdjustCompanyCreditsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(companyId: string, delta: number, reason?: string): Promise<Company> {
    // Transaction-safety lives inside CompanyRepository.adjustCredits
    return this.repo.adjustCredits(companyId, delta, reason)
  }
}
