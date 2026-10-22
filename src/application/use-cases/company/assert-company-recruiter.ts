import { ICompanyRepository } from '../../../domain/interfaces/company.repository.interface'
import { DomainError } from '../../errors/domain.error'

/** Só recrutadores da própria empresa mexem no perfil e veem as estatísticas. */
export async function assertCompanyRecruiter(
  repo: Pick<ICompanyRepository, 'findById' | 'recruiterBelongsToCompany'>,
  userId: string,
  companyId: string,
): Promise<void> {
  const company = await repo.findById(companyId)
  if (!company) throw new DomainError('Company not found', 'NOT_FOUND', 404)
  if (!(await repo.recruiterBelongsToCompany(userId, companyId))) throw new DomainError('Forbidden', 'FORBIDDEN', 403)
}
