import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { AdminService } from './admin.service'
import { CreditRepository } from '../credits/credits.repository'
import { CreditService } from '../credits/credits.service'
import { prisma } from '../../shared/db/prisma'

const AdjustCreditsAdminSchema = z.object({
  amount: z.number().int().positive(),
})

const ListUsersQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const creditRepo = new CreditRepository()
  const creditService = new CreditService(creditRepo)
  const service = new AdminService(creditService)

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

  // GET /admin/companies/:id/transactions — audit log (CREDIT-03, D-13)
  app.get('/companies/:id/transactions', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const transactions = await prisma.creditTransaction.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
    })
    return reply.status(200).send(transactions)
  })
}
