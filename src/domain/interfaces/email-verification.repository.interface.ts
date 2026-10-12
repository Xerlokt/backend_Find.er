export interface EmailVerification {
  userId: string
  codeHash: string
  expiresAt: Date
  attempts: number
  lastSentAt: Date
}

export interface IEmailVerificationRepository {
  /** Um registro por usuário: um novo código substitui o anterior e zera as tentativas. */
  upsert(data: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>
  findByUserId(userId: string): Promise<EmailVerification | null>
  incrementAttempts(userId: string): Promise<void>
  deleteByUserId(userId: string): Promise<void>
}
