import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { ListUsersUseCase } from '../../application/use-cases/admin/list-users.use-case'
import { GetUserByIdUseCase } from '../../application/use-cases/admin/get-user-by-id.use-case'
import { AdjustAdminCreditsUseCase } from '../../application/use-cases/admin/adjust-admin-credits.use-case'
import { GetTransactionsUseCase } from '../../application/use-cases/admin/get-transactions.use-case'
import { UserRepository } from '../repositories/user.repository'
import { CompanyRepository } from '../repositories/company.repository'
import { DomainError } from '../../application/errors/domain.error'

const AdjustCreditsAdminSchema = z.object({
  amount: z.number().int().positive(),
})

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

const ParamIdSchema = z.object({ id: z.string().uuid() })

interface ICreditGrantPort {
  grantCredits(companyId: string, amount: number, reason?: string): Promise<unknown>
}

export class AdminController {
  constructor(private readonly creditService: ICreditGrantPort) {}

  async listUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { page, limit } = ListUsersQuerySchema.parse(request.query)
    const useCase = new ListUsersUseCase(new UserRepository())
    try {
      const users = await useCase.execute(page, limit)
      reply.status(200).send(users)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getUserById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamIdSchema.parse(request.params)
    const useCase = new GetUserByIdUseCase(new UserRepository())
    try {
      const user = await useCase.execute(id)
      reply.status(200).send(user)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async adjustCredits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamIdSchema.parse(request.params)
    const { amount } = AdjustCreditsAdminSchema.parse(request.body)
    const useCase = new AdjustAdminCreditsUseCase(this.creditService)
    try {
      const result = await useCase.execute(id, amount)
      reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }

  async getTransactions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = ParamIdSchema.parse(request.params)
    const useCase = new GetTransactionsUseCase(new CompanyRepository())
    try {
      const transactions = await useCase.execute(id)
      reply.status(200).send(transactions)
    } catch (err) {
      if (err instanceof DomainError) {
        reply.status(err.statusCode).send({ error: err.message, code: err.code })
        return
      }
      throw err
    }
  }
}
