import { FastifyInstance } from 'fastify'
import { CompanyController } from '../../../adapters/controllers/company.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new CompanyController()

  app.post('/', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.create.bind(ctrl))
  app.get('/:id', { preHandler: [authenticate] }, ctrl.getById.bind(ctrl))
  app.patch('/admin/:id/credits', { preHandler: [authenticate, requireRole('ADMIN')] }, ctrl.adjustCredits.bind(ctrl))
}
