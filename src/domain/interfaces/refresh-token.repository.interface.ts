import { RefreshToken } from '../entities/refresh-token.entity'

export interface IRefreshTokenRepository {
  create(data: {
    tokenHash: string
    familyId: string
    userId: string
    expiresAt: Date
  }): Promise<RefreshToken>
  findByHash(tokenHash: string): Promise<RefreshToken | null>
  revoke(id: string): Promise<void>
  revokeFamily(familyId: string): Promise<void>
  revokeByHash(tokenHash: string): Promise<number>
}
