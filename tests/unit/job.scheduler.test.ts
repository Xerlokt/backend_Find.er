import { runExpiryCheck } from '../../src/infrastructure/scheduler/job-expiry.scheduler'
import type { IJobRepository } from '../../src/domain/interfaces/job.repository.interface'

describe('runExpiryCheck', () => {
  it('calls repo.deactivateExpiredJobs exactly once', async () => {
    const repo = { deactivateExpiredJobs: jest.fn().mockResolvedValue(2) } as unknown as IJobRepository
    await runExpiryCheck(repo)
    expect(repo.deactivateExpiredJobs).toHaveBeenCalledTimes(1)
  })

  it('returns the count of deactivated jobs from repo', async () => {
    const repo = { deactivateExpiredJobs: jest.fn().mockResolvedValue(5) } as unknown as IJobRepository
    const count = await runExpiryCheck(repo)
    expect(count).toBe(5)
  })

  it('returns 0 when no expired jobs exist', async () => {
    const repo = { deactivateExpiredJobs: jest.fn().mockResolvedValue(0) } as unknown as IJobRepository
    const count = await runExpiryCheck(repo)
    expect(count).toBe(0)
    expect(repo.deactivateExpiredJobs).toHaveBeenCalledTimes(1)
  })
})
