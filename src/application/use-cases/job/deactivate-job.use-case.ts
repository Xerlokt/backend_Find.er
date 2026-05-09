import { IJobRepository } from '../../../domain/interfaces/job.repository.interface'
import { Job } from '../../../domain/entities/job.entity'
import { DomainError } from '../../errors/domain.error'

export class DeactivateJobUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(userId: string, jobId: string): Promise<Job> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    const job = await this.repo.findById(jobId)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    if (job.recruiterId !== profile.id) throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    return this.repo.update(jobId, { isActive: false })
  }
}
