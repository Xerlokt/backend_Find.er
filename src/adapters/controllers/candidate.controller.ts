import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CandidateRepository } from '../repositories/candidate.repository'
import { UpsertCandidateProfileUseCase } from '../../application/use-cases/candidate/upsert-candidate-profile.use-case'
import { GetCandidateProfileUseCase } from '../../application/use-cases/candidate/get-candidate-profile.use-case'
import { DomainError } from '../../application/errors/domain.error'
import { ICachePort } from '../../application/ports/cache.port'

const CandidateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  professionId: z.string().min(1),
  skills: z.array(z.string()).min(1),
  preferredModalities: z.array(z.enum(['REMOTE', 'HYBRID', 'IN_PERSON'])).min(1),
  salaryExpectation: z.number().positive().optional(),
  searchRadiusKm: z.number().int().positive().default(50),
})

export class CandidateController {
  constructor(private readonly opts: { cache: ICachePort }) {}

  async upsertProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = CandidateProfileSchema.parse(request.body)
    const useCase = new UpsertCandidateProfileUseCase(new CandidateRepository(), this.opts.cache)
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
    const useCase = new GetCandidateProfileUseCase(new CandidateRepository())
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
