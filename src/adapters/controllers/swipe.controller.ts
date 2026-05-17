import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { SwipeRepository } from '../repositories/swipe.repository'
import { RecordSwipeUseCase } from '../../application/use-cases/swipe/record-swipe.use-case'
import { GetFeedUseCase } from '../../application/use-cases/swipe/get-feed.use-case'
import { GetRankingUseCase } from '../../application/use-cases/swipe/get-ranking.use-case'
import { DomainError } from '../../application/errors/domain.error'
import { IChatPort } from '../../application/ports/chat.port'
import { ICachePort } from '../../application/ports/cache.port'
import { IRecommendationRepository } from '../../domain/interfaces/recommendation.repository.interface'

const SwipeBodySchema = z.object({
  jobId: z.string().uuid(),
  direction: z.enum(['LIKE', 'DISLIKE']),
})

const FeedQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

const JobIdParamsSchema = z.object({
  jobId: z.string().uuid(),
})

export class SwipeController {
  constructor(
    private readonly opts: {
      neo4j: IRecommendationRepository
      chat: IChatPort
      cache: ICachePort
    },
  ) {}

  async recordSwipe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { jobId, direction } = SwipeBodySchema.parse(request.body)
    const useCase = new RecordSwipeUseCase(new SwipeRepository(), this.opts.chat, this.opts.cache)
    try {
      const result = await useCase.execute(request.user.id, jobId, direction)
      reply.status(201).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getFeed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { cursor, limit } = FeedQuerySchema.parse(request.query)
    const useCase = new GetFeedUseCase(new SwipeRepository(), this.opts.neo4j, this.opts.cache)
    try {
      const result = await useCase.execute(request.user.id, cursor, limit)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getRanking(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { jobId } = JobIdParamsSchema.parse(request.params)
    const useCase = new GetRankingUseCase(new SwipeRepository(), this.opts.neo4j, this.opts.cache)
    try {
      const result = await useCase.execute(request.user.id, jobId)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
