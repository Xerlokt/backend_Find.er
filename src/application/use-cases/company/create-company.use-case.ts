import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'

export class CreateCompanyUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(data: { name: string; logoUrl?: string; description?: string }): Promise<Company> {
    return this.repo.create(data)
  }
}
