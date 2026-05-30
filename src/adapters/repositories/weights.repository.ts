import { prisma } from '../../infrastructure/database/prisma'
import { IWeightsRepository } from '../../domain/interfaces/weights.repository.interface'
import { CandidateWeights } from '../../domain/entities/candidate-weights.entity'

export class WeightsRepository implements IWeightsRepository {
  async upsertWeights(
    candidateId: string,
    data: {
      professionWeight: number
      skillsWeight: number
      locationWeight: number
      modalityWeight: number
      salaryWeight: number
      likeCount: number
    },
  ): Promise<CandidateWeights> {
    const row = await prisma.candidateWeights.upsert({
      where: { candidateId },
      create: { candidateId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByCandidateId(candidateId: string): Promise<CandidateWeights | null> {
    const row = await prisma.candidateWeights.findUnique({ where: { candidateId } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: any): CandidateWeights {
    return {
      id: row.id,
      candidateId: row.candidateId,
      professionWeight: row.professionWeight,
      skillsWeight: row.skillsWeight,
      locationWeight: row.locationWeight,
      modalityWeight: row.modalityWeight,
      salaryWeight: row.salaryWeight,
      likeCount: row.likeCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
