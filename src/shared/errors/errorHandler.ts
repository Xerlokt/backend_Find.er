import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from './AppError'

export function errorHandler(
  error: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  // AppError — domain errors with explicit status
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({ error: error.message })
    return
  }

  // Zod validation errors — SEC-02: input validation failures
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'Validation error',
      details: error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
    return
  }

  // Prisma known errors — map to meaningful HTTP codes
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      reply.status(409).send({ error: 'Resource already exists' })
      return
    }
    if (error.code === 'P2025') {
      reply.status(404).send({ error: 'Resource not found' })
      return
    }
  }

  // Fastify validation errors (schema-level)
  if ('statusCode' in error && typeof (error as FastifyError).statusCode === 'number') {
    const statusCode = (error as FastifyError).statusCode as number
    reply.status(statusCode).send({ error: error.message })
    return
  }

  // Unknown — log internally, never leak stack to client
  console.error('[errorHandler] Unhandled error:', error)
  reply.status(500).send({ error: 'Internal server error' })
}
