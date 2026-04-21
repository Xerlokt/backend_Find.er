import '../helpers/setup'
import { prisma } from '../../src/shared/db/prisma'
import { JobRepository } from '../../src/modules/job/job.repository'
import { JobService } from '../../src/modules/job/job.service'
import { createUser, createCompany, createJob } from '../helpers/factories'
import bcrypt from 'bcryptjs'

// Helper: cria usuário RECRUITER + RecruiterProfile associado à empresa
async function createRecruiterWithProfile(companyId: string, emailSuffix: string) {
  const passwordHash = await bcrypt.hash('password123', 12)
  const user = await createUser({ role: 'RECRUITER', email: `recruiter-${emailSuffix}@test.com`, passwordHash })
  const profile = await prisma.recruiterProfile.create({
    data: { userId: user.id, companyId },
  })
  return { user, profile }
}

describe('JobService — integration', () => {
  let repo: JobRepository
  let service: JobService

  beforeEach(() => {
    repo = new JobRepository()
    service = new JobService(repo)
  })

  // ── createJob ──────────────────────────────────────────────────────────────

  describe('createJob', () => {
    it('201: creates job and persists recruiterId from profile (not body)', async () => {
      const company = await createCompany()
      const { user, profile } = await createRecruiterWithProfile(company.id, 'create1')

      const job = await service.createJob(user.id, {
        title: 'Senior Dev',
        description: 'desc',
        professionId: 'backend-dev',
        modality: 'REMOTE',
        requiredSkills: ['Node.js'],
        expiresAt: new Date(Date.now() + 86400000),
      })

      // recruiterId must come from profile lookup, not from body (IDOR prevention)
      expect(job.recruiterId).toBe(profile.id)
      expect(job.title).toBe('Senior Dev')
      expect(job.companyId).toBe(company.id)
    })

    it('404: throws when user has no recruiter profile', async () => {
      const userWithNoProfile = await createUser({ role: 'RECRUITER', email: 'no-profile@test.com' })

      await expect(
        service.createJob(userWithNoProfile.id, {
          title: 'Dev',
          description: 'desc',
          professionId: 'backend-dev',
          modality: 'REMOTE',
          requiredSkills: ['Node.js'],
          expiresAt: new Date(Date.now() + 86400000),
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    })
  })

  // ── updateJob ──────────────────────────────────────────────────────────────

  describe('updateJob', () => {
    it('200: updates job fields when recruiter owns the job', async () => {
      const company = await createCompany()
      const { user, profile } = await createRecruiterWithProfile(company.id, 'update1')
      const job = await createJob(company.id, profile.id)

      const updated = await service.updateJob(user.id, job.id, { title: 'Updated Title' })

      expect(updated.title).toBe('Updated Title')
    })

    it("403: throws when recruiter tries to update another recruiter's job", async () => {
      const company = await createCompany()
      const { profile: profile1 } = await createRecruiterWithProfile(company.id, 'owner1')
      const { user: user2 } = await createRecruiterWithProfile(company.id, 'other1')

      const job = await createJob(company.id, profile1.id)

      await expect(
        service.updateJob(user2.id, job.id, { title: 'Hack' })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
    })

    it('404: throws when job does not exist', async () => {
      const company = await createCompany()
      const { user } = await createRecruiterWithProfile(company.id, 'notfound1')

      await expect(
        service.updateJob(user.id, '00000000-0000-0000-0000-000000000000', {})
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    })
  })

  // ── deactivateJob ──────────────────────────────────────────────────────────

  describe('deactivateJob', () => {
    it('200: sets isActive=false when recruiter owns the job', async () => {
      const company = await createCompany()
      const { user, profile } = await createRecruiterWithProfile(company.id, 'deact1')
      const job = await createJob(company.id, profile.id, { isActive: true })

      await service.deactivateJob(user.id, job.id)

      const persisted = await prisma.job.findUnique({ where: { id: job.id } })
      expect(persisted?.isActive).toBe(false)
    })

    it("403: throws when recruiter tries to deactivate another recruiter's job", async () => {
      const company = await createCompany()
      const { profile: profile1 } = await createRecruiterWithProfile(company.id, 'deact-owner')
      const { user: user2 } = await createRecruiterWithProfile(company.id, 'deact-other')

      const job = await createJob(company.id, profile1.id)

      await expect(
        service.deactivateJob(user2.id, job.id)
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
    })
  })

  // ── listJobsByRecruiter ────────────────────────────────────────────────────

  describe('listJobsByRecruiter', () => {
    it('returns only jobs belonging to the authenticated recruiter', async () => {
      const company = await createCompany()
      const { user: user1, profile: profile1 } = await createRecruiterWithProfile(company.id, 'list1')
      const { profile: profile2 } = await createRecruiterWithProfile(company.id, 'list2')

      // 2 jobs for recruiter1, 1 for recruiter2
      await createJob(company.id, profile1.id)
      await createJob(company.id, profile1.id, { professionId: 'frontend-dev' })
      await createJob(company.id, profile2.id)

      const jobs = await service.listJobsByRecruiter(user1.id)

      expect(jobs).toHaveLength(2)
      expect(jobs.every(j => j.recruiterId === profile1.id)).toBe(true)
    })
  })

  // ── deactivateExpiredJobs (repository method) ──────────────────────────────

  describe('deactivateExpiredJobs (repository method)', () => {
    it('marks expired active jobs as inactive', async () => {
      const company = await createCompany()
      const { profile } = await createRecruiterWithProfile(company.id, 'expired1')

      const pastDate = new Date(Date.now() - 2 * 86400000) // 2 days ago
      const futureDate = new Date(Date.now() + 2 * 86400000) // 2 days from now

      const expiredJob1 = await createJob(company.id, profile.id, { expiresAt: pastDate, isActive: true })
      const expiredJob2 = await createJob(company.id, profile.id, { expiresAt: pastDate, isActive: true })
      const activeJob = await createJob(company.id, profile.id, { expiresAt: futureDate, isActive: true })

      const count = await repo.deactivateExpiredJobs()

      expect(count).toBeGreaterThanOrEqual(2)

      const j1 = await prisma.job.findUnique({ where: { id: expiredJob1.id } })
      const j2 = await prisma.job.findUnique({ where: { id: expiredJob2.id } })
      const j3 = await prisma.job.findUnique({ where: { id: activeJob.id } })

      expect(j1?.isActive).toBe(false)
      expect(j2?.isActive).toBe(false)
      expect(j3?.isActive).toBe(true)
    })
  })
})
