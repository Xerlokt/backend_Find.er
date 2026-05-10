import { FastifyRequest, FastifyReply } from 'fastify'
import { DomainError } from '../../../application/errors/domain.error'

type Role = 'CANDIDATE' | 'RECRUITER' | 'ADMIN'

/**
 * MUST be used after the `authenticate` preHandler.
 * Example: preHandler: [authenticate, requireRole('RECRUITER')]
 */
export function requireRole(...roles: Role[]) {
  return async function roleGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      // authenticate hook was not run before requireRole — programming error, not a client error
      throw new DomainError('authenticate hook missing before requireRole', 'INTERNAL', 500)
    }
    if (!roles.includes(request.user.role)) {
      throw new DomainError('Forbidden', 'FORBIDDEN', 403)
    }
  }
}
