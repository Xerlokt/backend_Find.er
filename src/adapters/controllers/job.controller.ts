import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { JobRepository } from '../repositories/job.repository'
import { CreateJobUseCase } from '../../application/use-cases/job/create-job.use-case'
import { UpdateJobUseCase } from '../../application/use-cases/job/update-job.use-case'
import { DeactivateJobUseCase } from '../../application/use-cases/job/deactivate-job.use-case'
import { ListJobsByRecruiterUseCase } from '../../application/use-cases/job/list-jobs-by-recruiter.use-case'
import { GetJobByIdUseCase } from '../../application/use-cases/job/get-job-by-id.use-case'
import { DomainError } from '../../application/errors/domain.error'

// Local type — NOT re-exported from route file
interface RankingItem {
  candidateId: string
  fitScore: number
  profile: Record<string, unknown> | null
}

const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  professionId: z.string().min(1),
  salaryMin: z.number().positive().optional(),
  salaryMax: z.number().positive().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  modality: z.enum(['REMOTE', 'HYBRID', 'IN_PERSON']),
  requiredSkills: z.array(z.string()).min(1),
  expiresAt: z.string().datetime(),
  discProfile: z.enum(['D', 'I', 'S', 'C']).optional().nullable(),
})

const JobParamsSchema = z.object({ id: z.string().uuid() })

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
  discProfile: z.enum(['D', 'I', 'S', 'C']).optional().nullable(),
})

export class JobController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = CreateJobSchema.parse(request.body)
    const useCase = new CreateJobUseCase(new JobRepository())
    try {
      const job = await useCase.execute(request.user.id, {
        ...body,
        expiresAt: new Date(body.expiresAt),
      })
      reply.status(201).send(job)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async listMine(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const useCase = new ListJobsByRecruiterUseCase(new JobRepository())
    try {
      const jobs = await useCase.execute(request.user.id)
      reply.status(200).send(jobs)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = JobParamsSchema.parse(request.params)
    const useCase = new GetJobByIdUseCase(new JobRepository())
    try {
      const job = await useCase.execute(params.id)
      reply.status(200).send({ ...job, rankings: [] as RankingItem[] })
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = JobParamsSchema.parse(request.params)
    const body = UpdateJobSchema.parse(request.body)
    const useCase = new UpdateJobUseCase(new JobRepository())
    try {
      const { expiresAt: expiresAtStr, ...rest } = body
      const job = await useCase.execute(request.user.id, params.id, {
        ...rest,
        ...(expiresAtStr ? { expiresAt: new Date(expiresAtStr) } : {}),
      })
      reply.status(200).send(job)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async deactivate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = JobParamsSchema.parse(request.params)
    const useCase = new DeactivateJobUseCase(new JobRepository())
    try {
      const job = await useCase.execute(request.user.id, params.id)
      reply.status(200).send(job)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
