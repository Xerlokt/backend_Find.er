import { IJobRepository } from '../../../domain/interfaces/job.repository.interface'
import { Job, Modality } from '../../../domain/entities/job.entity'
import { DomainError } from '../../errors/domain.error'

export class CreateJobUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(
    userId: string,
    data: {
      title: string
      description: string
      professionId: string
      salaryMin?: number | null
      salaryMax?: number | null
      lat?: number | null
      lng?: number | null
      modality: Modality
      requiredSkills: string[]
      expiresAt: Date
    },
  ): Promise<Job> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    return this.repo.create(profile.id, { ...data, companyId: profile.companyId })
  }
}
