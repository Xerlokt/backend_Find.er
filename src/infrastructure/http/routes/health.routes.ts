import { FastifyInstance } from 'fastify'
import { prisma } from '../../database/prisma'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      // Lightweight Prisma ping — executes SELECT 1 via queryRaw
      await prisma.$queryRaw`SELECT 1`
      return reply.status(200).send({ status: 'ok', db: 'connected' })
    } catch {
      return reply.status(503).send({ status: 'error', db: 'disconnected' })
    }
  })
}
