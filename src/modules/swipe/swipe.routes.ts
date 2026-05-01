import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { SwipeRepository } from './swipe.repository'
import { SwipeService } from './swipe.service'
import { SwipeDirection } from '@prisma/client'

const SwipeBodySchema = z.object({
  jobId: z.string().uuid(),
  direction: z.enum(['LIKE', 'DISLIKE']),
})

const FeedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

// Exported function 1: mounts POST / under /swipes prefix
export async function swipeRoutes(app: FastifyInstance): Promise<void> {
  const repo = new SwipeRepository()
  const service = new SwipeService(repo)

  // POST /swipes — CANDIDATE only, rate limited (SEC-05, D-11)
  app.post('/', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, async (request, reply) => {
    const body = SwipeBodySchema.parse(request.body)
    const swipe = await service.recordSwipe(request.user.id, body.jobId, body.direction as SwipeDirection)
    return reply.status(201).send(swipe)
  })
}

const JobIdParamsSchema = z.object({ jobId: z.string().uuid() })

// Exported function 2: mounts GET /feed and GET /:jobId/ranking under /jobs prefix
// GET /feed MUST be registered before any parameterized route (Pitfall 1 — static before parameterized)
export async function swipeJobRoutes(app: FastifyInstance): Promise<void> {
  const repo = new SwipeRepository()
  const service = new SwipeService(repo)

  // GET /jobs/feed — CANDIDATE only
  // MUST be registered before /:jobId/ranking to prevent "feed" matching as jobId param (Pitfall 1)
  app.get('/feed', {
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, async (request, reply) => {
    const query = FeedQuerySchema.parse(request.query)
    const result = await service.getFeed(request.user.id, query.cursor, query.limit)
    return reply.status(200).send(result)
  })

  // GET /jobs/:jobId/ranking — RECRUITER only (D-03, T-05-09)
  // Registered AFTER /feed to respect static-before-parameterized ordering (Pitfall 1)
  app.get('/:jobId/ranking', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const { jobId } = JobIdParamsSchema.parse(request.params)
    const ranking = await service.getRanking(request.user.id, jobId)
    return reply.status(200).send(ranking)
  })
}
