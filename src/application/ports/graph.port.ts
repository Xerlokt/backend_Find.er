export interface IGraphPort {
  syncCandidate(candidate: {
    id: string
    skills: string[]
    professionId: string
  }): Promise<void>
  syncJob(job: {
    id: string
    requiredSkills: string[]
    professionId: string
  }): Promise<void>
  calculateFitScore(candidateId: string, jobId: string): Promise<number>
  getRecommendedJobs(candidateId: string, limit: number): Promise<string[]>
  seedTaxonomy(): Promise<void>
}
