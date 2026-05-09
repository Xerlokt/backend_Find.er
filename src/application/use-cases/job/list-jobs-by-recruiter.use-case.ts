import { IJobRepository } from '../../../domain/interfaces/job.repository.interface'
import { Job } from '../../../domain/entities/job.entity'
import { DomainError } from '../../errors/domain.error'

export class ListJobsByRecruiterUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(userId: string): Promise<Job[]> {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new DomainError('Recruiter profile not found', 'NOT_FOUND', 404)
    return this.repo.findByRecruiterId(profile.id)
  }
}
