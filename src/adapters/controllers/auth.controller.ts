import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { RegisterUseCase } from '../../application/use-cases/auth/register.use-case'
import { LoginUseCase } from '../../application/use-cases/auth/login.use-case'
import { RefreshTokenUseCase } from '../../application/use-cases/auth/refresh-token.use-case'
import { LogoutUseCase } from '../../application/use-cases/auth/logout.use-case'
import { LoginWithGoogleUseCase } from '../../application/use-cases/auth/login-with-google.use-case'
import { RegisterCompanyUseCase } from '../../application/use-cases/auth/register-company.use-case'
import { CompanyRepository } from '../repositories/company.repository'
import { BrasilApiCnpjAdapter } from '../services/brasilapi-cnpj.adapter'
import { ICnpjLookupPort } from '../../application/ports/cnpj-lookup.port'
import { isValidCnpj, normalizeCnpj } from '../../domain/cnpj'
import { UserRepository } from '../repositories/user.repository'
import { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import { BcryptAdapter } from '../services/bcrypt.adapter'
import { JwtAdapter } from '../services/jwt.adapter'
import { DomainError } from '../../application/errors/domain.error'
import { IUserRepository } from '../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../application/ports/hash.port'
import { IMailerPort } from '../../application/ports/mailer.port'
import { IEmailVerificationRepository } from '../../domain/interfaces/email-verification.repository.interface'
import { EmailVerificationRepository } from '../repositories/email-verification.repository'
import { NodemailerAdapter } from '../services/nodemailer.adapter'
import { SendEmailVerificationUseCase } from '../../application/use-cases/auth/send-email-verification.use-case'
import { ChangeUnverifiedEmailUseCase } from '../../application/use-cases/auth/change-unverified-email.use-case'
import { VerifyEmailUseCase } from '../../application/use-cases/auth/verify-email.use-case'

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

const RegisterCompanyBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  cnpj: z.string().min(1),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().optional(),
})

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const VerifyEmailBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
})

const ChangeEmailBodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
})

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

const LogoutBodySchema = z.object({
  refreshToken: z.string().min(1),
})

const GoogleBodySchema = z.object({
  idToken: z.string().min(1),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

export class AuthController {
  private readonly userRepo: IUserRepository
  private readonly refreshTokenRepo: IRefreshTokenRepository
  private readonly hash: IHashPort

  private readonly cnpjLookup: ICnpjLookupPort
  private readonly verificationRepo: IEmailVerificationRepository
  private readonly sendVerification: SendEmailVerificationUseCase

  constructor(
    userRepo?: IUserRepository,
    refreshTokenRepo?: IRefreshTokenRepository,
    hash?: IHashPort,
    cnpjLookup?: ICnpjLookupPort,
    mailer?: IMailerPort,
    verificationRepo?: IEmailVerificationRepository,
  ) {
    this.cnpjLookup = cnpjLookup ?? new BrasilApiCnpjAdapter()
    this.userRepo = userRepo ?? new UserRepository()
    this.refreshTokenRepo = refreshTokenRepo ?? new RefreshTokenRepository()
    this.hash = hash ?? new BcryptAdapter()
    this.verificationRepo = verificationRepo ?? new EmailVerificationRepository()
    this.sendVerification = new SendEmailVerificationUseCase(
      this.userRepo,
      this.verificationRepo,
      mailer ?? new NodemailerAdapter(),
    )
  }

  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterBodySchema.parse(request.body)
    const useCase = new RegisterUseCase(
      this.userRepo,
      this.refreshTokenRepo,
      this.hash,
      new JwtAdapter(request.server),
      this.sendVerification,
    )
    try {
      const tokens = await useCase.execute(body)
      reply.status(201).send(tokens)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  /** Cadastro da conta da empresa (CNPJ validado na Receita). */
  async registerCompany(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterCompanyBodySchema.parse(request.body)
    const useCase = new RegisterCompanyUseCase(
      this.userRepo,
      new CompanyRepository(),
      this.refreshTokenRepo,
      this.hash,
      new JwtAdapter(request.server),
      this.cnpjLookup,
      this.sendVerification,
    )
    try {
      reply.status(201).send(await useCase.execute(body))
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  /** Reenvia o código de verificação para o usuário logado. */
  async sendEmailCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await this.sendVerification.execute(request.user.id)
    reply.status(204).send()
  }

  /** Confere o código e devolve tokens com emailVerified. */
  async verifyEmail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { code } = VerifyEmailBodySchema.parse(request.body)
    const useCase = new VerifyEmailUseCase(
      this.userRepo,
      this.verificationRepo,
      this.refreshTokenRepo,
      new JwtAdapter(request.server),
    )
    reply.status(200).send(await useCase.execute(request.user.id, code))
  }

  /** Troca o email de uma conta não verificada e manda código novo; devolve tokens com o email atualizado. */
  async changeEmail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { email } = ChangeEmailBodySchema.parse(request.body)
    const useCase = new ChangeUnverifiedEmailUseCase(
      this.userRepo,
      this.verificationRepo,
      this.refreshTokenRepo,
      new JwtAdapter(request.server),
      this.sendVerification,
    )
    reply.status(200).send(await useCase.execute(request.user.id, email))
  }

  /** Pré-visualização pública do CNPJ (pré-preenche o cadastro). */
  async previewCnpj(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { cnpj: raw } = z.object({ cnpj: z.string().min(1) }).parse(request.params)
    const cnpj = normalizeCnpj(raw)
    if (!isValidCnpj(cnpj)) {
      reply.status(422).send({ error: 'CNPJ inválido', code: 'INVALID_CNPJ' })
      return
    }
    try {
      const info = await this.cnpjLookup.lookup(cnpj)
      if (!info) {
        reply.status(422).send({ error: 'CNPJ não encontrado na Receita Federal', code: 'CNPJ_NOT_FOUND' })
        return
      }
      const taken = await new CompanyRepository().hasVerifiedOwner(cnpj)
      reply.status(200).send({ ...info, active: info.status === 'ATIVA', alreadyRegistered: taken })
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = LoginBodySchema.parse(request.body)
    const useCase = new LoginUseCase(
      this.userRepo,
      this.refreshTokenRepo,
      this.hash,
      new JwtAdapter(request.server),
    )
    try {
      const tokens = await useCase.execute(body)
      reply.status(200).send(tokens)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async refresh(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RefreshBodySchema.parse(request.body)
    const useCase = new RefreshTokenUseCase(
      this.userRepo,
      this.refreshTokenRepo,
      new JwtAdapter(request.server),
    )
    try {
      const tokens = await useCase.execute(body.refreshToken)
      reply.status(200).send(tokens)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = LogoutBodySchema.parse(request.body)
    const useCase = new LogoutUseCase(
      this.refreshTokenRepo,
    )
    try {
      await useCase.execute(body.refreshToken)
      reply.status(204).send()
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async loginWithGoogle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = GoogleBodySchema.parse(request.body)
    const useCase = new LoginWithGoogleUseCase(
      this.userRepo,
      this.refreshTokenRepo,
      new JwtAdapter(request.server),
    )
    try {
      const { isNew, ...tokens } = await useCase.execute(body)
      reply.status(isNew ? 201 : 200).send(tokens)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
