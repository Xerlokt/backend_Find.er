import { FastifyInstance } from 'fastify'
import { DiscController } from '../../../adapters/controllers/disc.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'

export async function discRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new DiscController()

  app.post(
    '/:id/disc',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    ctrl.submitDisc.bind(ctrl),
  )

  app.get(
    '/:id/disc',
    { preHandler: [authenticate, requireRole('CANDIDATE')] },
    ctrl.getDisc.bind(ctrl),
  )
}
