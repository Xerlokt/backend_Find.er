export interface ITokenPort {
  signAccess(payload: { id: string; email: string; role: string; emailVerified: boolean }): string
  generateRefreshToken(): { raw: string; hashed: string }
  verifyAccess(token: string): { id: string; email: string; role: string; emailVerified: boolean }
}
