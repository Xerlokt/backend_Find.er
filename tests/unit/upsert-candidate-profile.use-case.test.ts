import { UpsertCandidateProfileUseCase } from '../../src/application/use-cases/candidate/upsert-candidate-profile.use-case'
import type { ICandidateRepository } from '../../src/domain/interfaces/candidate.repository.interface'

const makeRepo = (): jest.Mocked<ICandidateRepository> => ({
  upsertProfile: jest.fn(),
  findByUserId: jest.fn(),
} as jest.Mocked<ICandidateRepository>)

describe('UpsertCandidateProfileUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('delegates to repo.upsertProfile and returns its result', async () => {
    const repo = makeRepo()
    const mockProfile = { id: 'cand-1', userId: 'user-1', name: 'Alice' }
    repo.upsertProfile.mockResolvedValue(mockProfile as any)
    const uc = new UpsertCandidateProfileUseCase(repo)
    const input = {
      name: 'Alice',
      professionId: 'backend-dev',
      skills: ['Node.js'],
      preferredModalities: ['REMOTE' as any],
    }
    const result = await uc.execute('user-1', input as any)
    expect(repo.upsertProfile).toHaveBeenCalledWith('user-1', input)
    expect(result).toEqual(mockProfile)
  })
})
