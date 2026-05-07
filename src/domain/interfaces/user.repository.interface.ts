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
}
