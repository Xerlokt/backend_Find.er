import { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../errors/AppError'

type Role = 'CANDIDATE' | 'RECRUITER' | 'ADMIN'

export function requireRole(...roles: Role[]) {
  return async function roleGuard(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
    }
    if (!roles.includes(request.user.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
  }
}
