import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CreateCompanyUseCase } from '../../application/use-cases/company/create-company.use-case'
import { GetCompanyUseCase } from '../../application/use-cases/company/get-company.use-case'
import { AdjustCompanyCreditsUseCase } from '../../application/use-cases/company/adjust-company-credits.use-case'
import { CompanyRepository } from '../repositories/company.repository'
import { DomainError } from '../../application/errors/domain.error'

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(150),
  logoUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
})

const CompanyParamsSchema = z.object({ id: z.string().uuid() })

const AdjustCreditsSchema = z.object({
  amount: z.number().int().positive(),
})

export class CompanyController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = CreateCompanySchema.parse(request.body)
    const useCase = new CreateCompanyUseCase(new CompanyRepository())
    try {
      const result = await useCase.execute(body)
      reply.status(201).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = CompanyParamsSchema.parse(request.params)
    const useCase = new GetCompanyUseCase(new CompanyRepository())
    try {
      const result = await useCase.execute(id)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async adjustCredits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = AdjustCreditsSchema.parse(request.body)
    const { id } = CompanyParamsSchema.parse(request.params)
    const useCase = new AdjustCompanyCreditsUseCase(new CompanyRepository())
    try {
      const result = await useCase.execute(id, body.amount)
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
