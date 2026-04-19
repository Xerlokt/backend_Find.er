import { RecruiterRepository } from './recruiter.repository'
import { AppError } from '../../shared/errors/AppError'

export class RecruiterService {
  constructor(private readonly repo: RecruiterRepository) {}

  async upsertProfile(userId: string, data: { companyId: string }) {
    const company = await this.repo.findCompanyById(data.companyId)
    if (!company) throw new AppError('Company not found', 404, 'NOT_FOUND')
    return this.repo.upsertProfile(userId, data)
  }

  async getProfile(userId: string) {
    const profile = await this.repo.findProfileByUserId(userId)
    if (!profile) throw new AppError('Profile not found', 404, 'NOT_FOUND')
    return profile
  }
}
