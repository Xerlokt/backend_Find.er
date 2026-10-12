import { User, UserRole } from '../entities/user.entity'

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  create(data: { email: string; passwordHash: string; role: UserRole }): Promise<User>
  markEmailVerified(id: string): Promise<void>
  /** Troca o email de uma conta (só usada enquanto não verificada). Email duplicado → CONFLICT 409. */
  updateEmail(id: string, email: string): Promise<void>
  /**
   * Apaga a conta com esse email se ela nunca verificou o email (e não é ADMIN), junto com a empresa
   * que ficaria sem recrutadores. Devolve true se apagou algo.
   */
  deleteUnverifiedByEmail(email: string): Promise<boolean>
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
