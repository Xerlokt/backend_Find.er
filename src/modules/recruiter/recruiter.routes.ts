import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { RecruiterRepository } from './recruiter.repository'
import { RecruiterService } from './recruiter.service'

const RecruiterProfileSchema = z.object({
  companyId: z.string().uuid(),
})

export async function recruiterRoutes(app: FastifyInstance): Promise<void> {
  const repo = new RecruiterRepository()
  const service = new RecruiterService(repo)

  // PUT /recruiters/me — cria ou atualiza perfil do recruiter
  app.put('/me', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const body = RecruiterProfileSchema.parse(request.body)
    const profile = await service.upsertProfile(request.user.id, body)
    return reply.status(200).send(profile)
  })

  // GET /recruiters/me — obtém perfil do recruiter autenticado
  app.get('/me', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const profile = await service.getProfile(request.user.id)
    return reply.status(200).send(profile)
  })
}
