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
  async register(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RegisterBodySchema.parse(request.body)
    const useCase = new RegisterUseCase(
      new UserRepository(),
      new RefreshTokenRepository(),
      new BcryptAdapter(),
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
      new UserRepository(),
      new RefreshTokenRepository(),
      new BcryptAdapter(),
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
      new UserRepository(),
      new RefreshTokenRepository(),
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
      new RefreshTokenRepository(),
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
      new UserRepository(),
      new RefreshTokenRepository(),
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
