import type { ICreditRepository } from '../../domain/interfaces/credit.repository.interface'
import { DomainError } from '../../application/errors/domain.error'

export class CreditService {
  constructor(
    private readonly repo: ICreditRepository,
  ) {}

  // unlockCandidate() removed — controller uses UnlockCandidateUseCase directly (no duplicate)

  async grantCredits(companyId: string, amount: number, reason = 'admin_grant') {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)
    }
    return this.repo.grantCredits(companyId, amount, reason)
  }
}
