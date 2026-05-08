import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { RecruiterRepository } from '../repositories/recruiter.repository'
import { UpsertRecruiterProfileUseCase } from '../../application/use-cases/recruiter/upsert-recruiter-profile.use-case'
import { GetRecruiterProfileUseCase } from '../../application/use-cases/recruiter/get-recruiter-profile.use-case'
import { DomainError } from '../../application/errors/domain.error'

const RecruiterProfileSchema = z.object({
  companyId: z.string().uuid(),
})

export class RecruiterController {
  async upsertProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = RecruiterProfileSchema.parse(request.body)
    const useCase = new UpsertRecruiterProfileUseCase(new RecruiterRepository())
    try {
      const profile = await useCase.execute(request.user.id, body)
      reply.status(200).send(profile)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = new GetRecruiterProfileUseCase(new RecruiterRepository())
    try {
      const profile = await useCase.execute(request.user.id)
      reply.status(200).send(profile)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
