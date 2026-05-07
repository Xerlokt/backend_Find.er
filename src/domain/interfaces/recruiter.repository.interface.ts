import { RecruiterProfile } from '../entities/recruiter.entity'
import { Company } from '../entities/company.entity'

export interface IRecruiterRepository {
  upsertProfile(userId: string, data: { companyId: string }): Promise<RecruiterProfile>
  findByUserId(userId: string): Promise<RecruiterProfile | null>
  findCompanyById(id: string): Promise<Company | null>
}
