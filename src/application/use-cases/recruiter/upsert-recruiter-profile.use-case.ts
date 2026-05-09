import { IRecruiterRepository } from '../../../domain/interfaces/recruiter.repository.interface'
import { RecruiterProfile } from '../../../domain/entities/recruiter.entity'
import { DomainError } from '../../errors/domain.error'

export class UpsertRecruiterProfileUseCase {
  constructor(private readonly repo: IRecruiterRepository) {}

  async execute(userId: string, data: { companyId: string }): Promise<RecruiterProfile> {
    const company = await this.repo.findCompanyById(data.companyId)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
    try {
      return await this.repo.upsertProfile(userId, data)
    } catch (err: unknown) {
      // Prisma P2003 = foreign key constraint violation (company deleted between check and write)
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'P2003'
      ) {
        throw new DomainError('Company not found', 'NOT_FOUND', 404)
      }
      throw err
    }
  }
}
