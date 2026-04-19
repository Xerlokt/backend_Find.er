import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { AdminService } from './admin.service'

const AdjustCreditsAdminSchema = z.object({
  amount: z.number().int().positive(),
})

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const service = new AdminService()

  // GET /admin/users — lista paginada de usuários (sem campos sensíveis)
  app.get('/users', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const page = Number((request.query as any).page ?? 1)
    const limit = Number((request.query as any).limit ?? 20)
    const users = await service.listUsers(page, limit)
    return reply.status(200).send(users)
  })

  // GET /admin/users/:id — usuário único (sem campos sensíveis)
  app.get('/users/:id', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = await service.getUserById(id)
    return reply.status(200).send(user)
  })

  // PATCH /admin/companies/:id/credits — incrementa créditos da empresa
  app.patch('/companies/:id/credits', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = AdjustCreditsAdminSchema.parse(request.body)
    const company = await service.adjustCredits(id, body.amount)
    return reply.status(200).send(company)
  })
}
