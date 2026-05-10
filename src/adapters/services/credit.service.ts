import { ChatInitiator } from '../../domain/entities/chat.entity'
import { UNLOCK_COST_BY_PLAN } from '../../application/use-cases/credits/credits.constants'
import type { IChatPort } from '../../application/ports/chat.port'
import type { ICreditRepository } from '../../domain/interfaces/credit.repository.interface'
import { DomainError } from '../../application/errors/domain.error'

export class CreditService {
  constructor(
    private readonly repo: ICreditRepository,
    private readonly chat: IChatPort, // NEW — injected at composition root (D-01, ARCH-04)
  ) {}

  async unlockCandidate(userId: string, jobId: string, candidateId: string) {
    const recruiter = await this.repo.findRecruiterByUserId(userId)
    if (!recruiter) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (job.recruiterId !== recruiter.id) throw new DomainError('Forbidden', 'FORBIDDEN', 403)

    const swipe = await this.repo.findSwipe(candidateId, jobId)
    if (!swipe) throw new DomainError('Candidate not found on this job', 'NOT_FOUND', 404)
    if (swipe.direction !== 'DISLIKE') throw new DomainError('Candidate is already visible', 'CANDIDATE_ALREADY_VISIBLE', 422)

    const existing = await this.repo.findUnlock(recruiter.companyId, candidateId, jobId)
    if (existing) throw new DomainError('Already unlocked', 'ALREADY_UNLOCKED', 409)

    const cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']

    const unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)

    const { chatId } = await this.chat.createOrGetChat(
      candidateId,
      recruiter.companyId,
      jobId,
      'CREDIT' as ChatInitiator,
    )

    return { ...unlock, chatId } // D-03: chatId included in unlock response
  }

  async grantCredits(companyId: string, amount: number, reason = 'admin_grant') {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError('Amount must be a positive integer', 'INVALID_AMOUNT', 400)
    }
    return this.repo.grantCredits(companyId, amount, reason)
  }
}
