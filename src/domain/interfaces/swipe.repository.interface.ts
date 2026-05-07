import { Swipe, SwipeDirection } from '../entities/swipe.entity'
import { Job } from '../entities/job.entity'
import { CandidateProfile } from '../entities/candidate.entity'
import { RecruiterProfile } from '../entities/recruiter.entity'

export interface SwipeWithCandidateInfo {
  id: string
  candidateId: string
  jobId: string
  direction: SwipeDirection
  swipedAt: Date
  candidate: CandidateProfile & { avatarUrl: string | null }
}

export interface ISwipeRepository {
  createSwipe(data: {
    candidateId: string
    jobId: string
    direction: SwipeDirection
  }): Promise<Swipe>
  findJobById(id: string): Promise<Job | null>
  findCandidateProfileByUserId(userId: string): Promise<CandidateProfile | null>
  findRecruiterProfileByUserId(userId: string): Promise<RecruiterProfile | null>
  findFeedJobs(
    candidateId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Job[]>
  findSwipesByJobId(jobId: string): Promise<SwipeWithCandidateInfo[]>
  findUnlocksByJobAndCompany(jobId: string, companyId: string): Promise<Set<string>>
}
