import { ChangeUnverifiedEmailUseCase } from '../../src/application/use-cases/auth/change-unverified-email.use-case'
import type { IUserRepository } from '../../src/domain/interfaces/user.repository.interface'
import type { IEmailVerificationRepository } from '../../src/domain/interfaces/email-verification.repository.interface'
import type { IRefreshTokenRepository } from '../../src/domain/interfaces/refresh-token.repository.interface'
import type { ITokenPort } from '../../src/application/ports/token.port'

const USER = { id: 'u1', email: 'errado@x.com', role: 'RECRUITER', emailVerifiedAt: null } as any

function setup(user: any = USER) {
  const users = {
    findById: jest.fn().mockResolvedValue(user),
    findByEmail: jest.fn().mockResolvedValue(null),
    updateEmail: jest.fn().mockResolvedValue(undefined),
    deleteUnverifiedByEmail: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<IUserRepository>
  const verif = { deleteByUserId: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<IEmailVerificationRepository>
  const refresh = { create: jest.fn() } as unknown as jest.Mocked<IRefreshTokenRepository>
  const token = {
    signAccess: jest.fn().mockReturnValue('access'),
    generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw', hashed: 'h' }),
  } as unknown as jest.Mocked<ITokenPort>
  const send = { execute: jest.fn().mockResolvedValue(undefined) }
  return { users, verif, refresh, token, send, uc: new ChangeUnverifiedEmailUseCase(users, verif, refresh, token, send) }
}

describe('ChangeUnverifiedEmailUseCase', () => {
  it('troca o email, apaga o código antigo, manda código novo e devolve tokens com o email novo', async () => {
    const { uc, users, verif, send, token } = setup()
    const out = await uc.execute('u1', 'certo@x.com')
    expect(users.updateEmail).toHaveBeenCalledWith('u1', 'certo@x.com')
    expect(verif.deleteByUserId).toHaveBeenCalledWith('u1')
    expect(send.execute).toHaveBeenCalledWith('u1')
    expect(token.signAccess).toHaveBeenCalledWith(expect.objectContaining({ email: 'certo@x.com', emailVerified: false }))
    expect(out).toEqual({ accessToken: 'access', refreshToken: 'raw' })
  })

  it('409 ALREADY_VERIFIED se a conta já verificou o email', async () => {
    const { uc, users } = setup({ ...USER, emailVerifiedAt: new Date() })
    await expect(uc.execute('u1', 'certo@x.com')).rejects.toMatchObject({ code: 'ALREADY_VERIFIED', statusCode: 409 })
    expect(users.updateEmail).not.toHaveBeenCalled()
  })

  it('409 CONFLICT se o email novo é de uma conta verificada', async () => {
    const { uc, users } = setup()
    users.findByEmail.mockResolvedValue({ id: 'u2', emailVerifiedAt: new Date() } as any)
    users.deleteUnverifiedByEmail.mockResolvedValue(false)
    await expect(uc.execute('u1', 'ocupado@x.com')).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
    expect(users.updateEmail).not.toHaveBeenCalled()
  })

  it('libera o email se ele pertence a outra conta nunca verificada', async () => {
    const { uc, users } = setup()
    users.findByEmail.mockResolvedValue({ id: 'u2', emailVerifiedAt: null } as any)
    await uc.execute('u1', 'preso@x.com')
    expect(users.deleteUnverifiedByEmail).toHaveBeenCalledWith('preso@x.com')
    expect(users.updateEmail).toHaveBeenCalledWith('u1', 'preso@x.com')
  })

  it('mesmo email: só reenvia o código, sem trocar nada', async () => {
    const { uc, users, send } = setup()
    await uc.execute('u1', 'errado@x.com')
    expect(users.updateEmail).not.toHaveBeenCalled()
    expect(send.execute).toHaveBeenCalledWith('u1')
  })
})
