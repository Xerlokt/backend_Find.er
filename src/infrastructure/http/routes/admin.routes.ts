import { FastifyInstance } from 'fastify'
import { AdminController } from '../../../adapters/controllers/admin.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export async function adminRoutes(
  app: FastifyInstance,
  opts: { creditService: ICreditGrantPort },
): Promise<void> {
  const ctrl = new AdminController(opts.creditService)

  app.get('/users', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.listUsers.bind(ctrl))
  app.get('/users/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.getUserById.bind(ctrl))
  app.patch('/companies/:id/credits', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.adjustCredits.bind(ctrl))
  app.get('/companies/:id/transactions', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.getTransactions.bind(ctrl))
}
