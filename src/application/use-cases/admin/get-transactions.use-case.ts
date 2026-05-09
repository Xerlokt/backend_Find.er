import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { CreditTransaction } from '../../../domain/entities/credit-transaction.entity'

export class GetTransactionsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(companyId: string): Promise<CreditTransaction[]> {
    return this.repo.getTransactions(companyId)
  }
}
