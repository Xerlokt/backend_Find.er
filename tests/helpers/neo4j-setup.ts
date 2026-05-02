// tests/helpers/neo4j-setup.ts
// Exports setupNeo4j() — called explicitly in beforeAll of recommendation integration tests.
// NOT a Jest setup file — does NOT register global hooks.
import { getNeo4jDriver } from '../../src/shared/db/neo4j'
import { RecommendationRepository } from '../../src/modules/recommendation/recommendation.repository'

export async function setupNeo4j(): Promise<void> {
  const driver = getNeo4jDriver()
  const session = driver.session()
  try {
    await session.run('MATCH (n) DETACH DELETE n')
    const repo = new RecommendationRepository(driver)
    await repo.seedTaxonomy()
  } finally {
    await session.close()
  }
}
