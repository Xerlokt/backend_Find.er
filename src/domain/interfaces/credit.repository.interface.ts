import { Swipe } from '../entities/swipe.entity'
import { Unlock } from '../entities/unlock.entity'
import { Job } from '../entities/job.entity'
import { Company } from '../entities/company.entity'
import { CandidateProfile } from '../entities/candidate.entity'

export interface RecruiterWithCompany {
  id: string
  userId: string
  companyId: string
  company: {
    id: string
    plan: string
    credits: number
  }
}

export interface UnlockResult {
  id: string
  companyId: string
  candidateId: string
  jobId: string
  unlockedAt: Date
  creditsCost: number
}

export interface ICreditRepository {
  findRecruiterByUserId(userId: string): Promise<RecruiterWithCompany | null>
  findJobById(id: string): Promise<Job | null>
  findSwipe(candidateId: string, jobId: string): Promise<Swipe | null>
  findUnlock(
    companyId: string,
    candidateId: string,
    jobId: string,
  ): Promise<Unlock | null>
  findCandidateProfileById(
    id: string,
  ): Promise<(CandidateProfile & { avatarUrl: string | null }) | null>
  executeUnlock(
    companyId: string,
    candidateId: string,
    jobId: string,
    creditsCost: number,
  ): Promise<UnlockResult>
  grantCredits(companyId: string, amount: number, reason: string): Promise<Company>
}
