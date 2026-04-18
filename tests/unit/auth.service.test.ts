import { AuthService } from '../../src/modules/auth/auth.service'
import { AuthRepository } from '../../src/modules/auth/auth.repository'
import bcrypt from 'bcryptjs'
import { AppError } from '../../src/shared/errors/AppError'
import { OAuth2Client } from 'google-auth-library'

// Mock do AuthRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<AuthRepository> => ({
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  createRefreshToken: jest.fn(),
  findRefreshTokenByHash: jest.fn(),
  revokeRefreshToken: jest.fn(),
  revokeRefreshTokenFamily: jest.fn(),
  findUserById: jest.fn(),
  findOrCreateGoogleUser: jest.fn(),
} as unknown as jest.Mocked<AuthRepository>)

// Mock do app.jwt.sign — retorna token fake mas estruturado
const makeApp = () => ({
  jwt: {
    sign: jest.fn((payload: object) => `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`),
  },
} as any)

describe('AuthService', () => {
  let repo: jest.Mocked<AuthRepository>
  let app: ReturnType<typeof makeApp>
  let service: AuthService

  beforeEach(() => {
    repo = makeRepo()
    app = makeApp()
    service = new AuthService(repo, app)
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('retorna { accessToken, refreshToken } para dados válidos', async () => {
      repo.findUserByEmail.mockResolvedValue(null)
      repo.createUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CANDIDATE' } as any)
      repo.createRefreshToken.mockResolvedValue({ id: 'rt-1' } as any)

      const result = await service.register({ email: 'a@b.com', password: 'password123', role: 'CANDIDATE' })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(typeof result.refreshToken).toBe('string')
      expect(result.refreshToken).toHaveLength(64) // 32 bytes hex
    })

    it('armazena passwordHash com bcrypt 12 rounds (SEC-04)', async () => {
      repo.findUserByEmail.mockResolvedValue(null)
      repo.createUser.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CANDIDATE' } as any)
      repo.createRefreshToken.mockResolvedValue({ id: 'rt-1' } as any)

      await service.register({ email: 'a@b.com', password: 'password123', role: 'CANDIDATE' })

      const [, createUserCall] = [repo.findUserByEmail.mock.calls, repo.createUser.mock.calls]
      const { passwordHash } = createUserCall[0][0]
      expect(passwordHash).toMatch(/^\$2b\$12\$/)
    })

    it('lança AppError 409 se email já existe', async () => {
      repo.findUserByEmail.mockResolvedValue({ id: 'existing' } as any)

      await expect(
        service.register({ email: 'a@b.com', password: 'password123', role: 'CANDIDATE' })
      ).rejects.toThrow(AppError)

      await expect(
        service.register({ email: 'a@b.com', password: 'password123', role: 'CANDIDATE' })
      ).rejects.toMatchObject({ statusCode: 409 })
    })
  })

  describe('login', () => {
    it('retorna { accessToken, refreshToken } para credenciais válidas', async () => {
      const passwordHash = await bcrypt.hash('password123', 12)
      repo.findUserByEmail.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CANDIDATE', passwordHash } as any)
      repo.createRefreshToken.mockResolvedValue({ id: 'rt-1' } as any)

      const result = await service.login({ email: 'a@b.com', password: 'password123' })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('lança INVALID_CREDENTIALS para senha errada', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 12)
      repo.findUserByEmail.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CANDIDATE', passwordHash } as any)

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong-password' })
      ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' })
    })

    it('lança INVALID_CREDENTIALS para email inexistente (timing-safe)', async () => {
      repo.findUserByEmail.mockResolvedValue(null)

      await expect(
        service.login({ email: 'nao-existe@b.com', password: 'any' })
      ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' })
    })

    it('accessToken tem exp ≈ 15min (SEC-06)', async () => {
      const passwordHash = await bcrypt.hash('password123', 12)
      repo.findUserByEmail.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'CANDIDATE', passwordHash } as any)
      repo.createRefreshToken.mockResolvedValue({ id: 'rt-1' } as any)

      await service.login({ email: 'a@b.com', password: 'password123' })

      // app.jwt.sign foi chamado com expiresIn: '15m' (SEC-06)
      expect(app.jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', role: 'CANDIDATE' }),
        expect.objectContaining({ expiresIn: '15m' })
      )
    })
  })

  describe('loginWithGoogle', () => {
    let verifyIdTokenSpy: jest.SpyInstance

    beforeEach(() => {
      verifyIdTokenSpy = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
    })

    afterEach(() => {
      verifyIdTokenSpy.mockRestore()
    })

    it('retorna { accessToken, refreshToken } para idToken válido', async () => {
      verifyIdTokenSpy.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-uid-abc',
          email: 'google@example.com',
          name: 'Google User',
          picture: undefined,
        }),
      })
      repo.findOrCreateGoogleUser = jest.fn().mockResolvedValue({
        user: { id: 'user-2', email: 'google@example.com', role: 'CANDIDATE' },
        isNew: true,
      })
      repo.createRefreshToken.mockResolvedValue({ id: 'rt-2' } as any)

      const result = await service.loginWithGoogle({
        idToken: 'valid-id-token',
        role: 'CANDIDATE',
      })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(repo.findOrCreateGoogleUser).toHaveBeenCalledWith(
        expect.objectContaining({ googleId: 'google-uid-abc', email: 'google@example.com' })
      )
    })

    it('lança INVALID_CREDENTIALS quando verifyIdToken falha', async () => {
      verifyIdTokenSpy.mockRejectedValue(new Error('Token invalid'))

      await expect(
        service.loginWithGoogle({ idToken: 'bad-token', role: 'CANDIDATE' })
      ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' })
    })
  })
})
