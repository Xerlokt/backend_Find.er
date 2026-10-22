import { ICreditRepository } from '../../../domain/interfaces/credit.repository.interface'
import { DomainError } from '../../errors/domain.error'
import { findCreditPackage } from './credits.constants'

/**
 * SIMULATED purchase: there is no payment gateway yet, so the "payment" is approved instantly
 * and the credits are granted right away. When a gateway exists, grant from its webhook instead.
 */
export class PurchaseCreditsUseCase {
  constructor(private readonly repo: Pick<ICreditRepository, 'findRecruiterByUserId' | 'grantCredits'>) {}

  async execute(
    userId: string,
    packageId: string,
  ): Promise<{ packageId: string; credits: number; priceCents: number; balance: number }> {
    const recruiter = await this.repo.findRecruiterByUserId(userId)
    if (!recruiter) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const pkg = findCreditPackage(packageId)
    if (!pkg) throw new DomainError('Credit package not found', 'NOT_FOUND', 404)

    const company = await this.repo.grantCredits(recruiter.companyId, pkg.credits, `purchase:${pkg.id}`)
    return { packageId: pkg.id, credits: pkg.credits, priceCents: pkg.priceCents, balance: company.credits }
  }
}
