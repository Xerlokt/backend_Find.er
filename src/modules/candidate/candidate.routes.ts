import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { CandidateRepository } from './candidate.repository'
import { CandidateService } from './candidate.service'

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

export async function candidateRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CandidateRepository()
  const service = new CandidateService(repo)

  // PUT /candidates/me — create or update candidate profile (CAND-01, CAND-02)
  app.put('/me', {
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, async (request, reply) => {
    const body = CandidateProfileSchema.parse(request.body)
    const profile = await service.upsertProfile(request.user.id, body)
    return reply.status(200).send(profile)
  })

  // GET /candidates/me — retrieve own candidate profile
  app.get('/me', {
    preHandler: [authenticate, requireRole('CANDIDATE')],
  }, async (request, reply) => {
    const profile = await service.getProfile(request.user.id)
    return reply.status(200).send(profile)
  })
}
