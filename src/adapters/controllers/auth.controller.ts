import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { RegisterUseCase } from '../../application/use-cases/auth/register.use-case'
import { LoginUseCase } from '../../application/use-cases/auth/login.use-case'
import { RefreshTokenUseCase } from '../../application/use-cases/auth/refresh-token.use-case'
import { LogoutUseCase } from '../../application/use-cases/auth/logout.use-case'
import { LoginWithGoogleUseCase } from '../../application/use-cases/auth/login-with-google.use-case'
import { UserRepository } from '../repositories/user.repository'
import { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import { BcryptAdapter } from '../services/bcrypt.adapter'
import { JwtAdapter } from '../services/jwt.adapter'
import { DomainError } from '../../application/errors/domain.error'
import { IUserRepository } from '../../domain/interfaces/user.repository.interface'
import { IRefreshTokenRepository } from '../../domain/interfaces/refresh-token.repository.interface'
import { IHashPort } from '../../application/ports/hash.port'

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CANDIDATE', 'RECRUITER']),
})

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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

  constructor(
    userRepo?: IUserRepository,
    refreshTokenRepo?: IRefreshTokenRepository,
    hash?: IHashPort,
  ) {
    this.userRepo = userRepo ?? new UserRepository()
    this.refreshTokenRepo = refreshTokenRepo ?? new RefreshTokenRepository()
    this.hash = hash ?? new BcryptAdapter()
  }

  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterBodySchema.parse(request.body)
    const useCase = new RegisterUseCase(
      this.userRepo,
      this.refreshTokenRepo,
      this.hash,
      new JwtAdapter(request.server),
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
