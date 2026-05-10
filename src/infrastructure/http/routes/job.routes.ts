import { FastifyInstance } from 'fastify'
import { JobController } from '../../../adapters/controllers/job.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new JobController()

  app.post('/', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.create.bind(ctrl))
  // CRITICAL: /mine MUST be registered before /:id (Fastify route ordering)
  app.get('/mine', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.listMine.bind(ctrl))
  app.get('/:id', { preHandler: [authenticate] }, ctrl.getById.bind(ctrl))
  app.patch('/:id', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.update.bind(ctrl))
  app.delete('/:id/deactivate', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.deactivate.bind(ctrl))
}
