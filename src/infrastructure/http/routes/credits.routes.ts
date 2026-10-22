import { FastifyInstance } from 'fastify'
import { CreditsController } from '../../../adapters/controllers/credits.controller'
import { CreditsStoreController } from '../../../adapters/controllers/credits-store.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { IChatPort } from '../../../application/ports/chat.port'
import { ICachePort } from '../../../application/ports/cache.port'

export async function creditsJobRoutes(app: FastifyInstance, opts: { chat: IChatPort; cache?: ICachePort }): Promise<void> {
  const ctrl = new CreditsController(opts.chat, opts.cache)
  app.post('/:jobId/candidates/:candidateId/unlock', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, ctrl.unlock.bind(ctrl))
}

// Recruiter-side credit store: catalog, simulated purchase and own statement (mounted at /credits)
export async function creditsStoreRoutes(app: FastifyInstance): Promise<void> {
  const ctrl = new CreditsStoreController()
  const pre = { preHandler: [authenticate, requireRole('RECRUITER')] }
  app.get('/packages', pre, ctrl.packages.bind(ctrl))
  app.post('/purchase', pre, ctrl.purchase.bind(ctrl))
  app.get('/transactions', pre, ctrl.transactions.bind(ctrl))
}
