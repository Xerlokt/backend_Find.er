import { FastifyRequest, FastifyReply } from 'fastify'
import { DomainError } from '../../../application/errors/domain.error'

// Augment FastifyJWT to type the JWT payload (user property on request)
// @fastify/jwt maps FastifyJWT.user → FastifyRequest.user
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string
      email?: string
      role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN'
      emailVerified?: boolean
    }
  }
}

/** Valida o JWT sem exigir email verificado (rotas de verificação). */
export async function authenticateUnverified(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    throw new DomainError('Unauthorized', 'UNAUTHORIZED', 401)
  }
}

/** Valida o JWT e exige email verificado. */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticateUnverified(request, reply)
  if (!request.user.emailVerified) {
    throw new DomainError('Email não verificado', 'EMAIL_NOT_VERIFIED', 403)
  }
}
