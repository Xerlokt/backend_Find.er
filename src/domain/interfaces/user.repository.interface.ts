import { User, UserRole } from '../entities/user.entity'

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  create(data: { email: string; passwordHash: string; role: UserRole }): Promise<User>
  updateGoogleId(id: string, googleId: string, avatarUrl?: string): Promise<User>
  findOrCreateGoogle(data: {
    googleId: string
    email: string
    avatarUrl?: string
    role: UserRole
  }): Promise<{ user: User; isNew: boolean }>

  // Admin-facing read methods — select-projected, never expose passwordHash or googleId
  findMany(opts: { skip: number; take: number }): Promise<UserPublic[]>
  findByIdPublic(id: string): Promise<UserPublic | null>
}

export type UserPublic = Omit<User, 'passwordHash' | 'googleId'>
