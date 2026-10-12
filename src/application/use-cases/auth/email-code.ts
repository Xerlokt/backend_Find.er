import { createHmac, randomInt, timingSafeEqual } from 'crypto'

export const CODE_TTL_MINUTES = 10
export const MAX_ATTEMPTS = 5
export const RESEND_COOLDOWN_SECONDS = 60

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashCode(userId: string, code: string): string {
  return createHmac('sha256', process.env.JWT_SECRET ?? '').update(`${userId}:${code}`).digest('hex')
}

export function codesMatch(expectedHash: string, userId: string, code: string): boolean {
  const a = Buffer.from(expectedHash, 'hex')
  const b = Buffer.from(hashCode(userId, code), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
