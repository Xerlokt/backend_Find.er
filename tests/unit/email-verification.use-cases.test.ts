import { SendEmailVerificationUseCase } from '../../src/application/use-cases/auth/send-email-verification.use-case'
import { VerifyEmailUseCase } from '../../src/application/use-cases/auth/verify-email.use-case'
import { hashCode } from '../../src/application/use-cases/auth/email-code'
import type { IUserRepository } from '../../src/domain/interfaces/user.repository.interface'
import type {
  EmailVerification,
  IEmailVerificationRepository,
} from '../../src/domain/interfaces/email-verification.repository.interface'
import type { IRefreshTokenRepository } from '../../src/domain/interfaces/refresh-token.repository.interface'
import type { ITokenPort } from '../../src/application/ports/token.port'
import type { IMailerPort } from '../../src/application/ports/mailer.port'

process.env.JWT_SECRET = 'test-secret'

const USER = { id: 'u1', email: 'a@b.com', role: 'CANDIDATE', emailVerifiedAt: null } as any

const makeUserRepo = (user: any = USER) =>
  ({
    findById: jest.fn().mockResolvedValue(user),
    markEmailVerified: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<IUserRepository>

const makeVerifRepo = (current: EmailVerification | null = null) =>
  ({
    upsert: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn().mockResolvedValue(current),
    incrementAttempts: jest.fn().mockResolvedValue(undefined),
    deleteByUserId: jest.fn().mockResolvedValue(undefined),
  }) as jest.Mocked<IEmailVerificationRepository>

const makeMailer = () => ({ sendVerificationCode: jest.fn().mockResolvedValue(undefined) }) as jest.Mocked<IMailerPort>

const record = (over: Partial<EmailVerification> = {}): EmailVerification => ({
  userId: 'u1',
  codeHash: hashCode('u1', '123456'),
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  attempts: 0,
  lastSentAt: new Date(Date.now() - 120 * 1000),
  ...over,
})

describe('SendEmailVerificationUseCase', () => {
  it('gera código de 6 dígitos, salva só o hash e envia por email', async () => {
    const repo = makeVerifRepo()
    const mailer = makeMailer()
    await new SendEmailVerificationUseCase(makeUserRepo(), repo, mailer).execute('u1')

    const [to, code, minutes] = mailer.sendVerificationCode.mock.calls[0]
    expect(to).toBe('a@b.com')
    expect(code).toMatch(/^\d{6}$/)
    expect(minutes).toBe(10)
    const saved = repo.upsert.mock.calls[0][0]
    expect(saved.codeHash).toBe(hashCode('u1', code))
    expect(saved.codeHash).not.toContain(code)
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000)
  })

  it('429 RESEND_TOO_SOON se o último envio foi há menos de 60s', async () => {
    const repo = makeVerifRepo(record({ lastSentAt: new Date() }))
    const mailer = makeMailer()
    await expect(new SendEmailVerificationUseCase(makeUserRepo(), repo, mailer).execute('u1')).rejects.toMatchObject({
      code: 'RESEND_TOO_SOON',
      statusCode: 429,
    })
    expect(mailer.sendVerificationCode).not.toHaveBeenCalled()
  })

  it('não faz nada se o email já foi verificado', async () => {
    const mailer = makeMailer()
    const users = makeUserRepo({ ...USER, emailVerifiedAt: new Date() })
    await new SendEmailVerificationUseCase(users, makeVerifRepo(), mailer).execute('u1')
    expect(mailer.sendVerificationCode).not.toHaveBeenCalled()
  })

  it('502 EMAIL_SEND_FAILED quando o SMTP falha', async () => {
    const mailer = makeMailer()
    mailer.sendVerificationCode.mockRejectedValue(new Error('smtp down'))
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(new SendEmailVerificationUseCase(makeUserRepo(), makeVerifRepo(), mailer).execute('u1')).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      statusCode: 502,
    })
  })
})

describe('VerifyEmailUseCase', () => {
  const makeToken = () =>
    ({
      signAccess: jest.fn().mockReturnValue('access'),
      generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw', hashed: 'hashed' }),
      verifyAccess: jest.fn(),
    }) as jest.Mocked<ITokenPort>
  const makeRefresh = () => ({ create: jest.fn() }) as unknown as jest.Mocked<IRefreshTokenRepository>

  it('código certo: marca verificado, apaga registro e devolve tokens com emailVerified', async () => {
    const users = makeUserRepo()
    const repo = makeVerifRepo(record())
    const token = makeToken()
    const out = await new VerifyEmailUseCase(users, repo, makeRefresh(), token).execute('u1', '123456')

    expect(out).toEqual({ accessToken: 'access', refreshToken: 'raw' })
    expect(users.markEmailVerified).toHaveBeenCalledWith('u1')
    expect(repo.deleteByUserId).toHaveBeenCalledWith('u1')
    expect(token.signAccess).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com', role: 'CANDIDATE', emailVerified: true })
  })

  it('código errado: 400 INVALID_CODE e conta a tentativa', async () => {
    const repo = makeVerifRepo(record())
    const users = makeUserRepo()
    await expect(new VerifyEmailUseCase(users, repo, makeRefresh(), makeToken()).execute('u1', '000000')).rejects.toMatchObject({
      code: 'INVALID_CODE',
      statusCode: 400,
    })
    expect(repo.incrementAttempts).toHaveBeenCalledWith('u1')
    expect(users.markEmailVerified).not.toHaveBeenCalled()
  })

  it('código expirado: 410 CODE_EXPIRED', async () => {
    const repo = makeVerifRepo(record({ expiresAt: new Date(Date.now() - 1000) }))
    await expect(new VerifyEmailUseCase(makeUserRepo(), repo, makeRefresh(), makeToken()).execute('u1', '123456')).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
      statusCode: 410,
    })
  })

  it('sem código pendente: 410 CODE_EXPIRED', async () => {
    await expect(new VerifyEmailUseCase(makeUserRepo(), makeVerifRepo(null), makeRefresh(), makeToken()).execute('u1', '123456')).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
    })
  })

  it('5 tentativas erradas: 429 TOO_MANY_ATTEMPTS mesmo com o código certo', async () => {
    const repo = makeVerifRepo(record({ attempts: 5 }))
    await expect(new VerifyEmailUseCase(makeUserRepo(), repo, makeRefresh(), makeToken()).execute('u1', '123456')).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
      statusCode: 429,
    })
  })

  it('já verificado: só reemite tokens', async () => {
    const users = makeUserRepo({ ...USER, emailVerifiedAt: new Date() })
    const repo = makeVerifRepo(null)
    const out = await new VerifyEmailUseCase(users, repo, makeRefresh(), makeToken()).execute('u1', '000000')
    expect(out.accessToken).toBe('access')
    expect(users.markEmailVerified).not.toHaveBeenCalled()
  })
})
