import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { CreditRepository } from './credits.repository'
import { CreditService } from './credits.service'
import { haversineKm } from '../../shared/utils/haversine'

const UnlockParamsSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
})

export async function creditsJobRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CreditRepository()
  const service = new CreditService(repo)

  app.post('/:jobId/candidates/:candidateId/unlock', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const { jobId, candidateId } = UnlockParamsSchema.parse(request.params)

    const unlock = await service.unlockCandidate(request.user.id, jobId, candidateId)

    const [candidateProfile, job] = await Promise.all([
      repo.findCandidateProfileById(candidateId),
      repo.findJobById(jobId),
    ])

    const distanceKm = candidateProfile && job
      ? haversineKm(candidateProfile.lat, candidateProfile.lng, job.lat, job.lng)
      : null

    return reply.status(201).send({
      id: unlock.id,
      companyId: unlock.companyId,
      candidateId: unlock.candidateId,
      jobId: unlock.jobId,
      unlockedAt: unlock.unlockedAt,
      creditsCost: unlock.creditsCost,
      profile: candidateProfile
        ? {
            name: candidateProfile.name,
            avatarUrl: candidateProfile.user.avatarUrl,
            bio: candidateProfile.bio,
            skills: candidateProfile.skills,
            professionId: candidateProfile.professionId,
            preferredModalities: candidateProfile.preferredModalities,
            salaryExpectation: candidateProfile.salaryExpectation,
            distanceKm,
          }
        : null,
    })
  })
}
