import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CreditRepository } from '../repositories/credit.repository'
import { UnlockCandidateUseCase } from '../../application/use-cases/credits/unlock-candidate.use-case'
import { DomainError } from '../../application/errors/domain.error'
import { haversineKm } from '../../shared/utils/haversine'
import { IChatPort } from '../../application/ports/chat.port'

const UnlockParamsSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
})

export class CreditsController {
  constructor(private readonly chat: IChatPort) {}

  async unlock(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { jobId, candidateId } = UnlockParamsSchema.parse(request.params)
    const creditRepo = new CreditRepository()
    const useCase = new UnlockCandidateUseCase(creditRepo, this.chat)

    try {
      const unlock = await useCase.execute(request.user.id, jobId, candidateId)

      // Response enrichment — controller concern, not business logic
      const [candidateProfile, job] = await Promise.all([
        creditRepo.findCandidateProfileById(candidateId),
        creditRepo.findJobById(jobId),
      ])

      const distanceKm =
        candidateProfile && job
          ? haversineKm(candidateProfile.lat, candidateProfile.lng, job.lat, job.lng)
          : null

      reply.status(201).send({
        ...unlock,
        profile: candidateProfile
          ? {
              name: candidateProfile.name,
              avatarUrl: candidateProfile.avatarUrl,
              bio: candidateProfile.bio,
              skills: candidateProfile.skills,
              professionId: candidateProfile.professionId,
              preferredModalities: candidateProfile.preferredModalities,
              salaryExpectation: candidateProfile.salaryExpectation,
              distanceKm,
            }
          : null,
      })
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
