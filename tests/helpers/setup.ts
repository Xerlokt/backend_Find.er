// CRITICAL: Override REDIS_URL before any module initializes the Redis singleton
// getRedisClient() reads REDIS_URL inside its lazy-init guard — this override must happen first
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6380'

import { execSync } from 'child_process'
import { prisma } from '../../src/infrastructure/database/prisma'
import { getRedisClient } from '../../src/infrastructure/database/redis'

beforeAll(async () => {
  // Override DATABASE_URL to point at test DB
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST! },
    stdio: 'inherit',
  })
})

afterAll(async () => {
  await prisma.$disconnect()
  const redis = getRedisClient()
  await redis.quit()
})

afterEach(async () => {
  // Flush Redis test DB between tests — prevents cache pollution (RESEARCH Pitfall 1)
  const redis = getRedisClient()
  await redis.flushdb()

  // Delete in FK-safe order: children before parents
  await prisma.refreshToken.deleteMany()   // RefreshToken before User (FK)
  await prisma.message.deleteMany()
  await prisma.chat.deleteMany()
  await prisma.swipe.deleteMany()
  await prisma.unlock.deleteMany()
  await prisma.creditTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.recruiterProfile.deleteMany()
  await prisma.company.deleteMany()
  await prisma.discResult.deleteMany()     // FK: discResult → candidateProfile (must delete first)
  await prisma.candidateProfile.deleteMany()
  await prisma.user.deleteMany()
})
