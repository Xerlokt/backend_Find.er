import { prisma } from '../../infrastructure/database/prisma'
import { IJobRepository } from '../../domain/interfaces/job.repository.interface'
import { Job, Modality } from '../../domain/entities/job.entity'
import { RecruiterProfile } from '../../domain/entities/recruiter.entity'

export class JobRepository implements IJobRepository {
  async create(
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
  ): Promise<Job> {
    const row = await prisma.job.create({ data: { ...data, recruiterId } })
    return this.toDomain(row)
  }

  async findById(id: string): Promise<Job | null> {
    const row = await prisma.job.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async update(
    id: string,
    data: Partial<Omit<Job, 'id' | 'companyId' | 'recruiterId' | 'createdAt'>>,
  ): Promise<Job> {
    const row = await prisma.job.update({ where: { id }, data })
    return this.toDomain(row)
  }

  async findByRecruiterId(recruiterId: string): Promise<Job[]> {
    const rows = await prisma.job.findMany({
      where: { recruiterId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toDomain(r))
  }

  async findRecruiterProfileByUserId(userId: string): Promise<RecruiterProfile | null> {
    // Direct Prisma call — NEVER import RecruiterRepository (module isolation, ARCH-04)
    const row = await prisma.recruiterProfile.findUnique({ where: { userId } })
    return row ? { id: row.id, userId: row.userId, companyId: row.companyId } : null
  }

  async deactivateExpiredJobs(): Promise<number> {
    const result = await prisma.job.updateMany({
      where: { isActive: true, expiresAt: { lt: new Date() } },
      data: { isActive: false },
    })
    return result.count
  }

  private toDomain(row: any): Job {
    return {
      id: row.id,
      companyId: row.companyId,
      recruiterId: row.recruiterId,
      title: row.title,
      description: row.description,
      professionId: row.professionId,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      lat: row.lat,
      lng: row.lng,
      modality: row.modality as Modality, // cast: Prisma enum → domain union
      requiredSkills: row.requiredSkills,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
      createdAt: row.createdAt,
      discProfile: row.discProfile ?? null,  // DISC-03: optional desired DISC profile
    }
  }
}
