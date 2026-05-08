import { IRecruiterRepository } from '../../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../../domain/entities/recruiter.entity'
import { DomainError } from '../../errors/domain.error'

export class GetRecruiterProfileUseCase {
  constructor(private readonly repo: IRecruiterRepository) {}

  async execute(userId: string): Promise<RecruiterProfile> {
    const profile = await this.repo.findByUserId(userId)
    if (!profile) throw new DomainError('Profile not found', 'NOT_FOUND', 404)
    return profile
  }
}
