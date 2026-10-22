import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CreditRepository } from '../repositories/credit.repository'
import { UnlockCandidateUseCase } from '../../application/use-cases/credits/unlock-candidate.use-case'
import { DomainError } from '../../application/errors/domain.error'
import { haversineKm } from '../../application/utils/haversine'
import { IChatPort } from '../../application/ports/chat.port'
import { ICachePort } from '../../application/ports/cache.port'

const UnlockParamsSchema = z.object({
  jobId: z.string().uuid(),
  // opaque unlockToken from the ranking (a raw candidate uuid is still accepted)
  candidateId: z.string().min(1).max(512),
})

export class CreditsController {
  private readonly creditRepo: CreditRepository
  private readonly useCase: UnlockCandidateUseCase

  constructor(chat: IChatPort, cache?: ICachePort) {
    this.creditRepo = new CreditRepository()
    this.useCase = new UnlockCandidateUseCase(this.creditRepo, chat, cache)
  }

  async unlock(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { jobId, candidateId: candidateRef } = UnlockParamsSchema.parse(request.params)

    try {
      const unlock = await this.useCase.execute(request.user.id, jobId, candidateRef)
      const candidateId = unlock.candidateId

      // Response enrichment — controller concern, not business logic
      // job cannot be null here: use case would have thrown NOT_FOUND otherwise
      const [candidateProfile, job] = await Promise.all([
        this.creditRepo.findCandidateProfileById(candidateId),
        this.creditRepo.findJobById(jobId),
      ])

      const distanceKm = candidateProfile
        ? haversineKm(candidateProfile.lat, candidateProfile.lng, job!.lat, job!.lng)
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
