import { prisma } from '../../infrastructure/database/prisma'
import { ICandidateRepository } from '../../domain/interfaces/candidate.repository.interface'
import { CandidateProfile } from '../../domain/entities/candidate.entity'
import { Modality } from '../../domain/entities/job.entity'

export class CandidateRepository implements ICandidateRepository {
  async upsertProfile(
    userId: string,
    data: {
      name: string
      bio?: string | null
      lat?: number | null
      lng?: number | null
      professionId: string
      skills: string[]
      preferredModalities: Modality[]
      salaryExpectation?: number | null
      searchRadiusKm?: number
    },
  ): Promise<CandidateProfile> {
    const row = await prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByUserId(userId: string): Promise<CandidateProfile | null> {
    const row = await prisma.candidateProfile.findUnique({ where: { userId } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: any): CandidateProfile {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      bio: row.bio,
      lat: row.lat,
      lng: row.lng,
      professionId: row.professionId,
      skills: row.skills,
      preferredModalities: row.preferredModalities as Modality[],
      searchRadiusKm: row.searchRadiusKm,
      salaryExpectation: row.salaryExpectation,
    }
  }
}
