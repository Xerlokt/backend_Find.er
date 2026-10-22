import { GetCompanyUseCase } from '../../src/application/use-cases/company/get-company.use-case'
import type { ICompanyRepository } from '../../src/domain/interfaces/company.repository.interface'

const company = {
  id: 'comp-1',
  name: 'Acme',
  plan: 'PRO',
  credits: 42,
  cnpj: '12345678000199',
}

const makeRepo = () =>
  ({
    findById: jest.fn().mockResolvedValue(company),
    recruiterBelongsToCompany: jest.fn().mockResolvedValue(false),
  }) as unknown as jest.Mocked<ICompanyRepository>

describe('GetCompanyUseCase', () => {
  it('ADMIN sees plan and credits', async () => {
    const result: any = await new GetCompanyUseCase(makeRepo()).execute('comp-1', { userId: 'u1', role: 'ADMIN' })
    expect(result.plan).toBe('PRO')
    expect(result.credits).toBe(42)
  })

  it('recruiter of the company sees plan and credits', async () => {
    const repo = makeRepo()
    repo.recruiterBelongsToCompany.mockResolvedValue(true)
    const result: any = await new GetCompanyUseCase(repo).execute('comp-1', { userId: 'u1', role: 'RECRUITER' })
    expect(repo.recruiterBelongsToCompany).toHaveBeenCalledWith('u1', 'comp-1')
    expect(result.plan).toBe('PRO')
    expect(result.credits).toBe(42)
  })

  it('recruiter of another company does not see plan nor credits', async () => {
    const result: any = await new GetCompanyUseCase(makeRepo()).execute('comp-1', { userId: 'u2', role: 'RECRUITER' })
    expect(result).not.toHaveProperty('plan')
    expect(result).not.toHaveProperty('credits')
    expect(result.name).toBe('Acme')
  })

  it('candidate does not see plan nor credits, and never hits the recruiter lookup', async () => {
    const repo = makeRepo()
    const result: any = await new GetCompanyUseCase(repo).execute('comp-1', { userId: 'u3', role: 'CANDIDATE' })
    expect(result).not.toHaveProperty('plan')
    expect(result).not.toHaveProperty('credits')
    expect(repo.recruiterBelongsToCompany).not.toHaveBeenCalled()
  })

  it('404 when the company does not exist', async () => {
    const repo = makeRepo()
    repo.findById.mockResolvedValue(null)
    await expect(new GetCompanyUseCase(repo).execute('x', { userId: 'u1', role: 'ADMIN' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
