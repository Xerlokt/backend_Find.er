import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { Company } from '../../../domain/entities/company.entity'
import { DomainError } from '../../errors/domain.error'

export interface CompanyViewer {
  userId: string
  role: string
}

export class GetCompanyUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  /** plan and credits are billing data: only admins and the company's own recruiters get them. */
  async execute(id: string, viewer: CompanyViewer): Promise<Company | Omit<Company, 'plan' | 'credits'>> {
    const company = await this.repo.findById(id)
    if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)

    const canSeeBilling =
      viewer.role === 'ADMIN' ||
      (viewer.role === 'RECRUITER' && (await this.repo.recruiterBelongsToCompany(viewer.userId, id)))
    if (canSeeBilling) return company

    const { plan: _plan, credits: _credits, ...publicCompany } = company
    return publicCompany
  }
}
