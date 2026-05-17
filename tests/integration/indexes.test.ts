import '../helpers/setup'
import { prisma } from '../../src/infrastructure/database/prisma'

describe('SCALE-04: PostgreSQL index scans', () => {
  it('Swipe.candidateId uses index scan', async () => {
    const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN SELECT * FROM "Swipe" WHERE "candidateId" = '00000000-0000-0000-0000-000000000001'
    `
    const plan = result.map((r) => r['QUERY PLAN']).join('\n')
    expect(plan).toMatch(/Index/)
  })

  it('Swipe.jobId uses index scan', async () => {
    const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN SELECT * FROM "Swipe" WHERE "jobId" = '00000000-0000-0000-0000-000000000001'
    `
    const plan = result.map((r) => r['QUERY PLAN']).join('\n')
    expect(plan).toMatch(/Index/)
  })

  it('Job.[isActive, expiresAt] uses index scan', async () => {
    const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN SELECT * FROM "Job" WHERE "isActive" = true AND "expiresAt" > NOW()
    `
    const plan = result.map((r) => r['QUERY PLAN']).join('\n')
    expect(plan).toMatch(/Index/)
  })

  it('CandidateProfile.professionId uses index scan', async () => {
    const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN SELECT * FROM "CandidateProfile" WHERE "professionId" = 'backend-dev'
    `
    const plan = result.map((r) => r['QUERY PLAN']).join('\n')
    expect(plan).toMatch(/Index/)
  })
})
