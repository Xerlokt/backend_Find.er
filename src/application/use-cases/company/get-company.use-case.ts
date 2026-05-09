import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'
import { DomainError } from '../../errors/domain.error'

export class GetCompanyUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(id: string): Promise<Company> {
    const company = await this.repo.findById(id)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    return company
  }
}
