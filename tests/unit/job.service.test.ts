import { JobService } from '../../src/modules/job/job.service'
import { JobRepository } from '../../src/modules/job/job.repository'
import { AppError } from '../../src/shared/errors/AppError'

// Mock do JobRepository — sem DB em testes unitários
const makeRepo = (): jest.Mocked<JobRepository> => ({
  create: jest.fn(),
  findJobById: jest.fn(),
  update: jest.fn(),
  findByRecruiterId: jest.fn(),
  findRecruiterProfileByUserId: jest.fn(),
  deactivateExpiredJobs: jest.fn(),
} as unknown as jest.Mocked<JobRepository>)

const makeProfile = (overrides: Partial<{ id: string; userId: string; companyId: string }> = {}) => ({
  id: overrides.id ?? 'profile-1',
  userId: overrides.userId ?? 'user-1',
  companyId: overrides.companyId ?? 'company-1',
})

const makeJob = (overrides: Partial<{ id: string; recruiterId: string; title: string; isActive: boolean }> = {}) => ({
  id: overrides.id ?? 'job-1',
  recruiterId: overrides.recruiterId ?? 'profile-1',
  companyId: 'company-1',
  title: overrides.title ?? 'Backend Developer',
  description: 'We need a backend dev',
  professionId: 'backend-dev',
  modality: 'REMOTE' as const,
  requiredSkills: ['Node.js'],
  isActive: overrides.isActive ?? true,
  expiresAt: new Date(Date.now() + 86400000),
  createdAt: new Date(),
  salaryMin: null,
  salaryMax: null,
  lat: null,
  lng: null,
})

