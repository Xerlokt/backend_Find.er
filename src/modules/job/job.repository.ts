import { prisma } from '../../shared/db/prisma'
import { Modality } from '@prisma/client'

export interface CreateJobData {
  companyId: string
  title: string
  description: string
  professionId: string
  salaryMin?: number
  salaryMax?: number
  lat?: number
  lng?: number
  modality: Modality
  requiredSkills: string[]
  expiresAt: Date
}

export interface UpdateJobData {
  title?: string
  description?: string
  professionId?: string
  salaryMin?: number
  salaryMax?: number
  lat?: number
  lng?: number
  modality?: Modality
  requiredSkills?: string[]
  expiresAt?: Date
  isActive?: boolean
}

export class JobRepository {
  async create(recruiterId: string, data: CreateJobData) {
    return prisma.job.create({ data: { ...data, recruiterId } })
  }

  async findJobById(id: string) {
    return prisma.job.findUnique({ where: { id } })
  }

  async update(id: string, data: UpdateJobData) {
    return prisma.job.update({ where: { id }, data })
  }

  async findByRecruiterId(recruiterId: string) {
    return prisma.job.findMany({ where: { recruiterId }, orderBy: { createdAt: 'desc' } })
  }

  async findRecruiterProfileByUserId(userId: string) {
    // Direct Prisma call — NEVER import RecruiterRepository (module isolation, ARCH-04)
    return prisma.recruiterProfile.findUnique({ where: { userId } })
  }

  async deactivateExpiredJobs(): Promise<number> {
    const result = await prisma.job.updateMany({
      where: { isActive: true, expiresAt: { lt: new Date() } },
      data: { isActive: false },
    })
    return result.count
  }
}
