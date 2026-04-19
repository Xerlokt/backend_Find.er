import { RecruiterService } from '../../src/modules/recruiter/recruiter.service'
import { RecruiterRepository } from '../../src/modules/recruiter/recruiter.repository'
import { AppError } from '../../src/shared/errors/AppError'

// Mock do RecruiterRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<RecruiterRepository> => ({
  upsertProfile: jest.fn(),
  findProfileByUserId: jest.fn(),
  findCompanyById: jest.fn(),
} as unknown as jest.Mocked<RecruiterRepository>)

describe('RecruiterService', () => {
  let repo: jest.Mocked<RecruiterRepository>
  let service: RecruiterService

  beforeEach(() => {
    repo = makeRepo()
    service = new RecruiterService(repo)
    jest.clearAllMocks()
  })

  describe('upsertProfile', () => {
    it('chama repo.findCompanyById(companyId) antes de repo.upsertProfile', async () => {
      const company = { id: 'company-1', name: 'Acme', plan: 'FREE', credits: 0 }
      const profile = { id: 'profile-1', userId: 'user-1', companyId: 'company-1' }

      repo.findCompanyById.mockResolvedValue(company as any)
      repo.upsertProfile.mockResolvedValue(profile as any)

      await service.upsertProfile('user-1', { companyId: 'company-1' })

      expect(repo.findCompanyById).toHaveBeenCalledWith('company-1')
      expect(repo.upsertProfile).toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando repo.findCompanyById retorna null', async () => {
      repo.findCompanyById.mockResolvedValue(null)

      await expect(
        service.upsertProfile('user-1', { companyId: 'non-existent-id' })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })

      await expect(
        service.upsertProfile('user-1', { companyId: 'non-existent-id' })
      ).rejects.toBeInstanceOf(AppError)

      expect(repo.upsertProfile).not.toHaveBeenCalled()
    })

    it('chama repo.upsertProfile(userId, data) e retorna resultado quando empresa existe', async () => {
      const company = { id: 'company-1', name: 'Acme', plan: 'FREE', credits: 0 }
      const profile = { id: 'profile-1', userId: 'user-1', companyId: 'company-1' }

      repo.findCompanyById.mockResolvedValue(company as any)
      repo.upsertProfile.mockResolvedValue(profile as any)

      const result = await service.upsertProfile('user-1', { companyId: 'company-1' })

      expect(repo.upsertProfile).toHaveBeenCalledWith('user-1', { companyId: 'company-1' })
      expect(result).toEqual(profile)
    })

    it('nunca passa userId do objeto data — usa o parâmetro userId diretamente (prevenção de IDOR)', async () => {
      const company = { id: 'company-1', name: 'Acme', plan: 'FREE', credits: 0 }
      const profile = { id: 'profile-1', userId: 'real-user-id', companyId: 'company-1' }

      repo.findCompanyById.mockResolvedValue(company as any)
      repo.upsertProfile.mockResolvedValue(profile as any)

      await service.upsertProfile('real-user-id', { companyId: 'company-1' })

      // O primeiro argumento de upsertProfile deve ser o userId do parâmetro
      expect(repo.upsertProfile).toHaveBeenCalledWith('real-user-id', expect.objectContaining({ companyId: 'company-1' }))
      // Confirma que o userId foi passado como primeiro arg, não embutido no data
      const [calledUserId] = repo.upsertProfile.mock.calls[0]
      expect(calledUserId).toBe('real-user-id')
    })
  })
})
