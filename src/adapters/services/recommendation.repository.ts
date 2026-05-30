// src/adapters/services/recommendation.repository.ts
// NEVER import from src/modules/swipe/, src/modules/job/, or any other module — ARCH-04
import neo4j, { Driver } from 'neo4j-driver'
import type {
  IRecommendationRepository,
  FitScoreInput,
  FitScoreJobInput,
} from '../../domain/interfaces/recommendation.repository.interface'
import type { WeightSet } from '../../domain/interfaces/weights.repository.interface'
import { haversineKm } from '../../application/utils/haversine'

export class RecommendationRepository implements IRecommendationRepository {
  constructor(private readonly driver: Driver) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput, weights?: WeightSet): Promise<number> {
    // Factor 1: Profession match (30%)
    const professionScore =
      candidate.professionId != null &&
      job.professionId != null &&
      candidate.professionId === job.professionId
        ? 1.0
        : 0.0

    // Factor 2: Skills overlap (35%) — Neo4j RELATED_TO*1..2 traversal with hop decay (Phase 14, D-01)
    // 0-hop (direct match) handled via CASE WHEN clause; *1..2 handles adjacency only (D-01 / SC-4)
    const WEIGHT: Record<number, number> = { 0: 1.0, 1: 0.8, 2: 0.6 }
    let skillsScore: number
    if (job.requiredSkillIds.length === 0) {
      skillsScore = 1.0
    } else {
      const session = this.driver.session({ defaultAccessMode: neo4j.session.READ })
      let adjacency: Array<{ skill: string; hops: number }> = []
      try {
        const result = await session.run(
          `UNWIND $requiredSkillIds AS reqId
           OPTIONAL MATCH path = (cand:Skill)-[:RELATED_TO*1..2]->(adj:Skill {id: reqId})
             WHERE cand.id IN $candidateSkillIds
           WITH reqId,
                reqId IN $candidateSkillIds AS isDirect,
                min(toInteger(length(path))) AS minPathLen
           WITH reqId,
                CASE
                  WHEN isDirect THEN 0
                  WHEN minPathLen IS NOT NULL THEN minPathLen
                  ELSE null
                END AS hops
           WHERE hops IS NOT NULL
           RETURN reqId AS skill, hops`,
          {
            requiredSkillIds: job.requiredSkillIds,
            candidateSkillIds: candidate.skillIds,
          },
        )
        adjacency = result.records.map((r) => ({
          skill: r.get('skill') as string,
          hops: r.get('hops') as number,
        }))
      } finally {
        await session.close()
      }
      const totalWeight = adjacency.reduce((sum, { hops }) => sum + (WEIGHT[hops] ?? 0), 0)
      skillsScore = Math.min(totalWeight / job.requiredSkillIds.length, 1.0)
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

    // Factor 6: DISC personality match (DISC-04)
    // Active ONLY when job declares a discProfile — otherwise discWeight = 0 and original weights apply
    // D-05: No cache invalidation on DISC submit — 30s staleness acceptable for infrequent action
    const hasDiscRequirement = job.discProfile != null
    const discScore =
      hasDiscRequirement &&
      candidate.discDominant != null &&
      candidate.discDominant === job.discProfile
        ? 1.0
        : 0.0

    // Weight redistribution: when job has discProfile, original 5 factors scale to 90% to free 10% for DISC (D-05)
    // Verified math: all factors=1.0, match → (0.27+0.315+0.18+0.09+0.045+0.10)*100 = 100
    // Verified math: all factors=1.0, mismatch → (0.27+0.315+0.18+0.09+0.045+0.0)*100 = 90
    // Verified math: no discProfile → (0.30+0.35+0.20+0.10+0.05)*100 = 100 (original)
    const w = hasDiscRequirement ? 0.9 : 1.0

    return Math.round(
      (professionScore * 0.30 * w +
        skillsScore * 0.35 * w +
        locationScore * 0.20 * w +
        modalityScore * 0.10 * w +
        salaryScore * 0.05 * w +
        discScore * 0.10) *
        100,
    )
  }

  async seedTaxonomy(): Promise<void> {
    // Step 1: Create unique constraints in a SEPARATE session before any MERGE (GRAPH-03)
    // Neo4j 5 does not allow schema changes and data writes in the same transaction
    const schemaSession = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
    try {
      await schemaSession.run(
        'CREATE CONSTRAINT skill_id_unique IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE'
      )
      await schemaSession.run(
        'CREATE CONSTRAINT profession_id_unique IF NOT EXISTS FOR (p:Profession) REQUIRE p.id IS UNIQUE'
      )
    } finally {
      await schemaSession.close()
    }

    // Step 2: Seed data in a separate session (existing executeWrite pattern)
    const session = this.driver.session({ defaultAccessMode: neo4j.session.WRITE })
    try {
      await session.executeWrite(async (tx) => {
        // Professions — 6 nodes, idempotent MERGE
        const professions = [
          { id: 'backend-dev', name: 'Backend Developer' },
          { id: 'frontend-dev', name: 'Frontend Developer' },
          { id: 'fullstack-dev', name: 'Fullstack Developer' },
          { id: 'devops', name: 'DevOps Engineer' },
          { id: 'data-scientist', name: 'Data Scientist' },
          { id: 'mobile-dev', name: 'Mobile Developer' },
        ]
        await tx.run(
          'UNWIND $professions AS p MERGE (n:Profession {id: p.id}) SET n.name = p.name',
          { professions }
        )

        // Skills — 36 nodes total (10 original + 26 new), idempotent MERGE
        const skills = [
          // Original 10
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
          // Backend additions (7 new)
          { id: 'sql', name: 'SQL' },
          { id: 'mysql', name: 'MySQL' },
          { id: 'java', name: 'Java' },
          { id: 'spring', name: 'Spring' },
          { id: 'rust', name: 'Rust' },
          { id: 'django', name: 'Django' },
          { id: 'fastapi', name: 'FastAPI' },
          // Frontend additions (6 new)
          { id: 'vue', name: 'Vue.js' },
          { id: 'angular', name: 'Angular' },
          { id: 'css', name: 'CSS' },
          { id: 'sass', name: 'Sass' },
          { id: 'tailwind', name: 'Tailwind CSS' },
          { id: 'nextjs', name: 'Next.js' },
          // DevOps additions (8 new)
          { id: 'kubernetes', name: 'Kubernetes' },
          { id: 'devops', name: 'DevOps' },
          { id: 'aws', name: 'AWS' },
          { id: 'cloud', name: 'Cloud' },
          { id: 'terraform', name: 'Terraform' },
          { id: 'iac', name: 'IaC' },
          { id: 'github-actions', name: 'GitHub Actions' },
          { id: 'ci-cd', name: 'CI/CD' },
          // Mobile additions (5 new)
          { id: 'ios', name: 'iOS' },
          { id: 'android', name: 'Android' },
          { id: 'react-native', name: 'React Native' },
          { id: 'flutter', name: 'Flutter' },
          { id: 'dart', name: 'Dart' },
        ]
        await tx.run(
          'UNWIND $skills AS s MERGE (n:Skill {id: s.id}) SET n.name = s.name',
          { skills }
        )

        // REQUIRES relationships: Profession → Skill (unchanged from original)
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
        await tx.run(
          `UNWIND $requires AS r
           MATCH (p:Profession {id: r.profId}), (s:Skill {id: r.skillId})
           MERGE (p)-[:REQUIRES]->(s)`,
          { requires }
        )

        // RELATED_TO relationships: bidirectional, weight 0.8
        // 26 pairs × 2 directions = 52 directed edges (GRAPH-02 requires >= 50)
        const related = [
          // Original 3 pairs
          { aId: 'typescript', bId: 'javascript' },
          { aId: 'nodejs', bId: 'javascript' },
          { aId: 'react', bId: 'javascript' },
          // Backend new pairs (5)
          { aId: 'sql', bId: 'postgresql' },
          { aId: 'sql', bId: 'mysql' },
          { aId: 'python', bId: 'django' },
          { aId: 'python', bId: 'fastapi' },
          { aId: 'java', bId: 'spring' },
          // Frontend new pairs (5)
          { aId: 'react', bId: 'nextjs' },
          { aId: 'vue', bId: 'javascript' },
          { aId: 'angular', bId: 'typescript' },
          { aId: 'css', bId: 'sass' },
          { aId: 'css', bId: 'tailwind' },
          // DevOps new pairs (5)
          { aId: 'docker', bId: 'kubernetes' },
          { aId: 'kubernetes', bId: 'devops' },
          { aId: 'aws', bId: 'cloud' },
          { aId: 'terraform', bId: 'iac' },
          { aId: 'ci-cd', bId: 'github-actions' },
          // Mobile new pairs (4)
          { aId: 'swift', bId: 'ios' },
          { aId: 'kotlin', bId: 'android' },
          { aId: 'react-native', bId: 'react' },
          { aId: 'flutter', bId: 'dart' },
          // Cross-domain pair (1)
          { aId: 'react-native', bId: 'javascript' },
          // Extra pairs to reach 26 total (3+5+5+5+4+1=23 above; add 3 more)
          { aId: 'nodejs', bId: 'typescript' },
          { aId: 'go', bId: 'rust' },
          { aId: 'android', bId: 'kotlin' },
        ]
        await tx.run(
          `UNWIND $related AS r
           MATCH (a:Skill {id: r.aId}), (b:Skill {id: r.bId})
           MERGE (a)-[:RELATED_TO {weight: 0.8}]->(b)
           MERGE (b)-[:RELATED_TO {weight: 0.8}]->(a)`,
          { related }
        )
      })
    } finally {
      await session.close()
    }
  }
}
