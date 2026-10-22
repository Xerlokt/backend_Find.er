import { ICompanyRepository, JobStatsRow } from '../../../domain/interfaces/company.repository.interface'
import { assertCompanyRecruiter } from './assert-company-recruiter'

export interface JobStats extends JobStatsRow {
  /** likes / (likes + dislikes); null enquanto ninguém reagiu */
  likeRate: number | null
}

export interface CompanyStats {
  totals: { jobs: number; activeJobs: number; views: number; likes: number; dislikes: number }
  jobs: JobStats[]
}

export class GetCompanyStatsUseCase {
  constructor(private readonly repo: ICompanyRepository) {}

  async execute(userId: string, companyId: string): Promise<CompanyStats> {
    await assertCompanyRecruiter(this.repo, userId, companyId)
    const rows = await this.repo.getJobStats(companyId)
    const jobs = rows.map((r) => {
      const reacted = r.likes + r.dislikes
      return { ...r, likeRate: reacted === 0 ? null : r.likes / reacted }
    })
    const sum = (pick: (j: JobStats) => number) => jobs.reduce((acc, j) => acc + pick(j), 0)
    return {
      totals: {
        jobs: jobs.length,
        activeJobs: jobs.filter((j) => j.isActive).length,
        views: sum((j) => j.views),
        likes: sum((j) => j.likes),
        dislikes: sum((j) => j.dislikes),
      },
      jobs,
    }
  }
}
