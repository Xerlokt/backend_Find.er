import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthRepository } from './auth.repository'
import { AuthService } from './auth.service'

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

const GoogleBodySchema = z.object({
  idToken: z.string().min(1),
  role: z.enum(['CANDIDATE', 'RECRUITER']), // ADMIN excluído — D-09
})

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const repo = new AuthRepository()
  const service = new AuthService(repo, app)

  // POST /auth/register — 3 req/min (D-10)
  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = RegisterBodySchema.parse(request.body)
    const tokens = await service.register(body)
    return reply.status(201).send(tokens)
  })

  // POST /auth/login — 5 req/min (D-10)
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = LoginBodySchema.parse(request.body)
    const tokens = await service.login(body)
    return reply.status(200).send(tokens)
  })

  // POST /auth/refresh — 10 req/min (D-10)
  // Recebe refreshToken no body — NÃO usa authenticate preHandler (token opaco, não JWT)
  app.post('/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = RefreshBodySchema.parse(request.body)
    const tokens = await service.refresh(body.refreshToken)
    return reply.status(200).send(tokens)
  })

  // POST /auth/logout — sem rate limit customizado (60 req/min global)
  // Recebe refreshToken no body — NÃO usa authenticate preHandler
  app.post('/logout', async (request, reply) => {
    const body = RefreshBodySchema.parse(request.body)
    await service.logout(body.refreshToken)
    return reply.status(204).send()
  })

  // POST /auth/google — sem rate limit customizado (60/min global) — rota pública (sem authenticate)
  app.post('/google', async (request, reply) => {
    const body = GoogleBodySchema.parse(request.body)
    const tokens = await service.loginWithGoogle(body)
    return reply.status(201).send(tokens)
  })
}
