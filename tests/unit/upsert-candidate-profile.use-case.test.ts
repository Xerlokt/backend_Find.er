import { UpsertCandidateProfileUseCase } from '../../src/application/use-cases/candidate/upsert-candidate-profile.use-case'
import type { ICandidateRepository } from '../../src/domain/interfaces/candidate.repository.interface'
import type { ICachePort } from '../../src/application/ports/cache.port'

const makeRepo = (): jest.Mocked<ICandidateRepository> => ({
  upsertProfile: jest.fn(),
  findByUserId: jest.fn(),
} as jest.Mocked<ICandidateRepository>)

const makeCache = (): jest.Mocked<ICachePort> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  invalidatePattern: jest.fn().mockResolvedValue(undefined),
})

describe('UpsertCandidateProfileUseCase', () => {
  beforeEach(() => jest.clearAllMocks())

  it('delegates to repo.upsertProfile and returns its result', async () => {
    const repo = makeRepo()
    const mockProfile = { id: 'cand-1', userId: 'user-1', name: 'Alice' }
    repo.upsertProfile.mockResolvedValue(mockProfile as any)
    const uc = new UpsertCandidateProfileUseCase(repo, makeCache())
    const input = {
      name: 'Alice',
      professionId: 'backend-dev',
      skills: ['nodejs'],
      preferredModalities: ['REMOTE' as any],
    }
    const result = await uc.execute('user-1', input as any)
    expect(repo.upsertProfile).toHaveBeenCalledWith('user-1', input)
    expect(result).toEqual(mockProfile)
  })

  it('calls cache.invalidatePattern("ranking:*") after upsertProfile', async () => {
    const repo = makeRepo()
    const cache = makeCache()
    repo.upsertProfile.mockResolvedValue({ id: 'cand-1' } as any)
    const uc = new UpsertCandidateProfileUseCase(repo, cache)
    await uc.execute('user-1', { name: 'Alice', professionId: 'backend-dev', skills: ['nodejs'], preferredModalities: ['REMOTE'] } as any)
    expect(cache.invalidatePattern).toHaveBeenCalledWith('ranking:*')
  })
})
