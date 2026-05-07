import bcrypt from 'bcryptjs'
import { IHashPort } from '../../application/ports/hash.port'

export class BcryptAdapter implements IHashPort {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12)
  }

  async compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed)
  }
}
