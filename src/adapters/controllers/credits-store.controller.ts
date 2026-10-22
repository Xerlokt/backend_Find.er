import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { CreditRepository } from '../repositories/credit.repository'
import { CompanyRepository } from '../repositories/company.repository'
import { PurchaseCreditsUseCase } from '../../application/use-cases/credits/purchase-credits.use-case'
import { GetMyTransactionsUseCase } from '../../application/use-cases/credits/get-my-transactions.use-case'
import { CREDIT_PACKAGES } from '../../application/use-cases/credits/credits.constants'
import { DomainError } from '../../application/errors/domain.error'

const PurchaseBodySchema = z.object({ packageId: z.string().min(1).max(64) })

// Buy credits (simulated payment) and read the company statement — recruiter side
export class CreditsStoreController {
  private readonly creditRepo = new CreditRepository()
  private readonly companyRepo = new CompanyRepository()

  async packages(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(200).send(CREDIT_PACKAGES)
  }

  async purchase(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { packageId } = PurchaseBodySchema.parse(request.body)
    try {
      const result = await new PurchaseCreditsUseCase(this.creditRepo).execute(request.user.id, packageId)
      reply.status(201).send(result)
    } catch (err) {
      this.fail(err, reply)
    }
  }

  async transactions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const rows = await new GetMyTransactionsUseCase(this.creditRepo, this.companyRepo).execute(request.user.id)
      reply.status(200).send(rows)
    } catch (err) {
      this.fail(err, reply)
    }
  }

  private fail(err: unknown, reply: FastifyReply): void {
    if (err instanceof DomainError) {
      reply.status(err.statusCode).send({ error: err.message, code: err.code })
      return
    }
    throw err
  }
}
