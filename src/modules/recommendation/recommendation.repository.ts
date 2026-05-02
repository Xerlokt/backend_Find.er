// src/modules/recommendation/recommendation.repository.ts
// NEVER import from src/modules/swipe/, src/modules/job/, or any other module — ARCH-04
import neo4j, { Driver } from 'neo4j-driver'
import type { IRecommendationService, CandidateData, JobData } from '../../shared/interfaces/recommendation.interface'

export class RecommendationRepository implements IRecommendationService {
  constructor(private readonly driver: Driver) {}

  async computeFitScore(_candidate: CandidateData, _job: JobData): Promise<number> {
    // Phase 06-01 stub — implemented in Plan 06-02
    return 0
  }

  async seedTaxonomy(): Promise<void> {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
    try {
      await session.executeWrite(async (tx) => {
        // Professions — idempotent MERGE statements (REC-02)
        const professions = [
          { id: 'backend-dev', name: 'Backend Developer' },
          { id: 'frontend-dev', name: 'Frontend Developer' },
          { id: 'fullstack-dev', name: 'Fullstack Developer' },
          { id: 'devops', name: 'DevOps Engineer' },
          { id: 'data-scientist', name: 'Data Scientist' },
          { id: 'mobile-dev', name: 'Mobile Developer' },
        ]
        for (const p of professions) {
          await tx.run('MERGE (p:Profession {id: $id}) SET p.name = $name', p)
        }

        // Skills — idempotent MERGE statements
        const skills = [
          { id: 'nodejs', name: 'Node.js' },
          { id: 'typescript', name: 'TypeScript' },
          { id: 'javascript', name: 'JavaScript' },
          { id: 'react', name: 'React' },
          { id: 'postgresql', name: 'PostgreSQL' },
          { id: 'docker', name: 'Docker' },
          { id: 'python', name: 'Python' },
          { id: 'go', name: 'Go' },
          { id: 'kotlin', name: 'Kotlin' },
          { id: 'swift', name: 'Swift' },
        ]
        for (const s of skills) {
          await tx.run('MERGE (s:Skill {id: $id}) SET s.name = $name', s)
        }

        // REQUIRES relationships: Profession → Skill
        const requires = [
          { profId: 'backend-dev', skillId: 'nodejs' },
          { profId: 'backend-dev', skillId: 'typescript' },
          { profId: 'frontend-dev', skillId: 'react' },
          { profId: 'frontend-dev', skillId: 'typescript' },
          { profId: 'fullstack-dev', skillId: 'nodejs' },
          { profId: 'fullstack-dev', skillId: 'react' },
          { profId: 'devops', skillId: 'docker' },
          { profId: 'data-scientist', skillId: 'python' },
        ]
        for (const r of requires) {
          await tx.run(
            'MATCH (p:Profession {id: $profId}), (s:Skill {id: $skillId}) MERGE (p)-[:REQUIRES]->(s)',
            r,
          )
        }

        // RELATED_TO relationships: bidirectional, weight 0.8
        const related = [
          { aId: 'typescript', bId: 'javascript' },
          { aId: 'nodejs', bId: 'javascript' },
          { aId: 'react', bId: 'javascript' },
        ]
        for (const r of related) {
          await tx.run(
            'MATCH (a:Skill {id: $aId}), (b:Skill {id: $bId}) MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b) MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)',
            r,
          )
        }
      })
    } finally {
      await session.close()
    }
  }
}
