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
    it('chama repo.findById e repo.adjustCredits quando saldo é suficiente', async () => {
      const company = { id: 'company-1', name: 'Acme', credits: 0 }
      const updated = { id: 'company-1', name: 'Acme', credits: 50 }
      repo.findById.mockResolvedValue(company as any)
      repo.adjustCredits.mockResolvedValue(updated as any)

      const result = await service.adjustCredits('company-1', 50)

      expect(repo.findById).toHaveBeenCalledWith('company-1')
      expect(repo.adjustCredits).toHaveBeenCalledWith('company-1', 50)
      expect(result).toEqual(updated)
    })

    it('lança AppError 400 INSUFFICIENT_CREDITS quando saldo ficaria negativo', async () => {
      const company = { id: 'company-1', name: 'Acme', credits: 0 }
      repo.findById.mockResolvedValue(company as any)

      await expect(service.adjustCredits('company-1', -999)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_CREDITS',
      })
      expect(repo.adjustCredits).not.toHaveBeenCalled()
    })

    it('lança AppError 404 NOT_FOUND quando empresa não existe', async () => {
      repo.findById.mockResolvedValue(null)

      await expect(service.adjustCredits('non-existent', 50)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
      await expect(service.adjustCredits('non-existent', 50)).rejects.toBeInstanceOf(AppError)
    })
  })
})
