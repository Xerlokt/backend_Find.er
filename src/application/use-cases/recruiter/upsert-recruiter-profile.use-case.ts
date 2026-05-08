import { IRecruiterRepository } from '../../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../../domain/entities/recruiter.entity'
import { DomainError } from '../../errors/domain.error'

export class UpsertRecruiterProfileUseCase {
  constructor(private readonly repo: IRecruiterRepository) {}

  async execute(userId: string, data: { companyId: string }): Promise<RecruiterProfile> {
    const company = await this.repo.findCompanyById(data.companyId)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    return this.repo.upsertProfile(userId, data)
  }
}
