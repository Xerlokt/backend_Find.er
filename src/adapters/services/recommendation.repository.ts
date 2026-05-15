// src/adapters/services/recommendation.repository.ts
// NEVER import from src/modules/swipe/, src/modules/job/, or any other module — ARCH-04
import neo4j, { Driver } from 'neo4j-driver'
import type {
  IRecommendationRepository,
  FitScoreInput,
  FitScoreJobInput,
} from '../../domain/interfaces/recommendation.repository.interface'
import { haversineKm } from '../../application/utils/haversine'

export class RecommendationRepository implements IRecommendationRepository {
  constructor(private readonly driver: Driver) {}

  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number> {
    // Factor 1: Profession match (30%)
    const professionScore =
      candidate.professionId != null &&
      job.professionId != null &&
      candidate.professionId === job.professionId
        ? 1.0
        : 0.0

    // Factor 2: Skills overlap (35%) — case-insensitive exact match (RELATED_TO traversal deferred to v1.1)
    let skillsScore: number
    if (job.requiredSkills.length === 0) {
      skillsScore = 1.0
    } else {
      const matched = job.requiredSkills.filter((req) =>
        candidate.skills.some((cs) => cs.toLowerCase() === req.toLowerCase()),
      )
      skillsScore = matched.length / job.requiredSkills.length
    }

    // Factor 3: Location proximity (20%)
    let locationScore: number
    if (job.lat == null || job.lng == null) {
      locationScore = 1.0 // No location requirement — all candidates qualify
    } else if (candidate.lat == null || candidate.lng == null) {
      locationScore = 0.5 // Neutral — cannot penalise candidate for not sharing location
    } else {
      const radius = candidate.searchRadiusKm > 0 ? candidate.searchRadiusKm : 50
      const distKmRaw = haversineKm(candidate.lat, candidate.lng, job.lat, job.lng)
      const distKm = distKmRaw ?? 0
      locationScore = Math.max(0, 1 - distKm / radius)
    }

    // Factor 4: Work mode (10%)
    const modalityScore = candidate.preferredModalities.includes(job.modality) ? 1.0 : 0.0

    // Factor 5: Salary compatibility (5%)
    let salaryScore: number
    if (candidate.salaryExpectation == null) {
      salaryScore = 1.0 // No stated preference — any salary is acceptable
    } else if (job.salaryMin == null && job.salaryMax == null) {
      salaryScore = 1.0 // Open salary range — no constraint
    } else {
      const aboveMin = job.salaryMin == null || candidate.salaryExpectation >= job.salaryMin
      const belowMax = job.salaryMax == null || candidate.salaryExpectation <= job.salaryMax
      salaryScore = aboveMin && belowMax ? 1.0 : 0.0
    }

    return Math.round(
      (professionScore * 0.30 +
        skillsScore * 0.35 +
        locationScore * 0.20 +
        modalityScore * 0.10 +
        salaryScore * 0.05) *
        100,
    )
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
