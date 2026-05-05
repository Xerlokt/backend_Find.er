export interface ITokenPort {
  signAccess(payload: { id: string; role: string }): string
  generateRefreshToken(): { raw: string; hashed: string }
  verifyAccess(token: string): { id: string; role: string }
}
