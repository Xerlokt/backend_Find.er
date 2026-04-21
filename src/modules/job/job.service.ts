import { JobRepository, CreateJobData, UpdateJobData } from './job.repository'
import { AppError } from '../../shared/errors/AppError'

export class JobService {
  constructor(private readonly repo: JobRepository) {}

  async createJob(userId: string, data: Omit<CreateJobData, 'companyId'>) {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new AppError('Recruiter profile not found', 404, 'NOT_FOUND')
    return this.repo.create(profile.id, { ...data, companyId: profile.companyId })
  }

  async updateJob(userId: string, jobId: string, data: UpdateJobData) {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new AppError('Recruiter profile not found', 404, 'NOT_FOUND')
    const job = await this.repo.findJobById(jobId)
    if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
    if (job.recruiterId !== profile.id) throw new AppError('Forbidden', 403, 'FORBIDDEN')
    return this.repo.update(jobId, data)
  }

  async deactivateJob(userId: string, jobId: string) {
    return this.updateJob(userId, jobId, { isActive: false })
  }

  async listJobsByRecruiter(userId: string) {
    const profile = await this.repo.findRecruiterProfileByUserId(userId)
    if (!profile) throw new AppError('Recruiter profile not found', 404, 'NOT_FOUND')
    return this.repo.findByRecruiterId(profile.id)
  }

  async getJobById(jobId: string) {
    const job = await this.repo.findJobById(jobId)
    if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND')
    return job
  }
}
