import { prisma } from '../../shared/db/prisma'
import { CandidateProfile, Modality } from '@prisma/client'

export interface UpsertProfileData {
  name: string
  bio?: string
  lat?: number
  lng?: number
  professionId: string
  skills: string[]
  preferredModalities: Modality[]
  salaryExpectation?: number
  searchRadiusKm?: number
}

export class CandidateRepository {
  async upsertProfile(userId: string, data: UpsertProfileData): Promise<CandidateProfile> {
    return prisma.candidateProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    })
  }

  async findProfileByUserId(userId: string): Promise<CandidateProfile | null> {
    return prisma.candidateProfile.findUnique({ where: { userId } })
  }
}
