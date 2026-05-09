import { AppError } from '../../shared/errors/AppError'
import { ChatInitiator } from '@prisma/client'
import { UNLOCK_COST_BY_PLAN } from './credits.constants'
import type { IChatService } from '../../shared/interfaces/chat.interface'
import type { ICreditRepository } from '../../domain/interfaces/credit.repository.interface'
import { DomainError } from '../../application/errors/domain.error'

export class CreditService {
  constructor(
    private readonly repo: ICreditRepository,
    private readonly chat: IChatService, // NEW — injected at composition root (D-01, ARCH-04)
  ) {}

  async unlockCandidate(userId: string, jobId: string, candidateId: string) {
    const recruiter = await this.repo.findRecruiterByUserId(userId)
    if (!recruiter) throw new AppError('Forbidden', 403, 'FORBIDDEN')

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
    if (job.recruiterId !== recruiter.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')

    const swipe = await this.repo.findSwipe(candidateId, jobId)
    if (!swipe) throw new AppError('Candidate not found on this job', 404, 'NOT_FOUND')
    if (swipe.direction !== 'DISLIKE') throw new AppError('Candidate is already visible', 422, 'CANDIDATE_ALREADY_VISIBLE')

    const existing = await this.repo.findUnlock(recruiter.companyId, candidateId, jobId)
    if (existing) throw new AppError('Already unlocked', 409, 'ALREADY_UNLOCKED')

    const cost = UNLOCK_COST_BY_PLAN[recruiter.company.plan] ?? UNLOCK_COST_BY_PLAN['FREE']

    let unlock: Awaited<ReturnType<typeof this.repo.executeUnlock>>
    try {
      unlock = await this.repo.executeUnlock(recruiter.companyId, candidateId, jobId, cost)
    } catch (err) {
      if (err instanceof DomainError) {
        throw new AppError(err.message, err.statusCode, err.code)
      }
      throw err
    }

    const { chatId } = await this.chat.createOrGetChat(
      candidateId,
      recruiter.companyId,
      jobId,
      ChatInitiator.CREDIT,
    )

    return { ...unlock, chatId } // D-03: chatId included in unlock response
  }

  async grantCredits(companyId: string, amount: number, reason = 'admin_grant') {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError('Amount must be a positive integer', 400, 'INVALID_AMOUNT')
    }
    return this.repo.grantCredits(companyId, amount, reason)
  }
}
