import { prisma } from '../../src/shared/db/prisma'
import bcrypt from 'bcryptjs'
import { Modality, Role } from '@prisma/client'
import { createHash, randomBytes } from 'crypto'

export async function createUser(overrides: Partial<{
  email: string
  role: Role
  passwordHash: string
}> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      role: overrides.role ?? 'CANDIDATE',
      passwordHash: overrides.passwordHash ?? await bcrypt.hash('password123', 12),
    },
  })
}

export async function createCandidate(overrides: Partial<{
  email: string
  professionId: string
  skills: string[]
  preferredModalities: Modality[]
}> = {}) {
  const user = await createUser({ role: 'CANDIDATE', email: overrides.email })
  const profile = await prisma.candidateProfile.create({
    data: {
      userId: user.id,
      name: 'Test Candidate',
      professionId: overrides.professionId ?? 'backend-dev',
      skills: overrides.skills ?? ['Node.js', 'TypeScript'],
      preferredModalities: overrides.preferredModalities ?? ['REMOTE'],
      searchRadiusKm: 50,
    },
  })
  return { user, profile }
}

export async function createCompany(overrides: Partial<{
  name: string
  plan: string
  credits: number
}> = {}) {
  return prisma.company.create({
    data: {
      name: overrides.name ?? 'Test Company',
      plan: overrides.plan ?? 'FREE',
      credits: overrides.credits ?? 0,
    },
  })
}

export async function createJob(
  companyId: string,
  recruiterId: string,
  overrides: Partial<{
    professionId: string
    modality: Modality
    requiredSkills: string[]
    isActive: boolean
    expiresAt: Date
  }> = {}
) {
  return prisma.job.create({
    data: {
      companyId,
      recruiterId,
      title: 'Backend Developer',
      description: 'We need a backend dev',
      professionId: overrides.professionId ?? 'backend-dev',
      modality: overrides.modality ?? 'REMOTE',
      requiredSkills: overrides.requiredSkills ?? ['Node.js', 'TypeScript'],
      isActive: overrides.isActive ?? true,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  })
}

export async function createRefreshToken(userId: string, overrides: Partial<{
  tokenHash: string
  familyId: string
  expiresAt: Date
  revokedAt: Date | null
}> = {}) {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = overrides.tokenHash
    ?? createHash('sha256').update(rawToken).digest('hex')

  const stored = await prisma.refreshToken.create({
    data: {
      tokenHash,
      familyId: overrides.familyId ?? randomBytes(16).toString('hex'),
      userId,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: overrides.revokedAt ?? null,
    },
  })
  return { stored, rawToken }
}

export async function createSwipe(
  candidateId: string,
  jobId: string,
  overrides: Partial<{
    direction: 'LIKE' | 'DISLIKE'
  }> = {}
) {
  return prisma.swipe.create({
    data: {
      candidateId,
      jobId,
      direction: overrides.direction ?? 'LIKE',
    },
  })
}

export async function createUnlock(
  companyId: string,
  candidateId: string,
  jobId: string,
  overrides: Partial<{ creditsCost: number }> = {}
) {
  return prisma.unlock.create({
    data: {
      companyId,
      candidateId,
      jobId,
      creditsCost: overrides.creditsCost ?? 2,
    },
  })
}

export async function createChat(
  candidateId: string,
  jobId: string,
  companyId: string,
  overrides: Partial<{
    initiatedBy: 'MATCH' | 'CREDIT'
    isActive: boolean
  }> = {}
) {
  return prisma.chat.create({
    data: {
      candidateId,
      jobId,
      companyId,
      initiatedBy: overrides.initiatedBy ?? 'MATCH',
      isActive: overrides.isActive ?? true,
    },
  })
}

export async function createMessage(
  chatId: string,
  senderId: string,
  overrides: Partial<{
    content: string
    readAt: Date | null
  }> = {}
) {
  return prisma.message.create({
    data: {
      chatId,
      senderId,
      content: overrides.content ?? 'Test message',
      readAt: overrides.readAt ?? null,
    },
  })
}
