import { JobRepository } from './job.repository'

/**
 * Deactivates all jobs whose expiresAt is in the past.
 * Called by the scheduler plugin every minute.
 * Returns the number of jobs deactivated.
 */
export async function runExpiryCheck(repo: JobRepository): Promise<number> {
  return repo.deactivateExpiredJobs()
}
