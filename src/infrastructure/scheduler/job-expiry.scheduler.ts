import { IJobRepository } from '../../domain/interfaces/job.repository.interface'

export async function runExpiryCheck(repo: IJobRepository): Promise<number> {
  return repo.deactivateExpiredJobs()
}
