import { IDiscRepository } from '../../../domain/interfaces/disc.repository.interface'
import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { DiscDimension } from '../../../domain/entities/disc-result.entity'
import { DomainError } from '../../errors/domain.error'

export class GetDiscUseCase {
  constructor(
    private readonly discRepo: IDiscRepository,
    private readonly candidateRepo: ICandidateRepository,
  ) {}

  async execute(userId: string, candidateId: string): Promise<{ dominant: DiscDimension }> {
    // Authorization: JWT user must own this candidateId
    const profile = await this.candidateRepo.findByUserId(userId)
    if (!profile || profile.id !== candidateId) {
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    }

    const result = await this.discRepo.findByCandidateId(candidateId)
    if (!result) throw new DomainError('DISC result not found', 'NOT_FOUND', 404)

    return { dominant: result.dominant as DiscDimension }
  }
}
