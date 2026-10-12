export type UserRole = 'CANDIDATE' | 'RECRUITER' | 'ADMIN'

export interface User {
  id: string
  email: string
  passwordHash: string | null
  googleId: string | null
  avatarUrl: string | null
  role: UserRole
  createdAt: Date
  emailVerifiedAt: Date | null
}
