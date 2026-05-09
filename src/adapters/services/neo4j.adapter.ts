import { Driver } from 'neo4j-driver'
import {
  IRecommendationRepository,
  FitScoreInput,
  FitScoreJobInput,
} from '../../domain/interfaces/recommendation.repository.interface'
import { RecommendationRepository } from '../../modules/recommendation/recommendation.repository'

export class Neo4jAdapter implements IRecommendationRepository {
  private readonly inner: RecommendationRepository

  constructor(driver: Driver) {
    this.inner = new RecommendationRepository(driver)
  }

  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number> {
    return this.inner.computeFitScore(candidate, job)
  }

  async seedTaxonomy(): Promise<void> {
    return this.inner.seedTaxonomy()
  }
}
