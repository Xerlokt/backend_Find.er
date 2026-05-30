import { prisma } from '../../infrastructure/database/prisma'
import { IDiscRepository } from '../../domain/interfaces/disc.repository.interface'
import { DiscResult } from '../../domain/entities/disc-result.entity'

export class DiscRepository implements IDiscRepository {
  async upsert(
    candidateId: string,
    data: {
      scoreD: number
      scoreI: number
      scoreS: number
      scoreC: number
      dominant: string
    },
  ): Promise<DiscResult> {
    const row = await prisma.discResult.upsert({
      where: { candidateId },
      create: { candidateId, ...data },
      update: { ...data },
    })
    return this.toDomain(row)
  }

  async findByCandidateId(candidateId: string): Promise<DiscResult | null> {
    const row = await prisma.discResult.findUnique({ where: { candidateId } })
    return row ? this.toDomain(row) : null
  }

  private toDomain(row: any): DiscResult {
    return {
      id: row.id,
      candidateId: row.candidateId,
      scoreD: row.scoreD,
      scoreI: row.scoreI,
      scoreS: row.scoreS,
      scoreC: row.scoreC,
      dominant: row.dominant,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
