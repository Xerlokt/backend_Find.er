import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CandidateRepository } from '../repositories/candidate.repository'
import { DiscRepository } from '../repositories/disc.repository'
import { SubmitDiscUseCase } from '../../application/use-cases/disc/submit-disc.use-case'
import { GetDiscUseCase } from '../../application/use-cases/disc/get-disc.use-case'
import { DomainError } from '../../application/errors/domain.error'

const DiscParamsSchema = z.object({
  id: z.string().uuid(), // candidateId — must be a valid UUID
})

const SubmitDiscBodySchema = z.object({
  answers: z.array(z.enum(['D', 'I', 'S', 'C'])).length(4),
  // Exactly 4 answers, each must be a DISC dimension letter (T-17-02 mitigation)
})

export class DiscController {
  async submitDisc(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: candidateId } = DiscParamsSchema.parse(request.params)
    const { answers } = SubmitDiscBodySchema.parse(request.body)
    const useCase = new SubmitDiscUseCase(new DiscRepository(), new CandidateRepository())
    try {
      const result = await useCase.execute(request.user.id, candidateId, answers as Array<'D' | 'I' | 'S' | 'C'>)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getDisc(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: candidateId } = DiscParamsSchema.parse(request.params)
    const useCase = new GetDiscUseCase(new DiscRepository(), new CandidateRepository())
    try {
      const result = await useCase.execute(request.user.id, candidateId)
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
