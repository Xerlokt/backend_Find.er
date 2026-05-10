import { execSync } from 'child_process'
import { prisma } from '../../src/infrastructure/database/prisma'

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
})

afterEach(async () => {
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
  await prisma.candidateProfile.deleteMany()
  await prisma.user.deleteMany()
})
