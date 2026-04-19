import { CandidateRepository, UpsertProfileData } from './candidate.repository'
import { AppError } from '../../shared/errors/AppError'

export class CandidateService {
  constructor(private readonly repo: CandidateRepository) {}

  async upsertProfile(userId: string, data: UpsertProfileData) {
    return this.repo.upsertProfile(userId, data)
  }

  async getProfile(userId: string) {
    const profile = await this.repo.findProfileByUserId(userId)
    if (!profile) {
      throw new AppError('Profile not found', 404, 'NOT_FOUND')
    }
    return profile
  }
}
