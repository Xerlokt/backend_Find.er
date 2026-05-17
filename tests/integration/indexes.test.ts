import '../helpers/setup'
import { prisma } from '../../src/infrastructure/database/prisma'

describe('SCALE-04: PostgreSQL index scans', () => {
  // disable_seqscan forces the planner to use indexes regardless of table size (needed on empty test DB)
  beforeEach(async () => { await prisma.$executeRawUnsafe('SET enable_seqscan = off') })
  afterEach(async () => { await prisma.$executeRawUnsafe('SET enable_seqscan = on') })

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
