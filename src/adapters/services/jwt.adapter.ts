import { FastifyInstance } from 'fastify'
import { randomBytes, createHash } from 'crypto'
import { ITokenPort } from '../../application/ports/token.port'

export class JwtAdapter implements ITokenPort {
  constructor(private readonly app: FastifyInstance) {}

  signAccess(payload: { id: string; email: string; role: string; emailVerified: boolean }): string {
    return this.app.jwt.sign(payload, { expiresIn: '15m' })
  }

  generateRefreshToken(): { raw: string; hashed: string } {
    const raw = randomBytes(32).toString('hex')
    const hashed = createHash('sha256').update(raw).digest('hex')
    return { raw, hashed }
  }

  verifyAccess(token: string): { id: string; email: string; role: string; emailVerified: boolean } {
    return this.app.jwt.verify(token)
  }
}
