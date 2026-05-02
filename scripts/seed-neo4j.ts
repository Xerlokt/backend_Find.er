import 'dotenv/config'
import { getNeo4jDriver } from '../src/shared/db/neo4j'
import { RecommendationRepository } from '../src/modules/recommendation/recommendation.repository'

async function main(): Promise<void> {
  const driver = getNeo4jDriver()
  const repo = new RecommendationRepository(driver)
  try {
    console.log('Seeding Neo4j taxonomy...')
    await repo.seedTaxonomy()
    console.log('Neo4j taxonomy seed complete.')
    console.log('Professions: backend-dev, frontend-dev, fullstack-dev, devops, data-scientist, mobile-dev')
    console.log('Skills: Node.js, TypeScript, JavaScript, React, PostgreSQL, Docker, Python, Go, Kotlin, Swift')
  } finally {
    await driver.close()
  }
}

main().catch((err: Error) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
