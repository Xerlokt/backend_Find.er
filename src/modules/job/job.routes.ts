import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'
import { JobRepository } from './job.repository'
import { JobService } from './job.service'

const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  professionId: z.string().min(1),
  companyId: z.string().uuid(),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']),
  requiredSkills: z.array(z.string()).min(1),
  expiresAt: z.string().datetime(),
})

const UpdateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  professionId: z.string().min(1).optional(),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']).optional(),
  requiredSkills: z.array(z.string()).min(1).optional(),
  expiresAt: z.string().datetime().optional(),
})

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const repo = new JobRepository()
  const service = new JobService(repo)

  // POST /jobs — cria nova vaga
  app.post('/', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const body = CreateJobSchema.parse(request.body)
    const job = await service.createJob(request.user.id, {
      ...body,
      expiresAt: new Date(body.expiresAt),
    })
    return reply.status(201).send(job)
  })

  // GET /jobs/mine — lista vagas do recruiter autenticado (DEVE estar antes de /:id)
  app.get('/mine', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const jobs = await service.listJobsByRecruiter(request.user.id)
    return reply.status(200).send(jobs)
  })

  // GET /jobs/:id — detalhe da vaga com rankings: [] placeholder (Phase 6)
  app.get('/:id', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const job = await service.getJobById(id)
    // rankings: [] — placeholder; Phase 6 preenche com candidatos pontuados por fit
    return reply.status(200).send({ ...job, rankings: [] })
  })

  // PATCH /jobs/:id — atualiza detalhes da vaga
  app.patch('/:id', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = UpdateJobSchema.parse(request.body)
    const job = await service.updateJob(request.user.id, id, {
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    })
    return reply.status(200).send(job)
  })

  // DELETE /jobs/:id/deactivate — desativação suave da vaga
  app.delete('/:id/deactivate', {
    preHandler: [authenticate, requireRole('RECRUITER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const job = await service.deactivateJob(request.user.id, id)
    return reply.status(200).send(job)
  })
}
