import { FastifyInstance } from 'fastify'
import { CandidateController } from '../../../adapters/controllers/candidate.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { ICachePort } from '../../../application/ports/cache.port'

type CandidateRouteOpts = { cache: ICachePort }

export async function candidateRoutes(app: FastifyInstance, opts: CandidateRouteOpts): Promise<void> {
  const ctrl = new CandidateController(opts)

  app.put('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.upsertProfile.bind(ctrl))
  app.get('/me', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getProfile.bind(ctrl))
  app.get('/me/metrics', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getMetrics.bind(ctrl))
}
