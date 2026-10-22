import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'
import { assertCompanyRecruiter } from './assert-company-recruiter'

export class UpdateCompanyUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(
    userId: string,
    companyId: string,
    data: { description?: string | null; tradeName?: string | null },
  ): Promise<Company> {
    await assertCompanyRecruiter(this.repo, userId, companyId)
    return this.repo.update(companyId, data)
  }
}
