import { PurchaseCreditsUseCase } from '../../src/application/use-cases/credits/purchase-credits.use-case'
import { GetMyTransactionsUseCase } from '../../src/application/use-cases/credits/get-my-transactions.use-case'
import { CREDIT_PACKAGES, findCreditPackage } from '../../src/application/use-cases/credits/credits.constants'

const recruiter = { id: 'rec-1', userId: 'user-1', companyId: 'comp-1', company: { id: 'comp-1', plan: 'FREE', credits: 0 } }

const makeRepo = () => ({
  findRecruiterByUserId: jest.fn().mockResolvedValue(recruiter),
  grantCredits: jest.fn().mockImplementation(async (_id: string, amount: number) => ({ id: 'comp-1', credits: 3 + amount })),
})

describe('CREDIT_PACKAGES', () => {
  it('has unique ids, positive credits and integer prices in cents', () => {
    const ids = CREDIT_PACKAGES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CREDIT_PACKAGES.length).toBeGreaterThan(0)
    for (const p of CREDIT_PACKAGES) {
      expect(Number.isInteger(p.credits) && p.credits > 0).toBe(true)
      expect(Number.isInteger(p.priceCents) && p.priceCents > 0).toBe(true)
    }
  })

  it('bigger packages are cheaper per credit', () => {
    const per = CREDIT_PACKAGES.map((p) => p.priceCents / p.credits)
    expect([...per].sort((a, b) => b - a)).toEqual(per)
  })

  it('findCreditPackage returns undefined for unknown ids', () => {
    expect(findCreditPackage('nope')).toBeUndefined()
    expect(findCreditPackage(CREDIT_PACKAGES[0].id)).toEqual(CREDIT_PACKAGES[0])
  })
})

describe('PurchaseCreditsUseCase (simulated payment)', () => {
  it('credits the company with the package amount and records purchase:<id> as the reason', async () => {
    const repo = makeRepo()
    const pkg = CREDIT_PACKAGES[0]

    const result = await new PurchaseCreditsUseCase(repo as any).execute('user-1', pkg.id)

    expect(repo.grantCredits).toHaveBeenCalledWith('comp-1', pkg.credits, `purchase:${pkg.id}`)
    expect(result).toEqual({ packageId: pkg.id, credits: pkg.credits, priceCents: pkg.priceCents, balance: 3 + pkg.credits })
  })

  it('rejects an unknown package without crediting (404)', async () => {
    const repo = makeRepo()
    await expect(new PurchaseCreditsUseCase(repo as any).execute('user-1', 'nope'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    expect(repo.grantCredits).not.toHaveBeenCalled()
  })

  it('403 when the user is not a recruiter', async () => {
    const repo = makeRepo()
    repo.findRecruiterByUserId.mockResolvedValue(null)
    await expect(new PurchaseCreditsUseCase(repo as any).execute('user-1', CREDIT_PACKAGES[0].id))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
    expect(repo.grantCredits).not.toHaveBeenCalled()
  })
})

describe('GetMyTransactionsUseCase', () => {
  it('returns only the transactions of the recruiter\'s own company', async () => {
    const credits = { findRecruiterByUserId: jest.fn().mockResolvedValue(recruiter) }
    const rows = [{ id: 't1', companyId: 'comp-1', amount: 10, reason: 'purchase:starter', createdAt: new Date() }]
    const companies = { getTransactions: jest.fn().mockResolvedValue(rows) }

    const result = await new GetMyTransactionsUseCase(credits as any, companies as any).execute('user-1')

    expect(companies.getTransactions).toHaveBeenCalledWith('comp-1')
    expect(result).toEqual(rows)
  })

  it('403 when the user is not a recruiter', async () => {
    const credits = { findRecruiterByUserId: jest.fn().mockResolvedValue(null) }
    const companies = { getTransactions: jest.fn() }
    await expect(new GetMyTransactionsUseCase(credits as any, companies as any).execute('user-1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
    expect(companies.getTransactions).not.toHaveBeenCalled()
  })
})
