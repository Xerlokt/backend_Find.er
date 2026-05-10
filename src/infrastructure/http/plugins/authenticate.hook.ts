import { FastifyRequest, FastifyReply } from 'fastify'
import { DomainError } from '../../../application/errors/domain.error'

// Augment FastifyJWT to type the JWT payload (user property on request)
// @fastify/jwt maps FastifyJWT.user → FastifyRequest.user
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string
      role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN'
    }
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    throw new DomainError('Unauthorized', 'UNAUTHORIZED', 401)
  }
}
