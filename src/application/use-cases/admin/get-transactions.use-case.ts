import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { CreditTransaction } from '../../../domain/entities/credit-transaction.entity'
import { DomainError } from '../../errors/domain.error'

export class GetTransactionsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(companyId: string): Promise<CreditTransaction[]> {
    const company = await this.repo.findById(companyId)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    return this.repo.getTransactions(companyId)
  }
}
