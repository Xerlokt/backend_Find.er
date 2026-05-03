import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { AdminService } from './admin.service'

const AdjustCreditsAdminSchema = z.object({
  amount: z.number().int().positive(),
})

const ListUsersQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

const ParamIdSchema = z.object({ id: z.string().uuid() })

export async function adminRoutes(app: FastifyInstance, opts: { service: AdminService }): Promise<void> {
  const service = opts.service

  // GET /admin/users — lista paginada de usuários (sem campos sensíveis)
  app.get('/users', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { page, limit } = ListUsersQuerySchema.parse(request.query)
    const users = await service.listUsers(page, limit)
    return reply.status(200).send(users)
  })

  // GET /admin/users/:id — usuário único (sem campos sensíveis)
  app.get('/users/:id', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = ParamIdSchema.parse(request.params)
    const user = await service.getUserById(id)
    return reply.status(200).send(user)
  })

  // PATCH /admin/companies/:id/credits — incrementa créditos da empresa
  app.patch('/companies/:id/credits', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = ParamIdSchema.parse(request.params)
    const body = AdjustCreditsAdminSchema.parse(request.body)
    const company = await service.adjustCredits(id, body.amount)
    return reply.status(200).send(company)
  })

  // GET /admin/companies/:id/transactions — audit log (CREDIT-03, D-13)
  app.get('/companies/:id/transactions', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = ParamIdSchema.parse(request.params)
    const transactions = await service.getTransactions(id)
    return reply.status(200).send(transactions)
  })
}
