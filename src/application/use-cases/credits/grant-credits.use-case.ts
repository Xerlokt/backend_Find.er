import { ICreditRepository } from '../../../domain/interfaces/credit.repository.interface'
import { Company } from '../../../domain/entities/company.entity'
import { DomainError } from '../../errors/domain.error'

export class GrantCreditsUseCase {
  constructor(private readonly repo: ICreditRepository) {}

  async execute(companyId: string, amount: number, reason: string): Promise<Company> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)
    }
    return this.repo.grantCredits(companyId, amount, reason)
  }
}
