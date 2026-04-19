import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CompanyRepository } from './company.repository'
import { CompanyService } from './company.service'
import { authenticate } from '../../shared/hooks/authenticate'
import { requireRole } from '../../shared/hooks/requireRole'

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(150),
  logoUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
})

const AdjustCreditsSchema = z.object({
  amount: z.number().int().positive(),
})

export async function companyRoutes(app: FastifyInstance): Promise<void> {
  const repo = new CompanyRepository()
  const service = new CompanyService(repo)

  // POST /companies — apenas ADMIN pode criar empresas (T-03-02-01)
  app.post('/', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const body = CreateCompanySchema.parse(request.body)
    const company = await service.createCompany(body)
    return reply.status(201).send(company)
  })

  // GET /companies/:id — qualquer usuário autenticado pode visualizar
  app.get('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const company = await service.getCompany(id)
    return reply.status(200).send(company)
  })

  // PATCH /companies/admin/:id/credits — apenas ADMIN pode ajustar créditos (T-03-02-02)
  app.patch('/admin/:id/credits', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = AdjustCreditsSchema.parse(request.body)
    const company = await service.adjustCredits(id, body.amount)
    return reply.status(200).send(company)
  })
}
