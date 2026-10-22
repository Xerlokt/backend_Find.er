import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const IV_LEN = 12
const TAG_LEN = 16

// Stateless opaque reference to a candidate within one job. The recruiter site gets this
// instead of the real candidateId for censored cards, so the identity can't be derived from
// the response but the server can still resolve it on unlock. Bound to the job via AAD.
function key(): Buffer {
  return createHash('sha256').update(`unlock-token:${process.env.JWT_SECRET ?? ''}`).digest()
}

export function encodeUnlockToken(candidateId: string, jobId: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(jobId))
  const enc = Buffer.concat([cipher.update(candidateId, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url')
}

export function decodeUnlockToken(token: string, jobId: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length <= IV_LEN + TAG_LEN) return null
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, IV_LEN))
    decipher.setAAD(Buffer.from(jobId))
    decipher.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN))
    return Buffer.concat([decipher.update(raw.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
