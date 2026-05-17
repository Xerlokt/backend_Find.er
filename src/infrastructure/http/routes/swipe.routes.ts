import { FastifyInstance } from 'fastify'
import { SwipeController } from '../../../adapters/controllers/swipe.controller'
import { authenticate } from '../plugins/authenticate.hook'
import { requireRole } from '../plugins/require-role.hook'
import { IChatPort } from '../../../application/ports/chat.port'
import { ICachePort } from '../../../application/ports/cache.port'
import { IRecommendationRepository } from '../../../domain/interfaces/recommendation.repository.interface'

type SwipeRouteOpts = { chat: IChatPort; neo4j: IRecommendationRepository; cache: ICachePort }

// RankingItem — response shape for GET /jobs/:jobId/ranking (Decision 04-04)
// Updated in Phase 16: profile is FullProfile | CensoredProfile — never null for any swipe state.
// Accepted trade-off: cached entries from before Phase 16 may return profile: null for up to 30s (TTL).
export type RankingItem = {
  candidateId: string
  fitScore: number
  distanceKm: number | null
  rank: number
  profile: import('../../../application/use-cases/swipe/get-ranking.use-case').RankingProfile
}

// Export 1: POST /swipes — CANDIDATE only, rate limited (SEC-05)
export async function swipeRoutes(app: FastifyInstance, opts: SwipeRouteOpts): Promise<void> {
  const ctrl = new SwipeController(opts)
  app.post('/', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, ctrl.recordSwipe.bind(ctrl))
}

// Export 2: GET /jobs/feed and GET /jobs/:jobId/ranking
// CRITICAL: /feed MUST be registered BEFORE /:jobId/ranking
// Fastify matches /feed against /:jobId if /:jobId registered first — Zod UUID validation fails (Pitfall 1)
export async function swipeJobRoutes(app: FastifyInstance, opts: SwipeRouteOpts): Promise<void> {
  const ctrl = new SwipeController(opts)

  // Static route /feed MUST come before parameterized /:jobId/ranking (Fastify registration-order rule)
  app.get('/feed', { preHandler: [authenticate, requireRole('CANDIDATE')] }, ctrl.getFeed.bind(ctrl))
  app.get('/:jobId/ranking', { preHandler: [authenticate, requireRole('RECRUITER')] }, ctrl.getRanking.bind(ctrl))
}
