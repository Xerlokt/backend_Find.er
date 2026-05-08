import { ICandidateRepository } from '../../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../../domain/entities/candidate.entity'
import { DomainError } from '../../errors/domain.error'

export class GetCandidateProfileUseCase {
  constructor(private readonly repo: ICandidateRepository) {}

  async execute(userId: string): Promise<CandidateProfile> {
    const profile = await this.repo.findByUserId(userId)
    if (!profile) throw new DomainError('Profile not found', 'NOT_FOUND', 404)
    return profile
  }
}
