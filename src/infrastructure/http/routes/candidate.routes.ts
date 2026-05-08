import { FastifyInstance } from 'fastify'
import { CandidateController } from '../../../adapters/controllers/candidate.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../../../shared/hooks/requireRole'

export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new CandidateController()

  app.put('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.upsertProfile.bind(ctrl))
  app.get('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getProfile.bind(ctrl))
}