describe('JobService', () => {
  let repo: jest.Mocked<JobRepository>
  let service: JobService

  beforeEach(() => {
    repo = makeRepo()
    service = new JobService(repo)
    jest.clearAllMocks()
  })

  describe('createJob', () => {
    it('lança AppError 404 NOT_FOUND quando repo.findRecruiterProfileByUserId retorna null', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(null)

      await expect(
        service.createJob('user-1', {
          title: 'Dev',
          description: 'desc',
          professionId: 'backend-dev',
          modality: 'REMOTE',
          requiredSkills: ['Node.js'],
          expiresAt: new Date(),
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })

      await expect(
        service.createJob('user-1', {
          title: 'Dev',
          description: 'desc',
          professionId: 'backend-dev',
          modality: 'REMOTE',
          requiredSkills: ['Node.js'],
          expiresAt: new Date(),
        })
      ).rejects.toBeInstanceOf(AppError)

      expect(repo.create).not.toHaveBeenCalled()
    })

    it('chama repo.create(profileId, data) e retorna resultado quando perfil existe', async () => {
      const profile = makeProfile()
      const job = makeJob()
      const data = {
        title: 'Backend Developer',
        description: 'We need a backend dev',
        professionId: 'backend-dev',
        modality: 'REMOTE' as const,
        requiredSkills: ['Node.js'],
        expiresAt: new Date(),
      }

      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.create.mockResolvedValue(job as any)

      const result = await service.createJob('user-1', data)

      expect(repo.findRecruiterProfileByUserId).toHaveBeenCalledWith('user-1')
      expect(repo.create).toHaveBeenCalledWith(profile.id, { ...data, companyId: profile.companyId })
      expect(result).toEqual(job)
    })

    it('NUNCA lê recruiterId do body — deriva do profile (prevenção de IDOR)', async () => {
      const profile = makeProfile({ id: 'real-profile-id' })
      const job = makeJob({ recruiterId: 'real-profile-id' })
      const data = {
        title: 'Dev',
        description: 'desc',
        professionId: 'backend-dev',
        modality: 'REMOTE' as const,
        requiredSkills: ['Node.js'],
        expiresAt: new Date(),
      }

      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.create.mockResolvedValue(job as any)

      await service.createJob('user-1', data)

      // O primeiro argumento de create deve ser o profile.id derivado do userId JWT
      const [calledRecruiterId] = repo.create.mock.calls[0]
      expect(calledRecruiterId).toBe('real-profile-id')
    })
  })

  describe('updateJob', () => {
    it('lança AppError 404 NOT_FOUND quando job não existe', async () => {
      const profile = makeProfile()
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findJobById.mockResolvedValue(null)

      await expect(
        service.updateJob('user-1', 'non-existent-job', { title: 'New Title' })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })

      expect(repo.update).not.toHaveBeenCalled()
    })

    it('lança AppError 403 FORBIDDEN quando job.recruiterId !== recruiterProfile.id', async () => {
      const profile = makeProfile({ id: 'profile-1' })
      const job = makeJob({ recruiterId: 'profile-2' }) // outro recruiter
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findJobById.mockResolvedValue(job as any)

      await expect(
        service.updateJob('user-1', 'job-1', { title: 'Hack' })
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })

      expect(repo.update).not.toHaveBeenCalled()
    })

    it('chama repo.update(jobId, data) e retorna resultado quando ownership confirmado', async () => {
      const profile = makeProfile({ id: 'profile-1' })
      const job = makeJob({ recruiterId: 'profile-1' })
      const updatedJob = makeJob({ title: 'Updated Title' })
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findJobById.mockResolvedValue(job as any)
      repo.update.mockResolvedValue(updatedJob as any)

      const result = await service.updateJob('user-1', 'job-1', { title: 'Updated Title' })

      expect(repo.update).toHaveBeenCalledWith('job-1', { title: 'Updated Title' })
      expect(result).toEqual(updatedJob)
    })
  })

  describe('deactivateJob', () => {
    it('lança AppError 404 NOT_FOUND quando job não existe', async () => {
      const profile = makeProfile()
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findJobById.mockResolvedValue(null)

      await expect(
        service.deactivateJob('user-1', 'non-existent-job')
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    })

    it('lança AppError 403 FORBIDDEN quando recruiter não é dono do job', async () => {
      const profile = makeProfile({ id: 'profile-1' })
      const job = makeJob({ recruiterId: 'profile-2' })
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findJobById.mockResolvedValue(job as any)

      await expect(
        service.deactivateJob('user-1', 'job-1')
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })

      expect(repo.update).not.toHaveBeenCalled()
    })

    it('chama repo.update(jobId, { isActive: false }) quando ownership confirmado', async () => {
      const profile = makeProfile({ id: 'profile-1' })
      const job = makeJob({ recruiterId: 'profile-1', isActive: true })
      const deactivatedJob = makeJob({ isActive: false })
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findJobById.mockResolvedValue(job as any)
      repo.update.mockResolvedValue(deactivatedJob as any)

      const result = await service.deactivateJob('user-1', 'job-1')

      expect(repo.update).toHaveBeenCalledWith('job-1', { isActive: false })
      expect(result).toEqual(deactivatedJob)
    })
  })

  describe('listJobsByRecruiter', () => {
    it('lança AppError 404 NOT_FOUND quando usuário não tem perfil de recruiter', async () => {
      repo.findRecruiterProfileByUserId.mockResolvedValue(null)

      await expect(
        service.listJobsByRecruiter('user-1')
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })

      expect(repo.findByRecruiterId).not.toHaveBeenCalled()
    })

    it('chama repo.findByRecruiterId(profileId) e retorna array quando perfil existe', async () => {
      const profile = makeProfile({ id: 'profile-1' })
      const jobs = [makeJob(), makeJob({ id: 'job-2' })]
      repo.findRecruiterProfileByUserId.mockResolvedValue(profile as any)
      repo.findByRecruiterId.mockResolvedValue(jobs as any)

      const result = await service.listJobsByRecruiter('user-1')

      expect(repo.findRecruiterProfileByUserId).toHaveBeenCalledWith('user-1')
      expect(repo.findByRecruiterId).toHaveBeenCalledWith('profile-1')
      expect(result).toEqual(jobs)
    })
  })

  describe('getJobById', () => {
    it('lança AppError 404 NOT_FOUND quando job não existe', async () => {
      repo.findJobById.mockResolvedValue(null)

      await expect(
        service.getJobById('non-existent-job')
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    })

    it('retorna o job quando ele existe', async () => {
      const job = makeJob()
      repo.findJobById.mockResolvedValue(job as any)

      const result = await service.getJobById('job-1')

      expect(repo.findJobById).toHaveBeenCalledWith('job-1')
      expect(result).toEqual(job)
    })
  })
})
