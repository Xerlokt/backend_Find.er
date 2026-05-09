import { IJobRepository } from '../../../domain/interfaces/job.repository.interface'
import { Job } from '../../../domain/entities/job.entity'
import { DomainError } from '../../errors/domain.error'

export class GetJobByIdUseCase {
  constructor(private readonly repo: IJobRepository) {}

  async execute(id: string): Promise<Job> {
    const job = await this.repo.findById(id)
    if (!job) throw new DomainError('Job not found', 'NOT_FOUND', 404)
    return job
  }
}
