import { ICreditRepository } from '../../../domain/interfaces/credit.repository.interface'
import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { CreditTransaction } from '../../../domain/entities/credit-transaction.entity'
import { DomainError } from '../../errors/domain.error'

/** Statement of the recruiter's own company (the admin one lives under /admin). */
export class GetMyTransactionsUseCase {
  constructor(
    private readonly credits: Pick<ICreditRepository, 'findRecruiterByUserId'>,
    private readonly companies: Pick<ICompanyRepository, 'getTransactions'>,
  ) {}

  async execute(userId: string): Promise<CreditTransaction[]> {
    const recruiter = await this.credits.findRecruiterByUserId(userId)
    if (!recruiter) throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    return this.companies.getTransactions(recruiter.companyId)
  }
}
