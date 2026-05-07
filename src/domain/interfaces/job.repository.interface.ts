import { Job, Modality } from '../entities/job.entity'
import { RecruiterProfile } from '../entities/recruiter.entity'

export interface IJobRepository {
  create(
    recruiterId: string,
    data: {
      companyId: string
      title: string
      description: string
      professionId: string
      salaryMin?: number | null
      salaryMax?: number | null
      lat?: number | null
      lng?: number | null
      modality: Modality
      requiredSkills: string[]
      expiresAt: Date
    },
  ): Promise<Job>
  findById(id: string): Promise<Job | null>
  update(
    id: string,
    data: Partial<Omit<Job, 'id' | 'companyId' | 'recruiterId' | 'createdAt'>>,
  ): Promise<Job>
  findByRecruiterId(recruiterId: string): Promise<Job[]>
  findRecruiterProfileByUserId(userId: string): Promise<RecruiterProfile | null>
  deactivateExpiredJobs(): Promise<number>
}
