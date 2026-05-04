import { CompanyService } from '../../src/modules/company/company.service'
import { CompanyRepository } from '../../src/modules/company/company.repository'
import { AppError } from '../../src/shared/errors/AppError'

// Mock do CompanyRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<CompanyRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  adjustCredits: jest.fn(),
} as unknown as jest.Mocked<CompanyRepository>)

describe('CompanyService', () => {
  let repo: jest.Mocked<CompanyRepository>
  let service: CompanyService

  beforeEach(() => {
    repo = makeRepo()
    service = new CompanyService(repo)
    jest.clearAllMocks()
  })

  describe('createCompany', () => {
    it('delega para repo.create(data) e retorna resultado', async () => {
      const data = { name: 'Acme' }
      const created = { id: 'company-1', name: 'Acme', credits: 0 }
      repo.create.mockResolvedValue(created as any)

      const result = await service.createCompany(data)

      expect(repo.create).toHaveBeenCalledWith(data)
      expect(result).toEqual(created)
    })
  })

  describe('getCompany', () => {
    it('retorna empresa quando encontrada', async () => {
      const company = { id: 'company-1', name: 'Acme', credits: 50 }
      repo.findById.mockResolvedValue(company as any)

      const result = await service.getCompany('company-1')

      expect(repo.findById).toHaveBeenCalledWith('company-1')
      expect(result).toEqual(company)
    })

    it('lança AppError 404 NOT_FOUND quando empresa não existe', async () => {
      repo.findById.mockResolvedValue(null)

      await expect(service.getCompany('non-existent')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
      await expect(service.getCompany('non-existent')).rejects.toBeInstanceOf(AppError)
    })
  })

  describe('adjustCredits', () => {
    it('delega para repo.adjustCredits com companyId, delta e reason padrão', async () => {
      const updated = { id: 'company-1', name: 'Acme', credits: 50 }
      repo.adjustCredits.mockResolvedValue(updated as any)

      const result = await service.adjustCredits('company-1', 50)

      expect(repo.findById).not.toHaveBeenCalled()
      expect(repo.adjustCredits).toHaveBeenCalledWith('company-1', 50, 'admin_grant')
      expect(result).toEqual(updated)
    })

    it('delega para repo.adjustCredits com reason personalizado', async () => {
      const updated = { id: 'company-1', name: 'Acme', credits: 40 }
      repo.adjustCredits.mockResolvedValue(updated as any)

      const result = await service.adjustCredits('company-1', -10, 'unlock')

      expect(repo.adjustCredits).toHaveBeenCalledWith('company-1', -10, 'unlock')
      expect(result).toEqual(updated)
    })

    it('propaga AppError 400 INSUFFICIENT_CREDITS lançado pelo repositório', async () => {
      repo.adjustCredits.mockRejectedValue(
        new AppError('Insufficient credits', 400, 'INSUFFICIENT_CREDITS'),
      )

      await expect(service.adjustCredits('company-1', -999)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_CREDITS',
      })
    })

    it('propaga AppError 404 NOT_FOUND lançado pelo repositório', async () => {
      repo.adjustCredits.mockRejectedValue(
        new AppError('Company not found', 404, 'NOT_FOUND'),
      )

      await expect(service.adjustCredits('non-existent', 50)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
      await expect(service.adjustCredits('non-existent', 50)).rejects.toBeInstanceOf(AppError)
    })
  })
})
