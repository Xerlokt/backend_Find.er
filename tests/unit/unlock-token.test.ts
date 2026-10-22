import { encodeUnlockToken, decodeUnlockToken } from '../../src/application/utils/unlock-token'

describe('unlock-token', () => {
  const candidateId = '3f1c2b1e-6a0e-4a52-9b6f-0e9a2a6d9c11'
  const jobId = '8a7d9a3c-2f19-4f35-b1f6-5c1d4c8e7a22'

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret'
  })

  it('round-trips the candidate id for the same job', () => {
    const token = encodeUnlockToken(candidateId, jobId)
    expect(decodeUnlockToken(token, jobId)).toBe(candidateId)
  })

  it('does not expose the candidate id in the token', () => {
    const token = encodeUnlockToken(candidateId, jobId)
    expect(token).not.toContain(candidateId)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('is not deterministic (random IV) but always decodes', () => {
    const a = encodeUnlockToken(candidateId, jobId)
    const b = encodeUnlockToken(candidateId, jobId)
    expect(a).not.toBe(b)
    expect(decodeUnlockToken(b, jobId)).toBe(candidateId)
  })

  it('rejects a token used on a different job', () => {
    const token = encodeUnlockToken(candidateId, jobId)
    expect(decodeUnlockToken(token, 'another-job-id')).toBeNull()
  })

  it('rejects a tampered token', () => {
    const token = encodeUnlockToken(candidateId, jobId)
    const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA')
    expect(decodeUnlockToken(tampered, jobId)).toBeNull()
  })

  it('rejects a token made with another secret', () => {
    const token = encodeUnlockToken(candidateId, jobId)
    process.env.JWT_SECRET = 'other-secret'
    expect(decodeUnlockToken(token, jobId)).toBeNull()
  })

  it('returns null for garbage and for a raw uuid', () => {
    expect(decodeUnlockToken('not-a-token', jobId)).toBeNull()
    expect(decodeUnlockToken(candidateId, jobId)).toBeNull()
    expect(decodeUnlockToken('', jobId)).toBeNull()
  })
})
