export type ChatInitiator = 'MATCH' | 'CREDIT'

export interface Chat {
  id: string
  candidateId: string
  jobId: string
  companyId: string
  initiatedBy: ChatInitiator
  expiresAt: Date | null
  isActive: boolean
  createdAt: Date
}
