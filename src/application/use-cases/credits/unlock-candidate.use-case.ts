import { ICreditRepository } from '../../../domain/interfaces/credit.repository.interface'
import { IChatPort } from '../../ports/chat.port'
import { DomainError } from '../../errors/domain.error'
import { UNLOCK_COST_BY_PLAN } from './credits.constants'

export class UnlockCandidateUseCase {
  constructor(
    private readonly repo: ICreditRepository,
    private readonly chat: IChatPort,
  ) {}

  async execute(
    userId: string,
    jobId: string,
    candidateId: string,
  ): Promise<{
    id: string
    companyId: string
    candidateId: string
    jobId: string
    unlockedAt: Date
    creditsCost: number
    chatId: string
  }> {
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

    const { chatId } = await this.chat.createOrGetChat(candidateId, recruiter.companyId, jobId, 'CREDIT')
    return { ...unlock, chatId }
  }
}
