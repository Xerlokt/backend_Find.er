import { CandidateService } from '../../src/modules/candidate/candidate.service'
import { CandidateRepository } from '../../src/modules/candidate/candidate.repository'
import { AppError } from '../../src/shared/errors/AppError'

// Mock do CandidateRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<CandidateRepository> => ({
  upsertProfile: jest.fn(),
  findProfileByUserId: jest.fn(),
} as unknown as jest.Mocked<CandidateRepository>)

describe('CandidateService', () => {
  let repo: jest.Mocked<CandidateRepository>
  let service: CandidateService

  beforeEach(() => {
    repo = makeRepo()
    service = new CandidateService(repo)
    jest.clearAllMocks()
  })

  describe('upsertProfile', () => {
    it('delega para repo.upsertProfile(userId, data) e retorna o resultado', async () => {
      const userId = 'user-1'
      const data = { name: 'Test User', professionId: 'backend-dev', skills: ['Node.js'], preferredModalities: ['REMOTE' as const], searchRadiusKm: 50 }
      const expectedProfile = { id: 'profile-1', userId, ...data }
      repo.upsertProfile.mockResolvedValue(expectedProfile as any)

      const result = await service.upsertProfile(userId, data as any)

      expect(repo.upsertProfile).toHaveBeenCalledWith(userId, data)
      expect(result).toEqual(expectedProfile)
    })

    it('passa userId como primeiro argumento (prevenção de IDOR — nunca do body)', async () => {
      const userId = 'trusted-user-id-from-jwt'
      const data = { name: 'Candidate', professionId: 'dev', skills: ['TS'], preferredModalities: ['REMOTE' as const], searchRadiusKm: 50 }
      repo.upsertProfile.mockResolvedValue({ id: 'p-1', userId, ...data } as any)

      await service.upsertProfile(userId, data as any)

      const [firstArg] = repo.upsertProfile.mock.calls[0]
      expect(firstArg).toBe(userId)
    })
  })

  describe('getProfile', () => {
    it('chama repo.findProfileByUserId(userId) e retorna o perfil quando encontrado', async () => {
      const userId = 'user-1'
      const expectedProfile = { id: 'profile-1', userId, name: 'Test User' }
      repo.findProfileByUserId.mockResolvedValue(expectedProfile as any)

      const result = await service.getProfile(userId)

      expect(repo.findProfileByUserId).toHaveBeenCalledWith(userId)
      expect(result).toEqual(expectedProfile)
    })

    it('lança AppError com statusCode 404 e code NOT_FOUND quando repo retorna null', async () => {
      const userId = 'user-no-profile'
      repo.findProfileByUserId.mockResolvedValue(null)

      await expect(service.getProfile(userId)).rejects.toThrow(AppError)
      await expect(service.getProfile(userId)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    })
  })
})
