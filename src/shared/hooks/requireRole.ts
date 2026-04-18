import { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../errors/AppError'

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
      throw new AppError('authenticate hook missing before requireRole', 500, 'INTERNAL')
    }
    if (!roles.includes(request.user.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}
