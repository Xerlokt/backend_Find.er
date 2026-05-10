import { FastifyInstance } from 'fastify'
import { CreditsController } from '../../../adapters/controllers/credits.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { IChatPort } from '../../../application/ports/chat.port'

export async function creditsJobRoutes(app: FastifyInstance, opts: { chat: IChatPort }): Promise<void> {
  const ctrl = new CreditsController(opts.chat)
  app.post('/:jobId/candidates/:candidateId/unlock', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, ctrl.unlock.bind(ctrl))
}
