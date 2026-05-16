import { CreateJobUseCase } from '../../src/application/use-cases/job/create-job.use-case'
import type { IJobRepository } from '../../src/domain/interfaces/job.repository.interface'

const makeRepo = (): jest.Mocked<IJobRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findByRecruiterId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  deactivateExpiredJobs: jest.fn(),
} as jest.Mocked<IJobRepository>)

const baseJobInput = {
  title: 'Backend Dev',
  description: 'We need a backend dev',
  professionId: 'backend-dev',
  modality: 'REMOTE' as any,
  requiredSkills: ['nodejs'],
  expiresAt: new Date(Date.now() + 86400000),
}

describe('CreateJobUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws NOT_FOUND (404) when recruiter profile does not exist', async () => {
    const repo = makeRepo()
    repo.findRecruiterProfileByUserId.mockResolvedValue(null)
    const uc = new CreateJobUseCase(repo)
    await expect(uc.execute('user-1', baseJobInput)).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('calls repo.create with recruiter id and companyId from profile', async () => {
    const repo = makeRepo()
    repo.findRecruiterProfileByUserId.mockResolvedValue({ id: 'rec-1', companyId: 'comp-1' } as any)
    repo.create.mockResolvedValue({ id: 'job-1' } as any)
    const uc = new CreateJobUseCase(repo)
    const result = await uc.execute('user-1', baseJobInput)
    expect(repo.create).toHaveBeenCalledWith('rec-1', expect.objectContaining({ companyId: 'comp-1' }))
    expect(result).toMatchObject({ id: 'job-1' })
  })
})
