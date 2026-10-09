import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import type { IPushTokenRepository } from '../../../domain/interfaces/push-token.repository.interface'
import { RegisterPushTokenUseCase } from '../../../application/use-cases/push/register-push-token.use-case'
import { UnregisterPushTokenUseCase } from '../../../application/use-cases/push/unregister-push-token.use-case'

const BodySchema = z.object({ token: z.string().min(1).max(200) })

export async function pushRoutes(app: FastifyInstance, opts: { repo: IPushTokenRepository }): Promise<void> {
  const register = new RegisterPushTokenUseCase(opts.repo)
  const unregister = new UnregisterPushTokenUseCase(opts.repo)
  const pre = { preHandler: [authenticate, requireRole('CANDIDATE', 'RECRUITER')] }

  // PUT /push-tokens — o app registra o token do aparelho (idempotente)
  app.put('/', pre, async (request, reply) => {
    const { token } = BodySchema.parse(request.body)
    await register.execute(request.user.id, token)
    reply.status(204).send()
  })

  // DELETE /push-tokens — no logout, para o aparelho parar de receber avisos da conta
  app.delete('/', pre, async (request, reply) => {
    const { token } = BodySchema.parse(request.body)
    await unregister.execute(request.user.id, token)
    reply.status(204).send()
  })
}
