import { FastifyInstance } from 'fastify'
import { RecruiterController } from '../../../adapters/controllers/recruiter.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

export async function recruiterRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new RecruiterController()

  app.put('/me', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.upsertProfile.bind(ctrl))
  app.get('/me', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.getProfile.bind(ctrl))
}
