import { ISwipeRepository } from '../../../domain/interfaces/swipe.repository.interface'
import { IChatPort } from '../../ports/chat.port'
import { Swipe, SwipeDirection } from '../../../domain/entities/swipe.entity'
import { DomainError } from '../../errors/domain.error'

// NOTE: No @prisma/client imports — SwipeDirection is domain union type; 'MATCH' is a ChatInitiator string literal
export class RecordSwipeUseCase {
  constructor(
    private readonly repo: ISwipeRepository,
    private readonly chat: IChatPort,
  ) {}

  async execute(
    userId: string,
    jobId: string,
    direction: SwipeDirection,
  ): Promise<Swipe & { chatId: string | null }> {
    const candidate = await this.repo.findCandidateProfileByUserId(userId)
    if (!candidate) throw new DomainError('Candidate profile not found', 'NOT_FOUND', 404)

    const job = await this.repo.findJobById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (!job.isActive || job.expiresAt <= new Date())
      throw new DomainError('Job not found', 'NOT_FOUND', 404)

    // P2002 duplicate swipe → DomainError is handled inside SwipeRepository.createSwipe
    const swipe = await this.repo.createSwipe({ candidateId: candidate.id, jobId, direction })

    let chatId: string | null = null
    if (direction === 'LIKE') {
      const result = await this.chat.createOrGetChat(candidate.id, job.companyId, jobId, 'MATCH')
      chatId = result.chatId
    }

    return { ...swipe, chatId }
  }
}
