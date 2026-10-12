import { User } from '../entities/user.entity'
import { Company } from '../entities/company.entity'
import { CreditTransaction } from '../entities/credit-transaction.entity'

export interface ICompanyRepository {
  create(data: {
    name: string
    logoUrl?: string
    description?: string
  }): Promise<Company>
  findById(id: string): Promise<Company | null>
  findByCnpj(cnpj: string): Promise<Company | null>
  /** true se o CNPJ pertence a uma empresa com ao menos um recrutador de email verificado. */
  hasVerifiedOwner(cnpj: string): Promise<boolean>
  /**
   * Libera um CNPJ preso por cadastro nunca verificado: apaga a empresa e seus recrutadores,
   * desde que nenhum tenha verificado o email. Devolve true se liberou (ou se não havia dono).
   */
  removeUnverifiedByCnpj(cnpj: string): Promise<boolean>
  /** Cria usuário RECRUITER + empresa + vínculo numa única transação. */
  createWithRecruiter(data: {
    email: string
    passwordHash: string
    company: {
      name: string
      cnpj: string
      legalName: string
      tradeName: string | null
      city: string | null
      state: string | null
      description?: string
      logoUrl?: string
    }
  }): Promise<{ user: User; company: Company }>
  adjustCredits(companyId: string, delta: number, reason?: string): Promise<Company>
  getTransactions(companyId: string): Promise<CreditTransaction[]>
}
