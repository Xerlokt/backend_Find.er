import { RegisterUseCase } from '../../src/application/use-cases/auth/register.use-case'
import type { IUserRepository } from '../../src/domain/interfaces/user.repository.interface'
import type { IRefreshTokenRepository } from '../../src/domain/interfaces/refresh-token.repository.interface'
import type { IHashPort } from '../../src/application/ports/hash.port'
import type { ITokenPort } from '../../src/application/ports/token.port'

const makeUserRepo = (): jest.Mocked<IUserRepository> => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateGoogleId: jest.fn(),
  findOrCreateGoogle: jest.fn(),
  findMany: jest.fn(),
  findByIdPublic: jest.fn(),
} as jest.Mocked<IUserRepository>)

const makeRefreshRepo = (): jest.Mocked<IRefreshTokenRepository> => ({
  create: jest.fn(),
  findByHash: jest.fn(),
  revoke: jest.fn(),
  revokeFamily: jest.fn(),
  revokeByHash: jest.fn(),
} as jest.Mocked<IRefreshTokenRepository>)

const makeHash = (): jest.Mocked<IHashPort> => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
} as jest.Mocked<IHashPort>)

const makeToken = (): jest.Mocked<ITokenPort> => ({
  signAccess: jest.fn().mockReturnValue('access-token'),
  generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw-token', hashed: 'hashed-token' }),
  verifyAccess: jest.fn(),
} as jest.Mocked<ITokenPort>)

describe('RegisterUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('throws CONFLICT (409) when email already exists', async () => {
    const userRepo = makeUserRepo()
    userRepo.findByEmail.mockResolvedValue({ id: 'u1' } as any)
    const uc = new RegisterUseCase(userRepo, makeRefreshRepo(), makeHash(), makeToken())
    await expect(uc.execute({ email: 'a@b.com', password: 'pass', role: 'CANDIDATE' })).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    })
  })

  it('returns accessToken and refreshToken on successful registration', async () => {
    const userRepo = makeUserRepo()
    userRepo.findByEmail.mockResolvedValue(null)
    userRepo.create.mockResolvedValue({ id: 'u1', role: 'CANDIDATE' } as any)
    const refreshRepo = makeRefreshRepo()
    refreshRepo.create.mockResolvedValue({} as any)
    const uc = new RegisterUseCase(userRepo, refreshRepo, makeHash(), makeToken())
    const result = await uc.execute({ email: 'a@b.com', password: 'pass', role: 'CANDIDATE' })
    expect(result).toHaveProperty('accessToken')
    expect(result).toHaveProperty('refreshToken')
  })
})
