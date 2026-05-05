export interface RefreshToken {
  id: string
  tokenHash: string
  familyId: string
  userId: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}
